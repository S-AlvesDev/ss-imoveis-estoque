import { supabaseServer } from '../../lib/supabaseServer';
import { getTransporter } from '../../server/mail';
import { escapeHtml, p, tabela } from '../../server/email-layout';
import { siteUrl } from '../../server/senha';
import { emitente } from '../../server/recibo';
import { emitirNota, nfseConfigurada, type ProdutoDaNota } from '../../server/notafiscal';
import type { Pagamento } from '../../server/assinaturas';
import { dadosDoRecibo } from '../../shared/recibo';
import { precisaLembrar } from '../../server/lembretes';
import { formatarPreco } from '../../shared/planos';
import { layoutAtende, remetenteAtende } from './email';
import { contaDaEmpresa } from './plano';
import { NOME_DO_CICLO_ATENDE, NOME_DO_PLANO_ATENDE, type CicloAtende, type PlanoAtende } from '../shared/planos';
import { ATENDE, atendeUrl } from '../shared/produto';
import type { ContaAtende, PagamentoAtende, PagamentoAvulsoDaEmpresa } from '../shared/tipos';

/**
 * As cobranças do Atende Aí — o que o Stok Aí já fazia, reaproveitado:
 * recibo (não fiscal) por e-mail a cada pagamento aprovado, nota fiscal
 * pelo mesmo provedor (Focus NFe) e lembretes de vencimento. O que é do
 * Stok fica lá; aqui só se troca a tabela, a marca e os links.
 */

export const PRODUTO_DA_NOTA: ProdutoDaNota = { nome: ATENDE.nome, descricao: 'software de atendimento pelo WhatsApp' };
const PAGAMENTO_COLUNAS = 'id, status, valor, moeda, detalhe, data, metodo, plano, ciclo, periodo_de, periodo_ate, mp_payment_id, nf_status, nf_numero, nf_url, recibo_enviado_em, combo';
/** O mesmo, mais o que a tela precisa para mostrar o Pix/boleto em aberto. */
const AVULSO_COLUNAS = `${PAGAMENTO_COLUNAS}, vence_em, dados, descricao`;

/** Os dados de faturamento da empresa, quando cadastrados: quem aparece no recibo e na nota. */
export interface Faturamento {
  nome: string;
  tipoDoc: 'CPF' | 'CNPJ';
  doc: string;
  email?: string | null;
  endereco?: { cep: string; rua: string; numero: string; bairro: string; cidade: string; uf: string } | null;
}

export function validarFaturamento(b: unknown): { ok: true; valor: Faturamento | null } | { ok: false; erro: string } {
  if (b === null) return { ok: true, valor: null };
  const f = (b ?? {}) as Record<string, unknown>;
  const nome = String(f.nome ?? '').trim().slice(0, 120);
  const doc = String(f.doc ?? '').replace(/\D/g, '');
  const email = String(f.email ?? '').trim().toLowerCase().slice(0, 120);
  if (!nome) return { ok: false, erro: 'Informe o nome ou a razão social.' };
  if (doc.length !== 11 && doc.length !== 14) return { ok: false, erro: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: 'E-mail de cobrança inválido.' };
  const e = (f.endereco ?? null) as Record<string, unknown> | null;
  let endereco: Faturamento['endereco'] = null;
  if (e && Object.values(e).some((v) => String(v ?? '').trim())) {
    const campo = (k: string, max = 80) => String(e[k] ?? '').trim().slice(0, max);
    endereco = { cep: campo('cep', 9).replace(/\D/g, ''), rua: campo('rua'), numero: campo('numero', 20), bairro: campo('bairro'), cidade: campo('cidade'), uf: campo('uf', 2).toUpperCase() };
    if (endereco.cep.length !== 8 || !endereco.rua || !endereco.numero || !endereco.cidade || endereco.uf.length !== 2) return { ok: false, erro: 'Endereço incompleto: CEP (8 dígitos), rua, número, cidade e UF.' };
  }
  return { ok: true, valor: { nome, tipoDoc: doc.length === 14 ? 'CNPJ' : 'CPF', doc, email: email || null, endereco } };
}

async function empresaParaCobranca(empresaId: string): Promise<{ nome: string; faturamento: Faturamento | null; emailsDosAdmins: string[] }> {
  const [{ data: emp }, { data: admins }] = await Promise.all([
    supabaseServer.from('atende_empresas').select('nome, faturamento').eq('id', empresaId).maybeSingle(),
    supabaseServer.from('atende_usuarios').select('email').eq('empresa_id', empresaId).eq('papel', 'admin').eq('ativo', true),
  ]);
  return { nome: emp?.nome ?? 'sua empresa', faturamento: (emp?.faturamento as Faturamento | null) ?? null, emailsDosAdmins: ((admins || []) as any[]).map((a) => String(a.email || '')).filter(Boolean) };
}

