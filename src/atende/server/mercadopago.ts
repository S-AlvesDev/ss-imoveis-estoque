import { supabaseServer } from '../../lib/supabaseServer';
import { mpConfigurado, criarPreapproval, buscarAssinatura, cancelarAssinatura as cancelarNoMp, buscarPagamentoAutorizado, procurarAssinaturasRecentes, siteUrlDoMp, criarPagamentoAvulso, buscarPagamento, dadosParaPagar, type PreapprovalMp, type PagamentoAutorizadoMp, type AmbienteMp, type PagadorAvulso, type PagamentoMp } from '../../server/mercadopago';
import { PIX_VALIDADE_HORAS, BOLETO_VALIDADE_DIAS } from '../../shared/planos';
import { DEFINICOES_ATENDE, NOME_DO_CICLO_ATENDE, PLANOS_ATENDE, ehCicloAtende, ehPlanoAtende, precoAtende, precoDoPeriodoAtende, type CicloAtende, type PlanoAtende } from '../shared/planos';
import type { AssinaturaAtende, SessaoAtende } from '../shared/tipos';
import { ATENDE } from '../shared/produto';
import { assinaturaDaEmpresa, esquecerContaAtende, ErroDePlano } from './plano';
import { registrarPagamentoAtende, cuidarDaCobranca } from './cobrancas';
import type { PagamentoAtende } from '../shared/tipos';
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

/** De uma cobrança do MP (status da cobrança + status do pagamento) para o nosso — a mesma tabela do Stok Aí. */
export function traduzirPagamento(ap: Pick<PagamentoAutorizadoMp, 'status' | 'payment'>): { status: PagamentoAtende['status']; detalhe: string | null } {
  const p = ap.payment?.status;
  const detalhe = ap.payment?.status_detail ?? null;
  if (ap.status === 'recycling') return { status: 'pendente', detalhe: detalhe ?? 'nova tentativa agendada' };
  if (p === 'rejected') return { status: 'recusado', detalhe };
  if (ap.status === 'scheduled') return { status: 'agendado', detalhe };
  if (ap.status === 'cancelled') return { status: 'cancelado', detalhe };
  switch (p) {
    case 'approved':
      return { status: 'aprovado', detalhe };
    case 'refunded':
    case 'charged_back':
      return { status: 'reembolsado', detalhe };
    case 'cancelled':
      return { status: 'cancelado', detalhe };
    default:
      return { status: 'pendente', detalhe };
  }
}

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
  const { status, detalhe } = traduzirPagamento(ap);
  const aprovado = status === 'aprovado';
  let periodoAte: string | null = null;
  if (aprovado) {
    const pre = await buscarAssinatura(ap.preapproval_id);
    const agora = new Date().toISOString();
    periodoAte = planoAteDe(pre, a.ciclo);
    await supabaseServer.from('atende_assinaturas').update({ proxima_cobranca: pre.next_payment_date ?? null, status: traduzirStatus(pre.status), updated_at: agora }).eq('id', a.id);
    await supabaseServer.from('atende_empresas').update({ plano: a.plano, plano_ate: periodoAte, cobranca: 'cartao' }).eq('id', a.empresa_id);
    esquecerContaAtende(a.empresa_id);
  }
  // A cobrança vira histórico (e recibo/nota quando aprovada) — como no Stok Aí.
  const data = ap.debit_date ?? ap.date_created ?? new Date().toISOString();
  const pg = await registrarPagamentoAtende({ empresaId: a.empresa_id, assinaturaId: a.id, plano: a.plano, ciclo: a.ciclo, payerEmail: a.payer_email, mpAuthorizedPaymentId: String(ap.id), mpPaymentId: ap.payment?.id != null ? String(ap.payment.id) : null, status, valor: ap.transaction_amount ?? Number(a.valor), moeda: ap.currency_id ?? 'BRL', detalhe, data, periodoDe: aprovado ? data : null, periodoAte });
  if (pg && aprovado) await cuidarDaCobranca(pg, a.empresa_id);
  return { casou: true, empresaId: a.empresa_id, organizationId: await organizacaoDaEmpresa(a.empresa_id), assinatura: paraAssinatura(a), motivo: aprovado ? undefined : `cobrança ${ap.status}/${ap.payment?.status ?? '-'}` };
}

/**
 * Um evento do webhook: é do Atende? Então trata e devolve o desfecho;
 * senão, nulo — e o webhook segue para o tratador do Stok Aí.
 */
