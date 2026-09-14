/**
 * Mercado Pago — a API de assinaturas (preapproval), do jeito que o Stok Aí usa.
 *
 * Duas portas de entrada para o pagador:
 *  - o checkout de um PLANO criado no painel (os links mpago.la): a URL leva
 *    o id do plano e a nossa referência; o MP cria a assinatura e avisa pelo
 *    webhook;
 *  - uma assinatura SEM plano criada pela API com o valor do catálogo — para
 *    o que ainda não existe no painel (o anual). O MP devolve um `init_point`.
 *
 * Nada aqui decide o que fazer com a assinatura: isso é de assinaturas.ts.
 * Aqui é só falar com a API e validar o que chega do webhook.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MP_PLANO_DE_TESTE, MP_PLANO_ID, precoDo, DEFINICOES, NOME_DO_CICLO, type Plano, type Ciclo } from '../shared/planos';

const API = 'https://api.mercadopago.com';
const CHECKOUT_DE_PLANO = 'https://www.mercadopago.com.br/subscriptions/checkout';

export interface AmbienteMp {
  MP_ACCESS_TOKEN?: string;
  /** Chave pública: vai ao navegador para tokenizar o cartão (Checkout Transparente). */
  MP_PUBLIC_KEY?: string;
  MP_WEBHOOK_SECRET?: string;
  /** '1' troca o Essencial mensal pelo plano de R$ 0,50 do painel. */
  MP_MODO_TESTE?: string;
  SITE_URL?: string;
  VITE_SITE_URL?: string;
}

export function modoTeste(env: AmbienteMp = process.env as AmbienteMp): boolean {
  return env.MP_MODO_TESTE === '1';
}

export function mpConfigurado(env: AmbienteMp = process.env as AmbienteMp): boolean {
  return Boolean(env.MP_ACCESS_TOKEN);
}

/** A chave pública, se o cartão pode ser digitado dentro do site. Só faz sentido junto com o access token. */
export function mpPublicKey(env: AmbienteMp = process.env as AmbienteMp): string | null {
  return env.MP_ACCESS_TOKEN && env.MP_PUBLIC_KEY ? env.MP_PUBLIC_KEY : null;
}

function siteUrl(env: AmbienteMp): string {
  return (env.SITE_URL || env.VITE_SITE_URL || 'https://stokai.app').replace(/\/+$/, '');
}

/** Para onde o Mercado Pago manda a pessoa depois do checkout. */
export function urlDeRetorno(env: AmbienteMp = process.env as AmbienteMp): string {
  return `${siteUrl(env)}/assinatura/retorno`;
}

/** O id do plano do painel para este plano e ciclo — com o de teste no lugar do Essencial mensal quando pedido. */
export function mpPlanId(plano: Plano, ciclo: Ciclo, env: AmbienteMp = process.env as AmbienteMp): string | null {
  if (modoTeste(env) && plano === 'essencial' && ciclo === 'mensal') return MP_PLANO_DE_TESTE;
  return MP_PLANO_ID[plano][ciclo];
}

/**
 * A URL do checkout de um plano do painel. `external_reference` é a nossa
 * organização: quando o MP a devolve na assinatura, o casamento é direto;
 * quando não, o retorno e o e-mail do pagador resolvem.
 */
export function urlDoCheckoutDoPlano(planId: string, organizationId: string): string {
  const q = new URLSearchParams({ preapproval_plan_id: planId, external_reference: organizationId });
  return `${CHECKOUT_DE_PLANO}?${q.toString()}`;
}

/** "Stok Aí — Profissional (mensal)" — o que aparece na fatura do cartão e no painel. */
export function motivo(plano: Plano, ciclo: Ciclo): string {
  return `Stok Aí — ${DEFINICOES[plano].nome} (${NOME_DO_CICLO[ciclo].toLowerCase()})`;
}

