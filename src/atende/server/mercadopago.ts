import { supabaseServer } from '../../lib/supabaseServer';
import { mpConfigurado, criarPreapproval, buscarAssinatura, cancelarAssinatura as cancelarNoMp, buscarPagamentoAutorizado, procurarAssinaturasRecentes, siteUrlDoMp, type PreapprovalMp, type PagamentoAutorizadoMp, type AmbienteMp } from '../../server/mercadopago';
import { DEFINICOES_ATENDE, NOME_DO_CICLO_ATENDE, PLANOS_ATENDE, ehCicloAtende, ehPlanoAtende, precoAtende, precoDoPeriodoAtende, type CicloAtende, type PlanoAtende } from '../shared/planos';
import type { AssinaturaAtende, SessaoAtende } from '../shared/tipos';
import { ATENDE } from '../shared/produto';
import { assinaturaDaEmpresa, esquecerContaAtende, ErroDePlano } from './plano';
import type { ScopedDb } from '../../server/tenant';

/**
 * A assinatura do Atende Aí pelo Mercado Pago — a mesma conta do MP e o
 * mesmo webhook do Stok Aí, com o próprio cofre (atende_assinaturas) e o
 * próprio carimbo: `external_reference = "atende:<empresa>"`. O webhook
 * pergunta primeiro aqui se o evento é do Atende; se não é, segue para o
 * tratador do Stok, que não sabe que existimos.
 *
 * Só assinatura pela API, sem plano do painel: o MP devolve o `init_point`
 * e a pessoa paga no site dele. Quando `next_payment_date` chega (webhook
 * ou retorno), o plano da empresa passa a valer até lá.
 */

export const REF_ATENDE = 'atende:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const referenciaDe = (empresaId: string) => `${REF_ATENDE}${empresaId}`;

/** A empresa de uma referência nossa; nulo quando a referência não é do Atende. */
export function empresaDaReferencia(ref: string | null | undefined): string | null {
  if (!ref || !ref.startsWith(REF_ATENDE)) return null;
  const id = ref.slice(REF_ATENDE.length);
  return UUID.test(id) ? id : null;
}

/** "Atende Aí — Profissional (mensal)": a fatura do cartão e o painel do MP. */
export function motivoAtende(plano: PlanoAtende, ciclo: CicloAtende): string {
  return `${ATENDE.nome} — ${DEFINICOES_ATENDE[plano].nome} (${NOME_DO_CICLO_ATENDE[ciclo].toLowerCase()})`;
}

/** O plano e o ciclo a partir do motivo (para uma assinatura que o MP contou sem intenção nossa). */
export function planoDoMotivo(reason: string | null | undefined): { plano: PlanoAtende; ciclo: CicloAtende } | null {
  if (!reason || !reason.startsWith(ATENDE.nome)) return null;
  for (const plano of PLANOS_ATENDE) {
    for (const ciclo of ['mensal', 'anual'] as const) if (reason === motivoAtende(plano, ciclo)) return { plano, ciclo };
  }
  return null;
}

/** Para onde o MP manda a pessoa depois do checkout: a tela de plano, que sincroniza pelo `preapproval_id` da URL. */
export function urlDeRetornoDoAtende(env: AmbienteMp = process.env as AmbienteMp): string {
  return `${siteUrlDoMp(env)}${ATENDE.base}/plano?retorno=1`;
}

export function corpoDaAssinaturaAtende(args: { plano: PlanoAtende; ciclo: CicloAtende; empresaId: string; payerEmail: string; env?: AmbienteMp }) {
  const cobranca = precoDoPeriodoAtende(args.plano, args.ciclo);
  if (cobranca === null) throw new ErroDePlano('Este plano ainda não tem preço definido.', 409);
  return {
    reason: motivoAtende(args.plano, args.ciclo),
    external_reference: referenciaDe(args.empresaId),
    payer_email: args.payerEmail,
    // A cobrança do período: no anual, uma por ano com os 12 meses menos os grátis (como o Stok Aí).
    auto_recurring: { frequency: args.ciclo === 'anual' ? 12 : 1, frequency_type: 'months', transaction_amount: cobranca, currency_id: 'BRL' },
    back_url: urlDeRetornoDoAtende(args.env),
    status: 'pending',
  };
}

// ---------------------------------------------------------------------------
//  Linhas
// ---------------------------------------------------------------------------

type StatusAssinatura = AssinaturaAtende['status'];

interface Linha {
  id: string;
  empresa_id: string;
  plano: PlanoAtende;
  ciclo: CicloAtende;
  valor: number;
  mp_preapproval_id: string | null;
  mp_plan_id: string | null;
  status: StatusAssinatura;
  pedido_por: number | null;
  payer_email: string | null;
  proxima_cobranca: string | null;
  autorizada_em: string | null;
  cancelada_em: string | null;
  created_at: string;
  updated_at: string;
}