/** A linha de atende_pagamentos como o servidor do Stok a conhece (mesmo shape), para recibo e nota. */
function comoPagamento(linha: any): Pagamento {
  return { ...linha, organization_id: linha.empresa_id, dados: linha.dados ?? null, descricao: linha.descricao ?? null, nf_ref: linha.nf_ref ?? null, nf_numero: linha.nf_numero ?? null, nf_url: linha.nf_url ?? null, nf_status: linha.nf_status ?? null, recibo_enviado_em: linha.recibo_enviado_em ?? null, periodo_de: linha.periodo_de ?? null, periodo_ate: linha.periodo_ate ?? null, vence_em: linha.vence_em ?? null, plano: linha.plano ?? null, ciclo: linha.ciclo ?? null, pagador: linha.pagador ?? null, detalhe: linha.detalhe ?? null } as Pagamento;
}

/**
 * Grava (ou atualiza) uma cobrança que o Mercado Pago contou. O pagador é o
 * faturamento da empresa (com CPF/CNPJ, para a nota) ou, sem ele, o e-mail
 * de quem assinou. Idempotente pelo id da cobrança no MP.
 */
export async function registrarPagamentoAtende(args: { empresaId: string; assinaturaId: string; plano: PlanoAtende; ciclo: CicloAtende; payerEmail: string | null; mpAuthorizedPaymentId: string; mpPaymentId: string | null; status: PagamentoAtende['status']; valor: number; moeda: string; detalhe: string | null; data: string; periodoDe: string | null; periodoAte: string | null }): Promise<PagamentoAtende | null> {
  const { faturamento } = await empresaParaCobranca(args.empresaId);
  const pagador = faturamento ? { nome: faturamento.nome, email: faturamento.email || args.payerEmail || '', tipoDoc: faturamento.tipoDoc, doc: faturamento.doc, endereco: faturamento.endereco ?? null } : { nome: args.payerEmail ?? '', email: args.payerEmail ?? '' };
  const agora = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from('atende_pagamentos')
    .upsert(
      {
        empresa_id: args.empresaId,
        assinatura_id: args.assinaturaId,
        mp_authorized_payment_id: args.mpAuthorizedPaymentId,
        mp_payment_id: args.mpPaymentId,
        status: args.status,
        valor: args.valor,
        moeda: args.moeda,
        detalhe: args.detalhe,
        data: args.data,
        metodo: 'cartao',
        plano: args.plano,
        ciclo: args.ciclo,
        periodo_de: args.periodoDe,
        periodo_ate: args.periodoAte,
        pagador,
        ...(args.status === 'aprovado' ? { nf_status: 'pendente' } : {}),
        updated_at: agora,
      },
      { onConflict: 'mp_authorized_payment_id' },
    )
    .select(PAGAMENTO_COLUNAS)
    .maybeSingle();
  if (error) {
    // Sem a migração 038 ainda: a assinatura funciona, só não há histórico de cobranças.
    if (/atende_pagamentos/.test(error.message)) return null;
    throw error;
  }
  return (data as PagamentoAtende | null) ?? null;
}

/**
 * O Pix/boleto gerado e ainda válido, para a tela reabrir o QR Code em vez
 * de gerar outro. Só lê a tabela — quem confere no Mercado Pago é a rota.
 */
export async function avulsoPendenteDaEmpresa(db: { from: (t: string) => any }): Promise<PagamentoAvulsoDaEmpresa | null> {
  const { data, error } = await db.from('atende_pagamentos').select(AVULSO_COLUNAS).eq('status', 'pendente').neq('metodo', 'cartao').not('mp_payment_id', 'is', null).order('data', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    if (/atende_pagamentos/.test(error.message)) return null;
    throw error;
  }
  const pg = (data as PagamentoAvulsoDaEmpresa | null) ?? null;
  // Vencido não serve para retomar: a tela gera outro.
  if (pg?.vence_em && new Date(pg.vence_em).getTime() < Date.now()) return null;
  return pg;
}

/** As cobranças da empresa, mais recentes primeiro. Vazio sem a migração. */
export async function pagamentosDaEmpresa(db: { from: (t: string) => any }, limite = 24): Promise<PagamentoAtende[]> {
  const { data, error } = await db.from('atende_pagamentos').select(PAGAMENTO_COLUNAS).order('data', { ascending: false }).limit(limite);
  if (error) {
    if (/atende_pagamentos/.test(error.message)) return [];
    throw error;
  }
  return (data || []) as PagamentoAtende[];
}