/** O corpo de POST /preapproval para uma assinatura sem plano do painel. */
export function corpoDaAssinatura(args: { plano: Plano; ciclo: Ciclo; organizationId: string; payerEmail: string; env?: AmbienteMp }) {
  const env = args.env ?? (process.env as AmbienteMp);
  return {
    reason: motivo(args.plano, args.ciclo),
    external_reference: args.organizationId,
    payer_email: args.payerEmail,
    auto_recurring: {
      frequency: args.ciclo === 'anual' ? 12 : 1,
      frequency_type: 'months',
      transaction_amount: precoDo(args.plano, args.ciclo),
      currency_id: 'BRL',
    },
    back_url: urlDeRetorno(env),
    status: 'pending',
  };
}

// ---------------------------------------------------------------------------
//  O que a API devolve (só os campos que usamos)
// ---------------------------------------------------------------------------

export type StatusMp = 'pending' | 'authorized' | 'paused' | 'cancelled';

export interface PreapprovalMp {
  id: string;
  status: StatusMp;
  reason?: string;
  external_reference?: string | null;
  payer_email?: string | null;
  payer_id?: number | null;
  preapproval_plan_id?: string | null;
  init_point?: string;
  next_payment_date?: string | null;
  date_created?: string;
  auto_recurring?: { frequency?: number; frequency_type?: string; transaction_amount?: number; currency_id?: string };
}

export interface PagamentoAutorizadoMp {
  id: number | string;
  preapproval_id: string;
  status: 'scheduled' | 'processed' | 'recycling' | 'cancelled' | string;
  transaction_amount?: number;
  currency_id?: string;
  date_created?: string;
  debit_date?: string;
  last_modified?: string;
  payment?: { id?: number | string; status?: string; status_detail?: string } | null;
}

// ---------------------------------------------------------------------------
//  Chamadas
// ---------------------------------------------------------------------------

/** Um erro que a API do MP devolveu, com o status e o corpo — a rota decide o que dizer. */
export class ErroDoMercadoPago extends Error {
  constructor(
    public status: number,
    mensagem: string,
    public corpo: any = null,
  ) {
    super(mensagem);
  }
}

/** A frase para quem está pagando, a partir do que o MP respondeu. */
export function mensagemParaOPagador(e: unknown): string {
  if (!(e instanceof ErroDoMercadoPago)) return 'Não foi possível concluir o pagamento. Tente de novo.';
  const m = String(e.corpo?.message ?? '').toLowerCase();
  if (m.includes('card_token') || m.includes('token')) return 'O cartão não foi aceito. Confira os dados e tente de novo.';
  if (m.includes('payer') && m.includes('collector')) return 'Não é possível pagar com a conta que recebe. Use outro cartão/e-mail.';
  if (e.status === 400 || e.status === 402) return `O Mercado Pago recusou: ${e.corpo?.message ?? 'confira os dados do cartão.'}`;
  return 'O Mercado Pago não respondeu como esperado. Tente de novo em instantes.';
}

async function mp<T>(caminho: string, init: RequestInit = {}, env: AmbienteMp = process.env as AmbienteMp): Promise<T> {
  if (!env.MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN não configurado.');
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
  const texto = await r.text();
  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = { raw: texto };
  }
  if (!r.ok) {
    const msg = corpo?.message || corpo?.error || `HTTP ${r.status}`;
    throw new ErroDoMercadoPago(r.status, `Mercado Pago ${init.method ?? 'GET'} ${caminho}: ${msg}`, corpo);
  }
  return corpo as T;
}

export function criarAssinaturaSemPlano(args: Parameters<typeof corpoDaAssinatura>[0]): Promise<PreapprovalMp> {
  return mp<PreapprovalMp>('/preapproval', { method: 'POST', body: JSON.stringify(corpoDaAssinatura(args)) });
}

/**
 * Checkout Transparente: o cartão foi tokenizado no navegador e a assinatura
 * nasce autorizada aqui, sem ir ao site do MP. Com plano do painel, o valor é
 * o do plano; sem, vai o do catálogo.
 */
export interface RecorrenciaMp {
  frequency: number;
  frequency_type: string;
  transaction_amount: number;
  currency_id: string;
}