const paraAssinatura = (a: Linha): AssinaturaAtende => ({ id: a.id, plano: a.plano, ciclo: a.ciclo, valor: Number(a.valor), status: a.status, payer_email: a.payer_email, proxima_cobranca: a.proxima_cobranca, created_at: a.created_at, autorizada_em: a.autorizada_em, cancelada_em: a.cancelada_em });

export function traduzirStatus(s: string | undefined): StatusAssinatura {
  switch (s) {
    case 'authorized':
      return 'autorizada';
    case 'paused':
      return 'pausada';
    case 'cancelled':
      return 'cancelada';
    default:
      return 'pendente';
  }
}

/** Quando o plano passa a valer até: a próxima cobrança do MP; sem ela, um ciclo a partir de agora. */
export function planoAteDe(pre: Pick<PreapprovalMp, 'next_payment_date'>, ciclo: CicloAtende, agora: Date = new Date()): string {
  if (pre.next_payment_date) return new Date(pre.next_payment_date).toISOString();
  const d = new Date(agora);
  d.setMonth(d.getMonth() + (ciclo === 'anual' ? 12 : 1));
  return d.toISOString();
}

/** Existe pagamento online? (Sem MP_ACCESS_TOKEN, o pedido por e-mail continua sendo o caminho.) */
export const pagamentoOnlineAtende = () => mpConfigurado();

// ---------------------------------------------------------------------------
//  Começar, cancelar
// ---------------------------------------------------------------------------

/**
 * Abre o caminho para assinar: cria a assinatura no MP (pendente, com o
 * valor do catálogo), guarda a linha com o id dela e devolve a URL do
 * checkout. Uma em vigor é cancelada antes só com `trocar`.
 */
export async function iniciarAssinaturaAtende(db: ScopedDb, sessao: SessaoAtende, corpo: unknown): Promise<{ url: string; assinatura: AssinaturaAtende }> {
  const b = (corpo ?? {}) as { plano?: unknown; ciclo?: unknown; trocar?: unknown };
  const plano = b.plano;
  const ciclo = b.ciclo ?? 'mensal';
  if (!ehPlanoAtende(plano)) throw new ErroDePlano('Escolha um plano: Essencial, Profissional ou Empresarial.');
  if (!ehCicloAtende(ciclo)) throw new ErroDePlano('Ciclo inválido.');
  if (!mpConfigurado()) throw new ErroDePlano('Pagamento online não configurado neste servidor.', 503);
  const valor = precoAtende(plano, ciclo);
  if (valor === null) throw new ErroDePlano('Este plano ainda não tem preço definido.', 409);

  const atual = await assinaturaDaEmpresa(db);
  if (atual && (atual.status === 'autorizada' || atual.status === 'pausada')) {
    if (!b.trocar) throw new ErroDePlano('Esta empresa já tem uma assinatura em vigor. Para mudar de plano, use a troca.', 409);
    const { data: linha } = await db.from('atende_assinaturas').select('mp_preapproval_id').eq('id', atual.id).maybeSingle();
    if (linha?.mp_preapproval_id) await cancelarNoMp(linha.mp_preapproval_id);
    const agora = new Date().toISOString();
    await db.from('atende_assinaturas').update({ status: 'cancelada', cancelada_em: agora, updated_at: agora }).eq('id', atual.id);
  }

  // Uma intenção pendente por vez: as antigas (sem id do MP, ou com checkout nunca concluído) saem.
  await db.from('atende_assinaturas').delete().eq('status', 'pendente');

  const pre = await criarPreapproval(corpoDaAssinaturaAtende({ plano, ciclo, empresaId: sessao.empresa_id, payerEmail: sessao.email }));
  if (!pre.init_point) throw new Error('O Mercado Pago não devolveu o link do checkout.');
  const { data, error } = await db
    .from('atende_assinaturas')
    .insert({ empresa_id: sessao.empresa_id, plano, ciclo, valor, status: 'pendente', pedido_por: sessao.id, payer_email: sessao.email, mp_preapproval_id: pre.id })
    .select('*')
    .single();
  if (error) throw error;
  return { url: pre.init_point, assinatura: paraAssinatura(data as Linha) };
}

