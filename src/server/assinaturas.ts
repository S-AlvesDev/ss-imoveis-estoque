/**
 * Assinaturas — o que o Stok Aí faz com o que o Mercado Pago diz.
 *
 * O Mercado Pago é a fonte da verdade sobre a assinatura (status, próxima
 * cobrança, cada pagamento). Aqui a gente traduz isso para as nossas tabelas
 * e, no fim, para as três colunas que o servidor lê em toda requisição:
 * `organizations.plano`, `plano_desde` e `plano_ate`.
 *
 * Tudo roda com a chave de serviço (sem organização na sessão): o webhook
 * chega sem login, e é ele quem mais chama isto aqui.
 */
import { supabaseServer } from '../lib/supabaseServer';
import { esquecerPlano } from './planos';
import {
  buscarAssinatura,
  buscarPagamentoAutorizado,
  cancelarAssinatura as cancelarNoMp,
  criarAssinaturaSemPlano,
  criarAssinaturaComCartao,
  mpPlanId,
  planoDeTeste,
  procurarAssinaturasRecentes,
  urlDoCheckoutDoPlano,
  criarPagamentoAvulso,
  buscarPagamento,
  dadosParaPagar,
  type PreapprovalMp,
  type PagamentoAutorizadoMp,
  type PagamentoMp,
  type PagadorAvulso,
  type StatusMp,
} from './mercadopago';
import { ehPlano, planoDoMpPlanId, precoDo, situacaoDaConta, fimDoPeriodo, DEFINICOES, NOME_DO_CICLO, PIX_VALIDADE_HORAS, BOLETO_VALIDADE_DIAS, type Ciclo, type Conta, type Plano } from '../shared/planos';

export type StatusAssinatura = 'pendente' | 'autorizada' | 'pausada' | 'cancelada';
export type StatusPagamento = 'agendado' | 'aprovado' | 'recusado' | 'cancelado' | 'reembolsado' | 'pendente';

export interface Assinatura {
  id: string;
  organization_id: string;
  plano: Plano;
  ciclo: Ciclo;
  valor: number;
  mp_preapproval_id: string | null;
  mp_plan_id: string | null;
  status: StatusAssinatura;
  payer_email: string | null;
  proxima_cobranca: string | null;
  autorizada_em: string | null;
  cancelada_em: string | null;
  created_at: string;
  /** O combo da SEVLA de onde veio (essencial/profissional/empresarial); nulo = assinatura avulsa. */
  combo?: string | null;
}