export function corpoDaAssinaturaComCartao(args: { plano: Plano; ciclo: Ciclo; organizationId: string; payerEmail: string; cardTokenId: string; planId: string | null; recorrenciaDoPlano?: RecorrenciaMp | null; env?: AmbienteMp }) {
  const env = args.env ?? (process.env as AmbienteMp);
  const base = { reason: motivo(args.plano, args.ciclo), external_reference: args.organizationId, payer_email: args.payerEmail, card_token_id: args.cardTokenId, back_url: urlDeRetorno(env), status: 'authorized' };
  // Com plano do painel, a recorrência é a do plano (valor, período) — copiada dele para não divergir.
  if (args.planId) return { ...base, preapproval_plan_id: args.planId, ...(args.recorrenciaDoPlano ? { auto_recurring: args.recorrenciaDoPlano } : {}) };
  return { ...base, auto_recurring: corpoDaAssinatura(args).auto_recurring };
}

/** A recorrência de um plano do painel (frequência, período, valor, moeda). */
export async function recorrenciaDoPlano(planId: string): Promise<RecorrenciaMp | null> {
  const p = await mp<{ auto_recurring?: Partial<RecorrenciaMp> }>(`/preapproval_plan/${encodeURIComponent(planId)}`);
  const r = p.auto_recurring;
  if (!r || r.frequency == null || !r.frequency_type || r.transaction_amount == null) return null;
  return { frequency: r.frequency, frequency_type: r.frequency_type, transaction_amount: r.transaction_amount, currency_id: r.currency_id ?? 'BRL' };
}

export async function criarAssinaturaComCartao(args: Parameters<typeof corpoDaAssinaturaComCartao>[0]): Promise<PreapprovalMp> {
  const recorrencia = args.planId && !args.recorrenciaDoPlano ? await recorrenciaDoPlano(args.planId) : args.recorrenciaDoPlano;
  return mp<PreapprovalMp>('/preapproval', { method: 'POST', body: JSON.stringify(corpoDaAssinaturaComCartao({ ...args, recorrenciaDoPlano: recorrencia })) });
}

export function buscarAssinatura(id: string): Promise<PreapprovalMp> {
  return mp<PreapprovalMp>(`/preapproval/${encodeURIComponent(id)}`);
}

/** Muda o valor (e o motivo) de uma assinatura autorizada — a troca de plano no mesmo ciclo. */
export function atualizarValor(id: string, valor: number, reason: string): Promise<PreapprovalMp> {
  return mp<PreapprovalMp>(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ auto_recurring: { transaction_amount: valor }, reason }) });
}