// ---------------------------------------------------------------------------
//  Recibo e nota — o mesmo código do Stok, com a marca do Atende
// ---------------------------------------------------------------------------

function emailDeReciboAtende(pg: Pagamento, empresa: string): { to: string; subject: string; html: string } | null {
  const r = dadosDoRecibo(pg, empresa, emitente(), { nome: ATENDE.nome });
  const to = r.pagador.email;
  if (!to) return null;
  return {
    to,
    subject: `Recibo ${r.numero} — ${ATENDE.nome}`,
    html: layoutAtende({
      titulo: 'Pagamento recebido. Obrigado!',
      corpo:
        p(`Este é o recibo do pagamento da <strong>${escapeHtml(empresa)}</strong> ao ${escapeHtml(ATENDE.nome)}.`) +
        tabela([
          ['Recibo nº', r.numero],
          ['Pagador', `${escapeHtml(r.pagador.nome)}${r.pagador.doc ? ` · ${escapeHtml(r.pagador.doc)}` : ''}`],
          ['Referente a', escapeHtml(r.descricao)],
          ['Valor', formatarPreco(r.valor)],
          ['Forma', r.metodo],
          ['Data', r.data],
          ['Transação', r.transacao ? escapeHtml(r.transacao) : null],
          ['Emitente', escapeHtml(r.emitente)],
        ]),
      observacao: 'Recibo emitido pelo sistema; não substitui a nota fiscal, que vai em e-mail separado quando emitida.',
    }),
  };
}

function emailDaNotaAtende(pg: Pagamento, empresa: string): { to: string; subject: string; html: string } | null {
  const to = String((pg.pagador as any)?.email ?? '').trim();
  if (!to || !pg.nf_url) return null;
  return {
    to,
    subject: `Nota fiscal do ${ATENDE.nome}${pg.nf_numero ? ` nº ${pg.nf_numero}` : ''}`,
    html: layoutAtende({
      titulo: 'Sua nota fiscal está pronta.',
      corpo: p(`Obrigado, <strong>${escapeHtml(empresa)}</strong>. A nota fiscal de serviço do seu pagamento ao ${escapeHtml(ATENDE.nome)} foi emitida.`) + tabela([['Valor', formatarPreco(Number(pg.valor))], ['Nota nº', pg.nf_numero ?? null]]),
      botao: { texto: 'Abrir a nota fiscal', href: pg.nf_url },
    }),
  };
}

/** Recibo por e-mail (uma vez só) e nota fiscal (quando o provedor está configurado e há CPF/CNPJ). Nunca derruba o pagamento. */
export async function cuidarDaCobranca(pg: PagamentoAtende & { empresa_id?: string }, empresaId: string): Promise<void> {
  if (pg.status !== 'aprovado') return;
  const { data: linha } = await supabaseServer.from('atende_pagamentos').select('*').eq('id', pg.id).maybeSingle();
  if (!linha) return;
  const completo = comoPagamento(linha);
  const { nome } = await empresaParaCobranca(empresaId);
  const t = await getTransporter();
  if (t && !completo.recibo_enviado_em) {
    try {
      const email = emailDeReciboAtende(completo, nome);
      if (email) {
        await t.sendMail({ from: remetenteAtende(), to: email.to, subject: email.subject, html: email.html });
        await supabaseServer.from('atende_pagamentos').update({ recibo_enviado_em: new Date().toISOString() }).eq('id', pg.id);
      }
    } catch (e: any) {
      console.error(`[atende recibo] pagamento ${pg.id}:`, e.message);
    }
  }
  if (completo.nf_status === 'emitida' || !nfseConfigurada()) return;
  try {
    const r = await emitirNota(completo, undefined, { tabela: 'atende_pagamentos', produto: PRODUTO_DA_NOTA });
    if (r?.situacao === 'emitida' && t) {
      const { data: atual } = await supabaseServer.from('atende_pagamentos').select('*').eq('id', pg.id).maybeSingle();
      const email = atual ? emailDaNotaAtende(comoPagamento(atual), nome) : null;
      if (email) await t.sendMail({ from: remetenteAtende(), to: email.to, subject: email.subject, html: email.html });
    }
  } catch (e: any) {
    console.error(`[atende nota fiscal] pagamento ${pg.id}:`, e.message);
  }
}