/** Cancela no MP e aqui. A empresa continua até `plano_ate`; depois entra em carência e trava. */
export async function cancelarAssinaturaAtende(db: ScopedDb, empresaId: string): Promise<AssinaturaAtende> {
  const atual = await assinaturaDaEmpresa(db);
  if (!atual || (atual.status !== 'autorizada' && atual.status !== 'pausada')) throw new ErroDePlano('Não há assinatura em vigor para cancelar.', 409);
  const { data: linha } = await db.from('atende_assinaturas').select('mp_preapproval_id').eq('id', atual.id).maybeSingle();
  if (linha?.mp_preapproval_id && mpConfigurado()) await cancelarNoMp(linha.mp_preapproval_id);
  const agora = new Date().toISOString();
  const { data, error } = await db.from('atende_assinaturas').update({ status: 'cancelada', cancelada_em: agora, updated_at: agora }).eq('id', atual.id).select('*').single();
  if (error) throw error;
  esquecerContaAtende(empresaId);
  return paraAssinatura(data as Linha);
}

// ---------------------------------------------------------------------------
//  O que o Mercado Pago conta (webhook e retorno)
// ---------------------------------------------------------------------------

export interface ResultadoAtende {
  casou: boolean;
  empresaId: string | null;
  /** A organização da empresa (para o diário mp_eventos, que é por organização). */
  organizationId: string | null;
  assinatura: AssinaturaAtende | null;
  motivo?: string;
}

async function organizacaoDaEmpresa(empresaId: string): Promise<string | null> {
  const { data } = await supabaseServer.from('atende_empresas').select('organization_id').eq('id', empresaId).maybeSingle();
  return data?.organization_id ?? null;
}