export function cancelarAssinatura(id: string): Promise<PreapprovalMp> {
  return mp<PreapprovalMp>(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
}

export function buscarPagamentoAutorizado(id: string): Promise<PagamentoAutorizadoMp> {
  return mp<PagamentoAutorizadoMp>(`/authorized_payments/${encodeURIComponent(id)}`);
}

/** As assinaturas mais recentes da conta do MP (todas as organizações). Para achar uma que o webhook não trouxe. */
export async function procurarAssinaturasRecentes(limite = 50, filtro: Record<string, string> = {}): Promise<PreapprovalMp[]> {
  const q = new URLSearchParams({ sort: 'date_created:desc', limit: String(limite), offset: '0', ...filtro });
  const r = await mp<{ results?: PreapprovalMp[] }>(`/preapproval/search?${q.toString()}`);
  return r.results ?? [];
}

/**
 * O que a credencial enxerga — para o suporte descobrir por que uma
 * assinatura não aparece: token de teste ou de produção, se o plano do
 * painel é visível com ela (senão é de outra conta), quantas assinaturas
 * existem. Nunca devolve a credencial.
 */
export async function diagnostico(env: AmbienteMp = process.env as AmbienteMp) {
  const token = env.MP_ACCESS_TOKEN ?? '';
  const tipoDoToken = !token ? 'ausente' : token.startsWith('APP_USR-') ? 'producao' : token.startsWith('TEST-') ? 'teste' : 'desconhecido';
  const planos: Record<string, string> = {};
  const ids = [MP_PLANO_DE_TESTE, ...Object.values(MP_PLANO_ID).flatMap((c) => Object.values(c)).filter((x): x is string => Boolean(x))];
  for (const id of ids) {
    try {
      const p = await mp<{ id: string; status?: string; reason?: string; auto_recurring?: { transaction_amount?: number } }>(`/preapproval_plan/${id}`, {}, env);
      planos[id] = `${p.status ?? '?'} · ${p.reason ?? ''} · R$ ${p.auto_recurring?.transaction_amount ?? '?'}`;
    } catch (e: any) {
      planos[id] = `ERRO: ${String(e.message).slice(0, 120)}`;
    }
  }
  let busca: string;
  try {
    const r = await mp<{ paging?: { total?: number }; results?: PreapprovalMp[] }>('/preapproval/search?sort=date_created:desc&limit=10&offset=0', {}, env);
    busca = `total=${r.paging?.total ?? '?'} results=${r.results?.length ?? 0}: ${(r.results ?? []).map((p) => `${p.status}/${p.preapproval_plan_id ?? 'sem-plano'}/${p.date_created?.slice(0, 10)}`).join('; ')}`;
  } catch (e: any) {
    busca = `ERRO: ${String(e.message).slice(0, 160)}`;
  }
  let usuario: string;
  try {
    const u = await mp<{ id?: number; nickname?: string; site_id?: string }>('/users/me', {}, env);
    usuario = `${u.nickname ?? '?'} (id ${u.id ?? '?'}, ${u.site_id ?? '?'})`;
  } catch (e: any) {
    usuario = `ERRO: ${String(e.message).slice(0, 120)}`;
  }
  return { token: tipoDoToken, modo_teste: modoTeste(env), usuario, planos, busca, webhook_secret: Boolean(env.MP_WEBHOOK_SECRET) };
}

// ---------------------------------------------------------------------------
//  Webhook
// ---------------------------------------------------------------------------

/** O que chega em POST /api/webhooks/mercadopago. */
export interface EventoMp {
  type?: string;
  action?: string;
  data?: { id?: string | number };
  id?: string | number;
  live_mode?: boolean;
}

/**
 * Confere a assinatura do webhook: o cabeçalho `x-signature` traz `ts` e
 * `v1` (HMAC-SHA256 do "manifesto" com o segredo do painel). Sem segredo
 * configurado, não dá para conferir — devolve null e quem chama decide.
 */
export function assinaturaDoWebhookValida(args: { xSignature: string | undefined; xRequestId: string | undefined; dataId: string | undefined; secret: string | undefined }): boolean | null {
  if (!args.secret) return null;
  if (!args.xSignature || !args.dataId) return false;
  const partes = Object.fromEntries(
    args.xSignature.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;
  // Ids alfanuméricos vão em minúsculas no manifesto, como o MP documenta.
  const id = /^[a-zA-Z0-9]+$/.test(args.dataId) ? args.dataId.toLowerCase() : args.dataId;
  const manifesto = `id:${id};${args.xRequestId ? `request-id:${args.xRequestId};` : ''}ts:${ts};`;
  const esperado = createHmac('sha256', args.secret).update(manifesto).digest('hex');
  const a = Buffer.from(esperado);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** O id do objeto do evento: vem em `data.id` no corpo ou em `?data.id=` na URL. */
export function idDoEvento(body: EventoMp | undefined, query: Record<string, unknown>): string | null {
  const q = query['data.id'] ?? query['id'];
  const v = body?.data?.id ?? q;
  return v === undefined || v === null || v === '' ? null : String(v);
}

/** O tipo do evento, do corpo ou da URL (`?type=` / `?topic=`). */
export function tipoDoEvento(body: EventoMp | undefined, query: Record<string, unknown>): string {
  return String(body?.type ?? query['type'] ?? query['topic'] ?? '');
}
