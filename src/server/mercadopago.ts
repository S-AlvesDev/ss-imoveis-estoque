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
    throw new Error(`Mercado Pago ${init.method ?? 'GET'} ${caminho}: ${msg}`);
  }
  return corpo as T;
}

export function criarAssinaturaSemPlano(args: Parameters<typeof corpoDaAssinatura>[0]): Promise<PreapprovalMp> {
  return mp<PreapprovalMp>('/preapproval', { method: 'POST', body: JSON.stringify(corpoDaAssinatura(args)) });
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
