/**
 * Nota fiscal de serviço (NFS-e) de cada pagamento aprovado.
 *
 * A emissão é feita por um provedor — o Focus NFe (api.focusnfe.com.br),
 * que fala com a prefeitura por nós. Tudo que identifica o emitente vem do
 * ambiente (CNPJ, inscrição municipal, município, item de serviço,
 * alíquota); sem isso configurado, nada é emitido e o pagamento fica com
 * `nf_status = 'pendente'` para tratar à mão.
 *
 * O fluxo é assíncrono: enviamos (202, "processando"), depois consultamos
 * até a prefeitura autorizar — o cron diário faz isso e também reenvia o
 * que ficou para trás. Quando autoriza, o cliente recebe o link por e-mail.
 */
import { supabaseServer } from '../lib/supabaseServer';
import type { Pagamento } from './assinaturas';
import { layoutEmail, escapeHtml, p, tabela } from './email-layout';
import { NOME_DO_PLANO, NOME_DO_CICLO, formatarPreco } from '../shared/planos';

export interface AmbienteNfse {
  NFSE_PROVEDOR?: string;
  FOCUS_NFE_TOKEN?: string;
  /** 'producao' | 'homologacao' (padrão) */
  FOCUS_NFE_AMBIENTE?: string;
  NFSE_PRESTADOR_CNPJ?: string;
  NFSE_PRESTADOR_IM?: string;
  /** Código IBGE do município do prestador (Natal/RN = 2408102). */
  NFSE_CODIGO_MUNICIPIO?: string;
  /** Item da lista de serviços (LC 116), ex.: "01.05" (licenciamento de software) ou "01.07" (suporte técnico). */
  NFSE_ITEM_LISTA_SERVICO?: string;
  /** Código de tributação do município, quando a prefeitura exige. */
  NFSE_CODIGO_TRIBUTARIO_MUNICIPIO?: string;
  /** Alíquota do ISS em %, ex.: "2" ou "5". */
  NFSE_ALIQUOTA?: string;
  /** 'true' quando a empresa é do Simples Nacional. */
  NFSE_OPTANTE_SIMPLES?: string;
  /** '1' = tributação no município (padrão). */
  NFSE_NATUREZA_OPERACAO?: string;
}

export interface ConfiguracaoNfse {
  token: string;
  base: string;
  prestador: { cnpj: string; inscricao_municipal: string; codigo_municipio: string };
  item_lista_servico: string;
  codigo_tributario_municipio: string | null;
  aliquota: number;
  optante_simples_nacional: boolean;
  natureza_operacao: string;
}

/** A configuração inteira, ou null se falta algo — aí não se emite. */
export function configuracaoNfse(env: AmbienteNfse = process.env as AmbienteNfse): ConfiguracaoNfse | null {
  if ((env.NFSE_PROVEDOR ?? 'focus') !== 'focus') return null;
  const token = (env.FOCUS_NFE_TOKEN ?? '').trim();
  const cnpj = (env.NFSE_PRESTADOR_CNPJ ?? '').replace(/\D/g, '');
  const im = (env.NFSE_PRESTADOR_IM ?? '').trim();
  const mun = (env.NFSE_CODIGO_MUNICIPIO ?? '').replace(/\D/g, '');
  const item = (env.NFSE_ITEM_LISTA_SERVICO ?? '').trim();
  const aliquota = Number(env.NFSE_ALIQUOTA ?? '');
  if (!token || cnpj.length !== 14 || !im || mun.length !== 7 || !item || !Number.isFinite(aliquota)) return null;
  return {
    token,
    base: (env.FOCUS_NFE_AMBIENTE ?? 'homologacao') === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br',
    prestador: { cnpj, inscricao_municipal: im, codigo_municipio: mun },
    item_lista_servico: item,
    codigo_tributario_municipio: (env.NFSE_CODIGO_TRIBUTARIO_MUNICIPIO ?? '').trim() || null,
    aliquota,
    optante_simples_nacional: (env.NFSE_OPTANTE_SIMPLES ?? 'true') !== 'false',
    natureza_operacao: (env.NFSE_NATUREZA_OPERACAO ?? '1').trim(),
  };
}