export async function tratarEventoDoAtende(tipo: string, id: string): Promise<ResultadoAtende | null> {
  if (tipo === 'subscription_preapproval') return aplicarPreapprovalAtende(await buscarAssinatura(id));
  if (tipo === 'subscription_authorized_payment') return aplicarPagamentoAutorizadoAtende(await buscarPagamentoAutorizado(id));
  if (tipo === 'payment') {
    // Pix e boleto do Atende chegam aqui, com a referência nossa; o resto é do Stok (ou de assinatura, já tratado).
    const pay = await buscarPagamento(id);
    if (String(pay.external_reference ?? '').startsWith(REF_AVULSO_ATENDE)) return aplicarPagamentoAvulsoAtende(pay);
    return null;
  }
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

// ---------------------------------------------------------------------------
//  Pagamento avulso: Pix ou boleto do período inteiro (renovação manual)
// ---------------------------------------------------------------------------

export const REF_AVULSO_ATENDE = 'atende-avulso:';

/** "Atende Aí — Profissional (mensal)": a descrição do Pix/boleto e do recibo. */
export function descricaoDoAvulsoAtende(plano: PlanoAtende, ciclo: CicloAtende): string {
  return motivoAtende(plano, ciclo);
}

export function traduzirStatusDePagamento(s: string | undefined): PagamentoAtende['status'] {
  switch (s) {
    case 'approved':
    case 'authorized':
      return 'aprovado';
    case 'rejected':
      return 'recusado';
    case 'cancelled':
      return 'cancelado';
    case 'refunded':
    case 'charged_back':
      return 'reembolsado';
    default:
      return 'pendente';
  }
}

function fimDoPeriodoAtende(de: Date, ciclo: CicloAtende): Date {
  const d = new Date(de);
  d.setMonth(d.getMonth() + (ciclo === 'anual' ? 12 : 1));
  return d;
}

const PAG_COLUNAS = 'id, status, valor, moeda, detalhe, data, metodo, plano, ciclo, periodo_de, periodo_ate, mp_payment_id, nf_status, nf_numero, nf_url, recibo_enviado_em, vence_em, dados';

export type PagamentoAvulsoAtende = PagamentoAtende & { vence_em: string | null; dados: Record<string, string | null> | null };

/**
 * Cria o pedido e pede o Pix/boleto ao MP — o mesmo desenho do Stok Aí, na
 * tabela do Atende. Nasce pendente com o QR Code / boleto em `dados`; o
 * webhook (ou a consulta da tela) aprova e aplica o período.
 */
export async function criarAvulsoAtende(args: { empresaId: string; plano: PlanoAtende; ciclo: CicloAtende; metodo: 'pix' | 'boleto'; pagador: PagadorAvulso; pedidoPor: number | null }): Promise<PagamentoAvulsoAtende> {
  if (!mpConfigurado()) throw new ErroDePlano('Pagamento online não configurado neste servidor.', 503);
  const valor = precoDoPeriodoAtende(args.plano, args.ciclo);
  if (valor === null) throw new ErroDePlano('Este plano ainda não tem preço definido.', 409);
  const agora = new Date();
  const venceEm = args.metodo === 'pix' ? new Date(agora.getTime() + PIX_VALIDADE_HORAS * 3600_000) : new Date(agora.getTime() + BOLETO_VALIDADE_DIAS * 24 * 3600_000);
  const descricao = descricaoDoAvulsoAtende(args.plano, args.ciclo);

  // Um pedido pendente por vez (sem id do MP): o anterior sai.
  await supabaseServer.from('atende_pagamentos').delete().eq('empresa_id', args.empresaId).eq('status', 'pendente').neq('metodo', 'cartao').is('mp_payment_id', null);

  const { data: pedido, error } = await supabaseServer
    .from('atende_pagamentos')
    .insert({ empresa_id: args.empresaId, metodo: args.metodo, plano: args.plano, ciclo: args.ciclo, valor, status: 'pendente', descricao, vence_em: venceEm.toISOString(), pagador: args.pagador, data: agora.toISOString() })
    .select('id')
    .single();
  if (error) throw error;

  let pay: PagamentoMp;
  try {
    pay = await criarPagamentoAvulso({ metodo: args.metodo, valor, descricao, referencia: `${REF_AVULSO_ATENDE}${pedido.id}`, pagador: args.pagador, venceEm, idempotencia: pedido.id });
  } catch (e) {
    await supabaseServer.from('atende_pagamentos').delete().eq('id', pedido.id);
    throw e;
  }
  const { data: atualizado, error: e2 } = await supabaseServer
    .from('atende_pagamentos')
    .update({ mp_payment_id: String(pay.id), status: traduzirStatusDePagamento(pay.status), detalhe: pay.status_detail ?? null, dados: dadosParaPagar(pay), vence_em: pay.date_of_expiration ?? venceEm.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', pedido.id)
    .select(PAG_COLUNAS)
    .single();
  if (e2) throw e2;
  return atualizado as PagamentoAvulsoAtende;
}

/** O que o MP diz de um avulso do Atende: grava; na primeira aprovação, aplica o período (emendando se ainda está pago). Nulo se não é nosso. */
export async function aplicarPagamentoAvulsoAtende(pay: PagamentoMp): Promise<ResultadoAtende | null> {
  const ref = String(pay.external_reference ?? '');
  let { data: pedido } = await supabaseServer.from('atende_pagamentos').select('*').eq('mp_payment_id', String(pay.id)).maybeSingle();
  if (!pedido && ref.startsWith(REF_AVULSO_ATENDE)) pedido = (await supabaseServer.from('atende_pagamentos').select('*').eq('id', ref.slice(REF_AVULSO_ATENDE.length)).maybeSingle()).data;
  if (!pedido) return null;
  const agora = new Date();
  const status = traduzirStatusDePagamento(pay.status);
  const patch: Record<string, unknown> = { mp_payment_id: String(pay.id), status, detalhe: pay.status_detail ?? null, updated_at: agora.toISOString() };
  if (status === 'aprovado' && !pedido.periodo_ate && ehPlanoAtende(pedido.plano) && ehCicloAtende(pedido.ciclo)) {
    const { data: emp } = await supabaseServer.from('atende_empresas').select('plano, plano_ate, plano_desde').eq('id', pedido.empresa_id).maybeSingle();
    const aindaPago = emp?.plano === pedido.plano && emp?.plano_ate && new Date(emp.plano_ate).getTime() > agora.getTime();
    const de = aindaPago ? new Date(emp!.plano_ate as string) : agora;
    const ate = fimDoPeriodoAtende(de, pedido.ciclo);
    patch.periodo_de = de.toISOString();
    patch.periodo_ate = ate.toISOString();
    patch.data = pay.date_approved ?? agora.toISOString();
    patch.nf_status = 'pendente';
    await supabaseServer.from('atende_empresas').update({ plano: pedido.plano, plano_desde: emp?.plano_desde ?? agora.toISOString(), plano_ate: ate.toISOString(), cobranca: 'avulso' }).eq('id', pedido.empresa_id);
    esquecerContaAtende(pedido.empresa_id);
  }
  const { data: atualizado, error } = await supabaseServer.from('atende_pagamentos').update(patch).eq('id', pedido.id).select(PAG_COLUNAS).single();
  if (error) throw error;
  if (status === 'aprovado') await cuidarDaCobranca(atualizado as PagamentoAtende, pedido.empresa_id);
  return { casou: true, empresaId: pedido.empresa_id, organizationId: await organizacaoDaEmpresa(pedido.empresa_id), assinatura: null, motivo: status === 'aprovado' ? undefined : `pagamento ${pay.status}` };
}

/** Consulta o MP e aplica — para a tela que espera o Pix cair, sem depender do webhook. */
export async function atualizarAvulsoAtende(pedido: PagamentoAvulsoAtende): Promise<PagamentoAvulsoAtende> {
  if (!pedido.mp_payment_id || !mpConfigurado()) return pedido;
  const pay = await buscarPagamento(pedido.mp_payment_id);
  await aplicarPagamentoAvulsoAtende(pay);
  const { data } = await supabaseServer.from('atende_pagamentos').select(PAG_COLUNAS).eq('id', pedido.id).maybeSingle();
  return (data as PagamentoAvulsoAtende) ?? pedido;
}

/** O pedido avulso pendente da empresa (dentro da validade), para a tela retomar. */
export async function avulsoPendenteAtende(empresaId: string): Promise<PagamentoAvulsoAtende | null> {
  const { data } = await supabaseServer.from('atende_pagamentos').select(PAG_COLUNAS).eq('empresa_id', empresaId).eq('status', 'pendente').neq('metodo', 'cartao').not('mp_payment_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const p = data as PagamentoAvulsoAtende;
  if (p.vence_em && new Date(p.vence_em).getTime() < Date.now()) return null;
  return p;
}

/** Todos os avulsos pendentes dentro da validade — para o cron conferir no MP. */
export async function avulsosPendentesAtende(limite = 100): Promise<PagamentoAvulsoAtende[]> {
  const { data } = await supabaseServer.from('atende_pagamentos').select(PAG_COLUNAS).eq('status', 'pendente').neq('metodo', 'cartao').not('mp_payment_id', 'is', null).gte('vence_em', new Date(Date.now() - 2 * 24 * 3600_000).toISOString()).limit(limite);
  return (data || []) as PagamentoAvulsoAtende[];
}