/** É uma assinatura do Atende? Pela linha já gravada, ou pela referência que a gente pôs. */
async function linhaDe(pre: PreapprovalMp): Promise<{ empresaId: string; intencao: Linha | null } | null> {
  const { data: existente } = await supabaseServer.from('atende_assinaturas').select('*').eq('mp_preapproval_id', pre.id).maybeSingle();
  if (existente) return { empresaId: existente.empresa_id, intencao: existente as Linha };
  const empresaId = empresaDaReferencia(pre.external_reference);
  if (!empresaId) return null;
  const { data: empresa } = await supabaseServer.from('atende_empresas').select('id').eq('id', empresaId).maybeSingle();
  if (!empresa) return null;
  const { data: intencao } = await supabaseServer.from('atende_assinaturas').select('*').eq('empresa_id', empresaId).eq('status', 'pendente').is('mp_preapproval_id', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return { empresaId, intencao: (intencao as Linha) ?? null };
}

/**
 * Grava uma assinatura que o MP contou e acerta o plano da empresa.
 * Idempotente. Devolve nulo quando a assinatura não é do Atende — o
 * webhook então segue para o Stok.
 */
export async function aplicarPreapprovalAtende(pre: PreapprovalMp, opcoes: { empresaId?: string } = {}): Promise<ResultadoAtende | null> {
  const dona = await linhaDe(pre);
  if (!dona) return null;
  if (opcoes.empresaId && dona.empresaId !== opcoes.empresaId) return { casou: false, empresaId: dona.empresaId, organizationId: await organizacaoDaEmpresa(dona.empresaId), assinatura: null, motivo: 'a assinatura pertence a outra empresa' };

  const doMotivo = planoDoMotivo(pre.reason);
  const plano = dona.intencao?.plano ?? doMotivo?.plano ?? null;
  const ciclo = dona.intencao?.ciclo ?? doMotivo?.ciclo ?? (pre.auto_recurring?.frequency === 12 ? 'anual' : 'mensal');
  if (!ehPlanoAtende(plano)) return { casou: false, empresaId: dona.empresaId, organizationId: await organizacaoDaEmpresa(dona.empresaId), assinatura: null, motivo: `plano desconhecido (${pre.reason ?? 'sem motivo'})` };

  const agora = new Date().toISOString();
  const status = traduzirStatus(pre.status);
  const campos = {
    empresa_id: dona.empresaId,
    plano,
    ciclo,
    valor: dona.intencao?.valor ?? precoAtende(plano, ciclo) ?? 0,
    mp_preapproval_id: pre.id,
    mp_plan_id: pre.preapproval_plan_id ?? null,
    status,
    payer_email: pre.payer_email || dona.intencao?.payer_email || null,
    proxima_cobranca: pre.next_payment_date ?? null,
    autorizada_em: status === 'autorizada' ? (dona.intencao?.autorizada_em ?? agora) : (dona.intencao?.autorizada_em ?? null),
    cancelada_em: status === 'cancelada' ? (dona.intencao?.cancelada_em ?? agora) : null,
    updated_at: agora,
  };

  let linha: Linha;
  if (dona.intencao) {
    const { data, error } = await supabaseServer.from('atende_assinaturas').update(campos).eq('id', dona.intencao.id).select('*').single();
    if (error) throw error;
    linha = data as Linha;
  } else {
    const { data, error } = await supabaseServer.from('atende_assinaturas').insert(campos).select('*').single();
    if (error) throw error;
    linha = data as Linha;
  }

  if (status === 'autorizada') {
    // Outras em vigor da mesma empresa não valem mais (troca de plano).
    await supabaseServer.from('atende_assinaturas').update({ status: 'cancelada', cancelada_em: agora, updated_at: agora }).eq('empresa_id', dona.empresaId).eq('status', 'autorizada').neq('id', linha.id);
    const { data: emp } = await supabaseServer.from('atende_empresas').select('plano_desde').eq('id', dona.empresaId).maybeSingle();
    await supabaseServer.from('atende_empresas').update({ plano, plano_desde: emp?.plano_desde ?? agora, plano_ate: planoAteDe(pre, ciclo), cobranca: 'cartao' }).eq('id', dona.empresaId);
  }
  // Cancelada ou pausada: a empresa continua até plano_ate — nada a mudar aqui.

  esquecerContaAtende(dona.empresaId);
  return { casou: true, empresaId: dona.empresaId, organizationId: await organizacaoDaEmpresa(dona.empresaId), assinatura: paraAssinatura(linha) };
}

/** Uma cobrança da assinatura: aprovada, o plano vale até a próxima. Nulo quando a assinatura não é do Atende. */
export async function aplicarPagamentoAutorizadoAtende(ap: PagamentoAutorizadoMp): Promise<ResultadoAtende | null> {
  const { data: linha } = await supabaseServer.from('atende_assinaturas').select('*').eq('mp_preapproval_id', ap.preapproval_id).maybeSingle();
  if (!linha) {
    // A cobrança chegou antes da assinatura: busca a assinatura e tenta casar.
    const pre = await buscarAssinatura(ap.preapproval_id);
    if (!empresaDaReferencia(pre.external_reference)) return null;
    const r = await aplicarPreapprovalAtende(pre);
    if (!r || !r.casou) return r;
  }
  const a = (linha as Linha | null) ?? ((await supabaseServer.from('atende_assinaturas').select('*').eq('mp_preapproval_id', ap.preapproval_id).maybeSingle()).data as Linha);
  const aprovado = ap.status === 'processed' && ap.payment?.status === 'approved';
  if (aprovado) {
    const pre = await buscarAssinatura(ap.preapproval_id);
    const agora = new Date().toISOString();
    await supabaseServer.from('atende_assinaturas').update({ proxima_cobranca: pre.next_payment_date ?? null, status: traduzirStatus(pre.status), updated_at: agora }).eq('id', a.id);
    await supabaseServer.from('atende_empresas').update({ plano: a.plano, plano_ate: planoAteDe(pre, a.ciclo), cobranca: 'cartao' }).eq('id', a.empresa_id);
    esquecerContaAtende(a.empresa_id);
  }
  return { casou: true, empresaId: a.empresa_id, organizationId: await organizacaoDaEmpresa(a.empresa_id), assinatura: paraAssinatura(a), motivo: aprovado ? undefined : `cobrança ${ap.status}/${ap.payment?.status ?? '-'}` };
}

/**
 * Um evento do webhook: é do Atende? Então trata e devolve o desfecho;
 * senão, nulo — e o webhook segue para o tratador do Stok Aí.
 */
export async function tratarEventoDoAtende(tipo: string, id: string): Promise<ResultadoAtende | null> {
  if (tipo === 'subscription_preapproval') return aplicarPreapprovalAtende(await buscarAssinatura(id));
  if (tipo === 'subscription_authorized_payment') return aplicarPagamentoAutorizadoAtende(await buscarPagamentoAutorizado(id));
  return null;
}

/**
 * O retorno do checkout (com `preapproval_id`) ou o botão "já paguei":
 * busca no MP e aplica; sem id, procura nas assinaturas recentes uma com a
 * referência desta empresa.
 */
export async function sincronizarAtende(empresaId: string, preapprovalId: string | null): Promise<ResultadoAtende> {
  if (!mpConfigurado()) throw new ErroDePlano('Pagamento online não configurado neste servidor.', 503);
  if (preapprovalId) {
    const r = await aplicarPreapprovalAtende(await buscarAssinatura(preapprovalId), { empresaId });
    return r ?? { casou: false, empresaId, organizationId: null, assinatura: null, motivo: 'esta assinatura não é do Atende Aí' };
  }
  const ref = referenciaDe(empresaId);
  const recentes = await procurarAssinaturasRecentes();
  const candidata = recentes.find((p) => p.external_reference === ref && (p.status === 'authorized' || p.status === 'paused'));
  if (!candidata) return { casou: false, empresaId, organizationId: null, assinatura: null, motivo: `nenhuma das ${recentes.length} assinaturas recentes do Mercado Pago é desta empresa` };
  const r = await aplicarPreapprovalAtende(await buscarAssinatura(candidata.id), { empresaId });
  return r ?? { casou: false, empresaId, organizationId: null, assinatura: null, motivo: 'assinatura não reconhecida' };
}