export interface Pagamento {
  id: string;
  organization_id: string;
  assinatura_id: string | null;
  mp_authorized_payment_id: string | null;
  mp_payment_id: string | null;
  status: StatusPagamento;
  valor: number;
  moeda: string;
  detalhe: string | null;
  data: string;
  metodo: 'cartao' | 'pix' | 'boleto';
  plano: Plano | null;
  ciclo: Ciclo | null;
  periodo_de: string | null;
  periodo_ate: string | null;
  vence_em: string | null;
  dados: Record<string, string | null> | null;
  descricao: string | null;
  pagador: Record<string, unknown> | null;
  nf_status: 'pendente' | 'emitida' | 'erro' | 'cancelada' | null;
  nf_ref: string | null;
  nf_numero: string | null;
  nf_url: string | null;
  recibo_enviado_em: string | null;
  /** O combo da SEVLA: este Pix/boleto é a parte do Stok Aí de um pagamento único com o Atende Aí. */
  combo?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** De `pending|authorized|paused|cancelled` para o nosso status. */
export function traduzirStatus(s: StatusMp | string | undefined): StatusAssinatura {
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

/** De uma cobrança do MP (status da cobrança + status do pagamento) para o nosso. */
export function traduzirPagamento(ap: Pick<PagamentoAutorizadoMp, 'status' | 'payment'>): { status: StatusPagamento; detalhe: string | null } {
  const p = ap.payment?.status;
  const detalhe = ap.payment?.status_detail ?? null;
  // "recycling" = o MP vai tentar de novo: continua pendente, dizendo por quê.
  if (ap.status === 'recycling') return { status: 'pendente', detalhe: detalhe ?? 'nova tentativa agendada' };
  // Uma cobrança "agendada" cujo pagamento já foi tentado e recusado é uma recusa.
  if (p === 'rejected') return { status: 'recusado', detalhe };
  if (ap.status === 'scheduled') return { status: 'agendado', detalhe };
  if (ap.status === 'cancelled') return { status: 'cancelado', detalhe };
  switch (p) {
    case 'approved':
      return { status: 'aprovado', detalhe };
    case 'rejected':
      return { status: 'recusado', detalhe };
    case 'refunded':
    case 'charged_back':
      return { status: 'reembolsado', detalhe };
    case 'cancelled':
      return { status: 'cancelado', detalhe };
    default:
      return { status: 'pendente', detalhe };
  }
}

/** Quando o plano passa a valer até: a próxima cobrança do MP; sem ela, um ciclo a partir de agora. */
export function planoAteDe(pre: Pick<PreapprovalMp, 'next_payment_date'>, ciclo: Ciclo, agora: Date = new Date()): string {
  if (pre.next_payment_date) return new Date(pre.next_payment_date).toISOString();
  return fimDoPeriodo(agora, ciclo).toISOString();
}

// ---------------------------------------------------------------------------
//  Leitura
// ---------------------------------------------------------------------------

export async function contaDe(organizationId: string): Promise<{ organizacao: any; conta: Conta } | null> {
  const { data, error } = await supabaseServer.from('organizations').select('id, nome, slug, plano, plano_desde, plano_ate, avaliacao_ate').eq('id', organizationId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { organizacao: data, conta: situacaoDaConta(data) };
}

/** A assinatura que vale: a autorizada; senão a mais recente. */
export async function assinaturaAtual(organizationId: string): Promise<Assinatura | null> {
  const { data, error } = await supabaseServer.from('assinaturas').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  const lista = (data || []) as Assinatura[];
  return lista.find((a) => a.status === 'autorizada') ?? lista.find((a) => a.status === 'pausada') ?? lista[0] ?? null;
}

export async function pagamentosDe(organizationId: string, limite = 24): Promise<Pagamento[]> {
  const { data, error } = await supabaseServer.from('pagamentos').select('*').eq('organization_id', organizationId).order('data', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data || []) as Pagamento[];
}

// ---------------------------------------------------------------------------
//  Começar, trocar, cancelar
// ---------------------------------------------------------------------------

export interface InicioDeAssinatura {
  /** Para onde mandar a pessoa: o checkout do Mercado Pago. */
  url: string;
  assinatura: Assinatura;
}

/**
 * Abre o caminho para assinar: registra a intenção e devolve a URL do
 * checkout. Com plano no painel, é a URL do plano; sem, cria a assinatura
 * pela API e usa o `init_point`. Uma assinatura autorizada em vigor é
 * cancelada antes — é a troca de plano.
 *
 * `combo` é a SEVLA assinando os dois produtos juntos: o valor vem com o
 * desconto e a assinatura nasce sempre pela API (o plano do painel tem
 * preço fixo), carimbada com o combo.
 */
export async function iniciarAssinatura(args: { organizationId: string; plano: Plano; ciclo: Ciclo; payerEmail: string; trocar?: boolean; combo?: { id: string; valor: number; motivo: string } }): Promise<InicioDeAssinatura> {
  const atual = await assinaturaAtual(args.organizationId);
  if (atual && (atual.status === 'autorizada' || atual.status === 'pausada')) {
    if (!args.trocar) throw new ErroDeAssinatura(409, 'Esta conta já tem uma assinatura em vigor. Para mudar de plano, use a troca.');
    if (atual.mp_preapproval_id) await cancelarNoMp(atual.mp_preapproval_id);
    await supabaseServer.from('assinaturas').update({ status: 'cancelada', cancelada_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', atual.id);
  }

  // Uma intenção pendente por vez: as antigas (sem id do MP) saem.
  await supabaseServer.from('assinaturas').delete().eq('organization_id', args.organizationId).eq('status', 'pendente').is('mp_preapproval_id', null);

  const planId = args.combo ? null : mpPlanId(args.plano, args.ciclo);
  const base = { organization_id: args.organizationId, plano: args.plano, ciclo: args.ciclo, valor: args.combo?.valor ?? precoDo(args.plano, args.ciclo), payer_email: args.payerEmail, status: 'pendente' as const, ...(args.combo ? { combo: args.combo.id } : {}) };

  if (planId) {
    const { data, error } = await supabaseServer.from('assinaturas').insert({ ...base, mp_plan_id: planId }).select('*').single();
    if (error) throw error;
    return { url: urlDoCheckoutDoPlano(planId, args.organizationId), assinatura: data as Assinatura };
  }

  const pre = await criarAssinaturaSemPlano({ plano: args.plano, ciclo: args.ciclo, organizationId: args.organizationId, payerEmail: args.payerEmail, valor: args.combo?.valor, motivo: args.combo?.motivo });
  if (!pre.init_point) throw new Error('O Mercado Pago não devolveu o link do checkout.');
  const { data, error } = await supabaseServer.from('assinaturas').insert({ ...base, mp_preapproval_id: pre.id }).select('*').single();
  if (error) throw error;
  return { url: pre.init_point, assinatura: data as Assinatura };
}

/**
 * Checkout Transparente: com o token do cartão, a assinatura é criada já
 * autorizada e aplicada na hora. A troca cancela a anterior depois — só
 * quando o MP aceitou a nova, para um cartão recusado não derrubar ninguém.
 */
export async function assinarComCartao(args: { organizationId: string; plano: Plano; ciclo: Ciclo; payerEmail: string; cardTokenId: string; trocar?: boolean }): Promise<ResultadoDeAplicacao> {
  const atual = await assinaturaAtual(args.organizationId);
  const emVigor = atual && (atual.status === 'autorizada' || atual.status === 'pausada');
  if (emVigor && !args.trocar) throw new ErroDeAssinatura(409, 'Esta conta já tem uma assinatura em vigor. Para mudar de plano, use a troca.');

  const planId = mpPlanId(args.plano, args.ciclo);
  const pre = await criarAssinaturaComCartao({ plano: args.plano, ciclo: args.ciclo, organizationId: args.organizationId, payerEmail: args.payerEmail, cardTokenId: args.cardTokenId, planId });

  if (emVigor && atual?.mp_preapproval_id && pre.status === 'authorized') {
    try {
      await cancelarNoMp(atual.mp_preapproval_id);
    } catch (e: any) {
      console.error('[assinatura] não cancelou a anterior no MP:', e.message);
    }
  }
  // Intenções pendentes antigas saem; a nova entra e é aplicada como o webhook faria.
  await supabaseServer.from('assinaturas').delete().eq('organization_id', args.organizationId).eq('status', 'pendente').is('mp_preapproval_id', null);
  await supabaseServer.from('assinaturas').insert({ organization_id: args.organizationId, plano: args.plano, ciclo: args.ciclo, valor: precoDo(args.plano, args.ciclo), payer_email: args.payerEmail, mp_plan_id: planId, mp_preapproval_id: pre.id, status: 'pendente' });
  return aplicarPreapproval(pre, { organizationId: args.organizationId });
}

/** Cancela no MP e aqui. A conta continua até `plano_ate`; depois trava. */
export async function cancelarAssinatura(organizationId: string): Promise<Assinatura> {
  const atual = await assinaturaAtual(organizationId);
  if (!atual || (atual.status !== 'autorizada' && atual.status !== 'pausada')) throw new ErroDeAssinatura(409, 'Não há assinatura em vigor para cancelar.');
  if (atual.mp_preapproval_id) await cancelarNoMp(atual.mp_preapproval_id);
  const { data, error } = await supabaseServer
    .from('assinaturas')
    .update({ status: 'cancelada', cancelada_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', atual.id)
    .select('*')
    .single();
  if (error) throw error;
  esquecerPlano(organizationId);
  return data as Assinatura;
}

export class ErroDeAssinatura extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

// ---------------------------------------------------------------------------
//  O que o Mercado Pago conta (webhook e retorno)
// ---------------------------------------------------------------------------

export interface ResultadoDeAplicacao {
  casou: boolean;
  organizationId: string | null;
  assinatura: Assinatura | null;
  pagamento?: Pagamento;
  motivo?: string;
}

/** Existe organização com este id? */
async function organizacaoExiste(id: string | null | undefined): Promise<boolean> {
  if (!id || !UUID.test(id)) return false;
  const { data } = await supabaseServer.from('organizations').select('id').eq('id', id).maybeSingle();
  return Boolean(data);
}

/**
 * Descobre de quem é uma assinatura que o MP mandou:
 *  1. já está nas nossas tabelas (pelo id do MP);
 *  2. quem está chamando diz de quem é (o retorno do checkout, com login);
 *  3. a referência externa que a gente pôs na URL do checkout;
 *  4. uma intenção pendente cujo pagador tem o mesmo e-mail.
 */
async function acharDona(pre: PreapprovalMp, sugerida?: string): Promise<{ organizationId: string; intencao: Assinatura | null } | null> {
  const { data: existente } = await supabaseServer.from('assinaturas').select('*').eq('mp_preapproval_id', pre.id).maybeSingle();
  if (existente) return { organizationId: existente.organization_id, intencao: existente as Assinatura };

  const candidatas = [sugerida, pre.external_reference].filter((x): x is string => Boolean(x));
  for (const id of candidatas) {
    if (await organizacaoExiste(id)) {
      const { data: intencao } = await supabaseServer
        .from('assinaturas')
        .select('*')
        .eq('organization_id', id)
        .eq('status', 'pendente')
        .is('mp_preapproval_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { organizationId: id, intencao: (intencao as Assinatura) ?? null };
    }
  }

  if (pre.payer_email) {
    const { data: intencao } = await supabaseServer
      .from('assinaturas')
      .select('*')
      .eq('status', 'pendente')
      .is('mp_preapproval_id', null)
      .ilike('payer_email', pre.payer_email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (intencao) return { organizationId: intencao.organization_id, intencao: intencao as Assinatura };
  }
  return null;
}

/**
 * Grava uma assinatura que o MP contou e acerta o plano da organização.
 * Idempotente: o webhook pode repetir, o retorno pode chegar antes ou
 * depois — o resultado é o mesmo.
 */
export async function aplicarPreapproval(pre: PreapprovalMp, opcoes: { organizationId?: string } = {}): Promise<ResultadoDeAplicacao> {
  const dona = await acharDona(pre, opcoes.organizationId);
  if (!dona) return { casou: false, organizationId: null, assinatura: null, motivo: 'nenhuma organização corresponde (sem external_reference, intenção ou e-mail)' };
  if (opcoes.organizationId && dona.organizationId !== opcoes.organizationId) {
    return { casou: false, organizationId: dona.organizationId, assinatura: null, motivo: 'a assinatura pertence a outra organização' };
  }

  // Plano e ciclo: do plano do painel, senão da intenção, senão não dá.
  const doPainel = planoDoMpPlanId(pre.preapproval_plan_id, planoDeTeste());
  const plano = doPainel?.plano ?? dona.intencao?.plano ?? null;
  const ciclo = doPainel?.ciclo ?? dona.intencao?.ciclo ?? (pre.auto_recurring?.frequency === 12 ? 'anual' : 'mensal');
  if (!ehPlano(plano)) return { casou: false, organizationId: dona.organizationId, assinatura: null, motivo: `plano do MP desconhecido (${pre.preapproval_plan_id ?? 'sem plano'})` };

  const agora = new Date().toISOString();
  const status = traduzirStatus(pre.status);
  const campos = {
    organization_id: dona.organizationId,
    plano,
    ciclo,
    valor: pre.auto_recurring?.transaction_amount ?? precoDo(plano, ciclo),
    mp_preapproval_id: pre.id,
    mp_plan_id: pre.preapproval_plan_id ?? null,
    status,
    // O MP às vezes manda e-mail vazio; aí vale o de quem clicou em assinar.
    payer_email: pre.payer_email || dona.intencao?.payer_email || null,
    proxima_cobranca: pre.next_payment_date ?? null,
    autorizada_em: status === 'autorizada' ? (dona.intencao?.autorizada_em ?? agora) : (dona.intencao?.autorizada_em ?? null),
    cancelada_em: status === 'cancelada' ? (dona.intencao?.cancelada_em ?? agora) : null,
    updated_at: agora,
  };

  let assinatura: Assinatura;
  if (dona.intencao) {
    const { data, error } = await supabaseServer.from('assinaturas').update(campos).eq('id', dona.intencao.id).select('*').single();
    if (error) throw error;
    assinatura = data as Assinatura;
  } else {
    const { data, error } = await supabaseServer.from('assinaturas').insert(campos).select('*').single();
    if (error) throw error;
    assinatura = data as Assinatura;
  }

  if (status === 'autorizada') {
    // Outras assinaturas em vigor da mesma conta não valem mais (troca de plano).
    await supabaseServer.from('assinaturas').update({ status: 'cancelada', cancelada_em: agora, updated_at: agora }).eq('organization_id', dona.organizationId).eq('status', 'autorizada').neq('id', assinatura.id);
    const { data: org } = await supabaseServer.from('organizations').select('plano_desde').eq('id', dona.organizationId).maybeSingle();
    await supabaseServer
      .from('organizations')
      .update({ plano, plano_desde: org?.plano_desde ?? agora, plano_ate: planoAteDe(pre, ciclo), cobranca: 'cartao' })
      .eq('id', dona.organizationId);
  }
  // Cancelada ou pausada: a conta continua até plano_ate — nada a mudar aqui.

  esquecerPlano(dona.organizationId);
  return { casou: true, organizationId: dona.organizationId, assinatura };
}

/**
 * Quando o webhook não trouxe (ou a pessoa pagou pelo link direto, sem
 * passar pelo botão): procura nas assinaturas recentes da conta do MP uma
 * que seja desta organização — pela referência, pelo e-mail de quem
 * administra ou, em modo teste, pelo plano de teste — e aplica.
 */
export async function procurarEAplicar(organizationId: string, emails: string[]): Promise<ResultadoDeAplicacao> {
  const recentes = await procurarAssinaturasRecentes();
  const meus = new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const { data: conhecidas } = await supabaseServer.from('assinaturas').select('mp_preapproval_id, organization_id').not('mp_preapproval_id', 'is', null);
  const deOutra = new Set((conhecidas || []).filter((a: any) => a.organization_id !== organizationId).map((a: any) => a.mp_preapproval_id as string));

  const candidata = recentes.find((pre) => {
    if (deOutra.has(pre.id)) return false;
    if (pre.status !== 'authorized' && pre.status !== 'paused') return false;
    if (pre.external_reference === organizationId) return true;
    if (pre.payer_email && meus.has(pre.payer_email.toLowerCase())) return true;
    const teste = planoDeTeste();
    return Boolean(teste) && pre.preapproval_plan_id === teste;
  });
  if (!candidata) {
    // Diz o que viu, para o suporte entender sem abrir o painel do MP (sem e-mails de terceiros).
    const vistas = recentes.slice(0, 10).map((p) => `${p.status}/${p.preapproval_plan_id ?? 'sem-plano'}/${p.date_created?.slice(0, 10) ?? '?'}${p.payer_email && meus.has(p.payer_email.toLowerCase()) ? '/seu-email' : ''}`);
    return { casou: false, organizationId, assinatura: null, motivo: `nenhuma das ${recentes.length} assinaturas recentes da conta do Mercado Pago corresponde a esta organização${vistas.length ? ` (${vistas.join('; ')})` : ''}` };
  }
  const pre = await buscarAssinatura(candidata.id);
  return aplicarPreapproval(pre, { organizationId });
}

// ---------------------------------------------------------------------------
//  Pagamento avulso: Pix ou boleto do período inteiro
// ---------------------------------------------------------------------------

const REF_AVULSO = 'avulso:';

/** De `pending|approved|rejected|...` de um pagamento para o nosso status. */
export function traduzirStatusDePagamento(s: string | undefined): StatusPagamento {
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

/** "Stok Aí — Profissional (mensal)" na fatura, com o período. */
export function descricaoDoAvulso(plano: Plano, ciclo: Ciclo): string {
  return `Stok Aí — ${DEFINICOES[plano].nome} (${NOME_DO_CICLO[ciclo].toLowerCase()})`;
}

/**
 * Cria o pedido e pede o Pix/boleto ao MP. O registro nasce pendente com o
 * QR Code / boleto guardado em `dados`; o webhook (ou a consulta da tela)
 * aprova e aplica o período.
 */
export async function criarAvulso(args: { organizationId: string; plano: Plano; ciclo: Ciclo; metodo: 'pix' | 'boleto'; pagador: PagadorAvulso; valor: number }): Promise<Pagamento> {
  const agora = new Date();
  const venceEm = args.metodo === 'pix' ? new Date(agora.getTime() + PIX_VALIDADE_HORAS * 3600_000) : new Date(agora.getTime() + BOLETO_VALIDADE_DIAS * 24 * 3600_000);
  const descricao = descricaoDoAvulso(args.plano, args.ciclo);

  // Um pedido pendente por vez do mesmo método: o anterior sai.
  await supabaseServer.from('pagamentos').delete().eq('organization_id', args.organizationId).eq('status', 'pendente').neq('metodo', 'cartao').is('mp_payment_id', null);

  const { data: pedido, error } = await supabaseServer
    .from('pagamentos')
    .insert({ organization_id: args.organizationId, metodo: args.metodo, plano: args.plano, ciclo: args.ciclo, valor: args.valor, status: 'pendente', descricao, vence_em: venceEm.toISOString(), pagador: args.pagador, data: agora.toISOString() })
    .select('*')
    .single();
  if (error) throw error;

  let pay: PagamentoMp;
  try {
    pay = await criarPagamentoAvulso({ metodo: args.metodo, valor: args.valor, descricao, referencia: `${REF_AVULSO}${pedido.id}`, pagador: args.pagador, venceEm, idempotencia: pedido.id });
  } catch (e) {
    await supabaseServer.from('pagamentos').delete().eq('id', pedido.id);
    throw e;
  }
  const { data: atualizado, error: e2 } = await supabaseServer
    .from('pagamentos')
    .update({ mp_payment_id: String(pay.id), status: traduzirStatusDePagamento(pay.status), detalhe: pay.status_detail ?? null, dados: dadosParaPagar(pay), vence_em: pay.date_of_expiration ?? venceEm.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', pedido.id)
    .select('*')
    .single();
  if (e2) throw e2;
  return atualizado as Pagamento;
}

/**
 * O que o MP diz de um pagamento avulso: grava o status e, na primeira
 * aprovação, aplica o período — a partir de hoje, ou do fim do período
 * atual se a conta ainda está paga e no mesmo plano (renovação antecipada).
 */
export async function aplicarPagamentoAvulso(pay: PagamentoMp): Promise<ResultadoDeAplicacao> {
  const ref = String(pay.external_reference ?? '');
  let { data: pedido } = await supabaseServer.from('pagamentos').select('*').eq('mp_payment_id', String(pay.id)).maybeSingle();
  if (!pedido && ref.startsWith(REF_AVULSO)) {
    const r = await supabaseServer.from('pagamentos').select('*').eq('id', ref.slice(REF_AVULSO.length)).maybeSingle();
    pedido = r.data;
  }
  if (!pedido) return { casou: false, organizationId: null, assinatura: null, motivo: `pagamento ${pay.id} não é de um pedido nosso` };
  const p = pedido as Pagamento;
  const agora = new Date();
  const status = traduzirStatusDePagamento(pay.status);
  const patch: Record<string, unknown> = { mp_payment_id: String(pay.id), status, detalhe: pay.status_detail ?? null, updated_at: agora.toISOString() };

  if (status === 'aprovado' && !p.periodo_ate && ehPlano(p.plano) && p.ciclo) {
    const { data: org } = await supabaseServer.from('organizations').select('plano, plano_ate, plano_desde').eq('id', p.organization_id).maybeSingle();
    const aindaPago = org?.plano === p.plano && org?.plano_ate && new Date(org.plano_ate).getTime() > agora.getTime();
    const de = aindaPago ? new Date(org!.plano_ate as string) : agora;
    const ate = fimDoPeriodo(de, p.ciclo);
    patch.periodo_de = de.toISOString();
    patch.periodo_ate = ate.toISOString();
    patch.data = pay.date_approved ?? agora.toISOString();
    patch.nf_status = 'pendente';
    await supabaseServer.from('organizations').update({ plano: p.plano, plano_desde: org?.plano_desde ?? agora.toISOString(), plano_ate: ate.toISOString(), cobranca: 'avulso' }).eq('id', p.organization_id);
    esquecerPlano(p.organization_id);
  }
  const { data: atualizado, error } = await supabaseServer.from('pagamentos').update(patch).eq('id', p.id).select('*').single();
  if (error) throw error;
  return { casou: true, organizationId: p.organization_id, assinatura: null, pagamento: atualizado as Pagamento };
}

/** Consulta o MP e aplica — para a tela que fica esperando o Pix cair, sem depender do webhook. */
export async function atualizarAvulso(pedido: Pagamento): Promise<Pagamento> {
  if (!pedido.mp_payment_id) return pedido;
  const pay = await buscarPagamento(pedido.mp_payment_id);
  const r = await aplicarPagamentoAvulso(pay);
  return r.casou && 'pagamento' in r && r.pagamento ? r.pagamento : pedido;
}

/** Todos os pedidos avulsos pendentes ainda dentro da validade — para o cron conferir no MP. */
export async function avulsosPendentes(limite = 100): Promise<Pagamento[]> {
  const { data, error } = await supabaseServer.from('pagamentos').select('*').eq('status', 'pendente').neq('metodo', 'cartao').not('mp_payment_id', 'is', null).gte('vence_em', new Date(Date.now() - 2 * 24 * 3600_000).toISOString()).limit(limite);
  if (error) throw error;
  return (data || []) as Pagamento[];
}

/** O pedido avulso pendente mais recente da organização, se houver e ainda valer. */
export async function avulsoPendente(organizationId: string): Promise<Pagamento | null> {
  const { data } = await supabaseServer.from('pagamentos').select('*').eq('organization_id', organizationId).eq('status', 'pendente').neq('metodo', 'cartao').not('mp_payment_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const p = data as Pagamento;
  if (p.vence_em && new Date(p.vence_em).getTime() < Date.now()) return null;
  return p;
}

/** Grava uma cobrança e, se aprovada, estende o plano até a próxima. */
export async function aplicarPagamentoAutorizado(ap: PagamentoAutorizadoMp): Promise<ResultadoDeAplicacao> {
  let { data: assinatura } = await supabaseServer.from('assinaturas').select('*').eq('mp_preapproval_id', ap.preapproval_id).maybeSingle();
  if (!assinatura) {
    // A cobrança chegou antes da assinatura: busca a assinatura e tenta casar.
    const pre = await buscarAssinatura(ap.preapproval_id);
    const r = await aplicarPreapproval(pre);
    if (!r.casou) return r;
    assinatura = r.assinatura;
  }
  const a = assinatura as Assinatura;
  const { status, detalhe } = traduzirPagamento(ap);
  const agora = new Date().toISOString();
  const campos = {
    organization_id: a.organization_id,
    assinatura_id: a.id,
    metodo: 'cartao',
    plano: a.plano,
    ciclo: a.ciclo,
    mp_authorized_payment_id: String(ap.id),
    mp_payment_id: ap.payment?.id != null ? String(ap.payment.id) : null,
    status,
    valor: ap.transaction_amount ?? a.valor,
    moeda: ap.currency_id ?? 'BRL',
    detalhe,
    data: ap.debit_date ?? ap.date_created ?? agora,
    updated_at: agora,
  };
  const { data: gravado, error } = await supabaseServer
    .from('pagamentos')
    .upsert({ ...campos, ...(status === 'aprovado' ? { nf_status: 'pendente' } : {}), pagador: { nome: a.payer_email ?? '', email: a.payer_email ?? '' } }, { onConflict: 'mp_authorized_payment_id' })
    .select('*')
    .maybeSingle();
  if (error) throw error;

  if (status === 'aprovado') {
    // Pagou: o plano vale até a próxima cobrança que o MP agendou.
    const pre = await buscarAssinatura(ap.preapproval_id);
    await supabaseServer.from('assinaturas').update({ proxima_cobranca: pre.next_payment_date ?? null, status: traduzirStatus(pre.status), updated_at: agora }).eq('id', a.id);
    await supabaseServer.from('organizations').update({ plano: a.plano, plano_ate: planoAteDe(pre, a.ciclo), cobranca: 'cartao' }).eq('id', a.organization_id);
    esquecerPlano(a.organization_id);
  }
  return { casou: true, organizationId: a.organization_id, assinatura: a, pagamento: (gravado as Pagamento) ?? undefined };
}

/** Um evento do webhook, do jeito que chega: busca no MP e aplica. Devolve o que aconteceu, para o diário. */
export async function tratarEvento(tipo: string, id: string): Promise<ResultadoDeAplicacao | { ignorado: true }> {
  if (tipo === 'subscription_preapproval') return aplicarPreapproval(await buscarAssinatura(id));
  if (tipo === 'subscription_authorized_payment') return aplicarPagamentoAutorizado(await buscarPagamentoAutorizado(id));
  if (tipo === 'payment') {
    // Pix e boleto avulsos chegam aqui; os pagamentos das assinaturas também, mas esses o de cima já trata.
    const pay = await buscarPagamento(id);
    if (String(pay.external_reference ?? '').startsWith(REF_AVULSO)) return aplicarPagamentoAvulso(pay);
    return { ignorado: true };
  }
  // `subscription_preapproval_plan` e o resto: nada a fazer.
  return { ignorado: true };
}

/** O diário do webhook: um registro por evento recebido, com o desfecho. */
export async function registrarEvento(args: { tipo: string; mpId: string; organizationId: string | null; tratado: boolean; erro: string | null; payload: unknown }) {
  try {
    await supabaseServer.from('mp_eventos').insert({ tipo: args.tipo, mp_id: args.mpId, organization_id: args.organizationId, tratado: args.tratado, erro: args.erro, payload: args.payload ?? null });
  } catch (e: any) {
    console.error('[mp_eventos] não gravou:', e.message);
  }
}