/** Recibos que não saíram (SMTP fora do ar) e notas que ficaram para trás — para o cron. */
export async function cobrancasPendentes(limite = 50): Promise<number> {
  const { data, error } = await supabaseServer.from('atende_pagamentos').select('id, empresa_id, status, nf_status, recibo_enviado_em').eq('status', 'aprovado').or('recibo_enviado_em.is.null,nf_status.is.null,nf_status.eq.pendente').order('data', { ascending: true }).limit(limite);
  if (error) {
    if (/atende_pagamentos/.test(error.message)) return 0;
    throw error;
  }
  let n = 0;
  for (const pg of (data || []) as any[]) {
    await cuidarDaCobranca(pg, pg.empresa_id);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
//  Lembretes de vencimento — a regra é a do Stok (precisaLembrar); o e-mail é do Atende
// ---------------------------------------------------------------------------

const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

export function emailDeLembreteAtende(empresa: string, conta: ContaAtende): { subject: string; html: string } {
  const base = `${atendeUrl(siteUrl())}/plano`;
  const ate = conta.ate ? fmtData.format(new Date(conta.ate)) : '';
  const dias = conta.dias_restantes ?? 0;
  const quando = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
  const nome = escapeHtml(empresa);
  if (conta.situacao === 'avaliacao') {
    return {
      subject: `Seus dias grátis no ${ATENDE.nome} terminam ${quando}`,
      html: layoutAtende({
        titulo: `A avaliação da ${nome} termina ${quando}.`,
        corpo: p(`Até <strong>${ate}</strong> a empresa tem tudo liberado. Depois disso o atendimento pausa até um plano ser ativado — nada é apagado: conversas, clientes, times e equipe ficam guardados.`) + p('Assine com cartão pelo Mercado Pago, em Plano, dentro do Atende Aí.'),
        botao: { texto: 'Escolher um plano', href: base },
      }),
    };
  }
  if (conta.situacao === 'carencia') {
    return {
      subject: `${ATENDE.nome}: pagamento pendente — o atendimento da ${empresa} pausa ${quando}`,
      html: layoutAtende({
        titulo: `O pagamento do plano ${NOME_DO_PLANO_ATENDE[conta.plano]} não foi confirmado.`,
        corpo: p(`O atendimento continua até <strong>${ate}</strong>. Depois disso ele pausa até o pagamento entrar — sem apagar nada.`) + p('Confira o cartão com o banco, ou assine de novo em Plano.'),
        botao: { texto: 'Regularizar agora', href: base },
      }),
    };
  }
  return {
    subject: `${ATENDE.nome}: o plano da ${empresa} vence ${quando}`,
    html: layoutAtende({
      titulo: `O plano ${NOME_DO_PLANO_ATENDE[conta.plano]} vence ${quando} (${ate}).`,
      corpo: p('A renovação não está automática nesta conta. Assine de novo em Plano para o atendimento não pausar.'),
      botao: { texto: 'Renovar o plano', href: base },
    }),
  };
}

/** Um e-mail por empresa que merece lembrete hoje. Devolve quantos saíram. */
export async function lembretesDoAtende(agora: Date = new Date()): Promise<{ empresas: number; enviados: number }> {
  const { data: empresas, error } = await supabaseServer.from('atende_empresas').select('id, nome, lembrete_enviado_em');
  if (error) {
    if (/lembrete_enviado_em/.test(error.message)) return { empresas: 0, enviados: 0 };
    throw error;
  }
  const t = await getTransporter();
  let n = 0;
  let enviados = 0;
  for (const e of (empresas || []) as Array<{ id: string; nome: string; lembrete_enviado_em: string | null }>) {
    const conta = await contaDaEmpresa(e.id, agora.getTime());
    if (!precisaLembrar({ ...conta, renovacao: conta.renovacao }, e.lembrete_enviado_em, agora)) continue;
    n++;
    const { emailsDosAdmins } = await empresaParaCobranca(e.id);
    if (t && emailsDosAdmins.length) {
      try {
        const { subject, html } = emailDeLembreteAtende(e.nome, conta);
        await t.sendMail({ from: remetenteAtende(), to: emailsDosAdmins.join(', '), subject, html });
        enviados++;
      } catch (err: any) {
        console.error(`[atende lembretes] ${e.nome}:`, err.message);
        continue;
      }
    }
    await supabaseServer.from('atende_empresas').update({ lembrete_enviado_em: agora.toISOString() }).eq('id', e.id);
  }
  return { empresas: n, enviados };
}

/** "Plano Profissional (mensal)" para e-mails. */
export function rotuloDoPlano(plano: PlanoAtende | null, ciclo: CicloAtende | null): string {
  return plano ? `Plano ${NOME_DO_PLANO_ATENDE[plano]}${ciclo ? ` (${NOME_DO_CICLO_ATENDE[ciclo].toLowerCase()})` : ''}` : 'Assinatura';
}