export function nfseConfigurada(env?: AmbienteNfse): boolean {
  return configuracaoNfse(env) !== null;
}

/** "Stok Aí — plano Profissional (mensal), período 14/09/2026 a 14/10/2026. Pagamento Pix #123." */
export function discriminacao(pg: Pagamento): string {
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
  const plano = pg.plano ? NOME_DO_PLANO[pg.plano] : 'assinatura';
  const ciclo = pg.ciclo ? ` (${NOME_DO_CICLO[pg.ciclo].toLowerCase()})` : '';
  const periodo = pg.periodo_de && pg.periodo_ate ? `, período de ${fmt.format(new Date(pg.periodo_de))} a ${fmt.format(new Date(pg.periodo_ate))}` : '';
  const metodo = pg.metodo === 'cartao' ? 'cartão' : pg.metodo;
  return `Licença de uso do Stok Aí (software de controle de estoque) — plano ${plano}${ciclo}${periodo}. Pagamento por ${metodo}, Mercado Pago #${pg.mp_payment_id ?? pg.id}.`;
}

/** O corpo que o Focus NFe recebe para esta nota. */
export function corpoDaNfse(pg: Pagamento, cfg: ConfiguracaoNfse, agora: Date = new Date()): Record<string, unknown> | null {
  const pagador = (pg.pagador ?? {}) as { nome?: string; email?: string; tipoDoc?: string; doc?: string; endereco?: { cep?: string; rua?: string; numero?: string; bairro?: string; cidade?: string; uf?: string } | null };
  const doc = String(pagador.doc ?? '').replace(/\D/g, '');
  if (!pagador.nome || (doc.length !== 11 && doc.length !== 14)) return null;
  const tomador: Record<string, unknown> = { razao_social: pagador.nome, email: pagador.email ?? undefined };
  if (doc.length === 14) tomador.cnpj = doc;
  else tomador.cpf = doc;
  const e = pagador.endereco;
  if (e?.cep && e.rua && e.numero && e.bairro && e.uf) {
    tomador.endereco = { logradouro: e.rua, numero: e.numero, bairro: e.bairro, uf: e.uf, cep: String(e.cep).replace(/\D/g, '') };
  }
  return {
    data_emissao: agora.toISOString(),
    natureza_operacao: cfg.natureza_operacao,
    optante_simples_nacional: cfg.optante_simples_nacional,
    prestador: cfg.prestador,
    tomador,
    servico: {
      aliquota: cfg.aliquota,
      discriminacao: discriminacao(pg),
      iss_retido: 'false',
      item_lista_servico: cfg.item_lista_servico,
      ...(cfg.codigo_tributario_municipio ? { codigo_tributario_municipio: cfg.codigo_tributario_municipio } : {}),
      valor_servicos: Math.round(Number(pg.valor) * 100) / 100,
    },
  };
}

async function focus(cfg: ConfiguracaoNfse, caminho: string, init: RequestInit = {}): Promise<{ status: number; corpo: any }> {
  const r = await fetch(`${cfg.base}${caminho}`, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.token}:`).toString('base64')}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
  const texto = await r.text();
  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = { raw: texto };
  }
  return { status: r.status, corpo };
}

export type ResultadoNfse = { situacao: 'processando' | 'emitida' | 'erro'; numero?: string | null; url?: string | null; erro?: string | null };

/** Traduz a resposta do Focus (envio ou consulta) para o que gravamos. */
export function traduzirFocus(status: number, corpo: any): ResultadoNfse {
  const s = String(corpo?.status ?? '');
  if (s === 'autorizado') return { situacao: 'emitida', numero: corpo?.numero ?? null, url: corpo?.url ?? corpo?.url_danfse ?? corpo?.caminho_xml_nota_fiscal ?? null };
  if (s === 'processando_autorizacao' || status === 202) return { situacao: 'processando' };
  if (s === 'erro_autorizacao' || status >= 400) {
    const erros = Array.isArray(corpo?.erros) ? corpo.erros.map((e: any) => e?.mensagem ?? e?.codigo ?? '').filter(Boolean).join('; ') : '';
    return { situacao: 'erro', erro: erros || corpo?.mensagem || corpo?.mensagem_sefaz || corpo?.codigo || `HTTP ${status}` };
  }
  if (s === 'cancelado') return { situacao: 'erro', erro: 'nota cancelada no provedor' };
  return { situacao: 'processando' };
}

/** Envia a nota de um pagamento aprovado. Idempotente pela referência (o id do pagamento). */
export async function emitirNota(pg: Pagamento, cfg: ConfiguracaoNfse | null = configuracaoNfse()): Promise<ResultadoNfse | null> {
  if (!cfg) return null;
  if (pg.status !== 'aprovado') return null;
  const ref = pg.nf_ref ?? pg.id;
  let r: ResultadoNfse;
  if (!pg.nf_ref) {
    const corpo = corpoDaNfse(pg, cfg);
    if (!corpo) {
      await supabaseServer.from('pagamentos').update({ nf_status: 'erro', nf_erro: 'sem CPF/CNPJ ou nome do tomador' }).eq('id', pg.id);
      return { situacao: 'erro', erro: 'sem CPF/CNPJ ou nome do tomador' };
    }
    const resp = await focus(cfg, `/v2/nfse?ref=${encodeURIComponent(ref)}`, { method: 'POST', body: JSON.stringify(corpo) });
    r = traduzirFocus(resp.status, resp.corpo);
  } else {
    const resp = await focus(cfg, `/v2/nfse/${encodeURIComponent(ref)}`);
    r = traduzirFocus(resp.status, resp.corpo);
  }
  await supabaseServer
    .from('pagamentos')
    .update({
      nf_ref: ref,
      nf_status: r.situacao === 'emitida' ? 'emitida' : r.situacao === 'erro' ? 'erro' : 'pendente',
      nf_numero: r.numero ?? pg.nf_numero ?? null,
      nf_url: r.url ?? pg.nf_url ?? null,
      nf_erro: r.situacao === 'erro' ? (r.erro ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pg.id);
  return r;
}

/** Os pagamentos aprovados sem nota emitida — para o cron tentar de novo. */
export async function pagamentosSemNota(limite = 50): Promise<Pagamento[]> {
  const { data, error } = await supabaseServer.from('pagamentos').select('*').eq('status', 'aprovado').or('nf_status.is.null,nf_status.eq.pendente').order('data', { ascending: true }).limit(limite);
  if (error) throw error;
  return (data || []) as Pagamento[];
}

/** O e-mail com a nota, para quem pagou. */
export function emailDaNota(pg: Pagamento, empresa: string): { subject: string; html: string } | null {
  const email = String((pg.pagador as any)?.email ?? '').trim();
  if (!email || !pg.nf_url) return null;
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
  return {
    subject: `Nota fiscal do Stok Aí — ${pg.plano ? NOME_DO_PLANO[pg.plano] : 'assinatura'}${pg.nf_numero ? ` nº ${pg.nf_numero}` : ''}`,
    html: layoutEmail({
      titulo: `Sua nota fiscal está pronta.`,
      corpo:
        p(`Obrigado, <strong>${escapeHtml(empresa)}</strong>. A nota fiscal de serviço do seu pagamento foi emitida.`) +
        tabela([
          ['Plano', pg.plano ? `${NOME_DO_PLANO[pg.plano]}${pg.ciclo ? ` (${NOME_DO_CICLO[pg.ciclo].toLowerCase()})` : ''}` : null],
          ['Valor', formatarPreco(Number(pg.valor))],
          ['Período', pg.periodo_de && pg.periodo_ate ? `${fmt.format(new Date(pg.periodo_de))} a ${fmt.format(new Date(pg.periodo_ate))}` : null],
          ['Nota nº', pg.nf_numero ?? null],
        ]),
      botao: { rotulo: 'Abrir a nota fiscal', url: pg.nf_url },
      observacao: 'A nota também fica disponível em Configurações → Plano e assinatura, na lista de cobranças.',
    }),
  };
}
