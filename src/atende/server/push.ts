import webpush from 'web-push';
import { supabaseServer } from '../../lib/supabaseServer';
import type { RequisicaoAtende } from './auth';

/**
 * Notificações por push (Web Push) do Atende Aí: "cliente respondeu",
 * "nova conversa na fila", "conversa transferida para você" — chegam ao
 * celular e ao computador mesmo com o Atende fechado.
 *
 * Precisa de um par de chaves VAPID no ambiente (VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY; VAPID_SUBJECT é o contato). Sem elas, nada quebra: a
 * tela avisa que o push não está disponível neste servidor e as
 * notificações ficam só na aba aberta.
 *
 * Quem recebe o quê é decidido aqui (destinatariosDaConversa), com a mesma
 * regra da tela: quem está atendendo a conversa; sem ninguém, o time dela;
 * sem time, todo mundo que atende.
 */

export interface CargaDoPush {
  titulo: string;
  corpo: string;
  /** Caminho a abrir ao tocar (ex.: /atende/central/<id>). */
  url: string;
  /** Agrupa notificações da mesma conversa: a nova substitui a anterior. */
  tag: string;
  conversaId?: string;
}

interface AmbientePush {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export function pushConfigurado(env: AmbientePush = process.env as AmbientePush): boolean {
  return Boolean(String(env.VAPID_PUBLIC_KEY ?? '').trim() && String(env.VAPID_PRIVATE_KEY ?? '').trim());
}

export function chavePublica(env: AmbientePush = process.env as AmbientePush): string | null {
  const c = String(env.VAPID_PUBLIC_KEY ?? '').trim();
  return c || null;
}

let vapidPronto = false;
function prepararVapid(env: AmbientePush = process.env as AmbientePush) {
  if (vapidPronto) return;
  webpush.setVapidDetails(String(env.VAPID_SUBJECT ?? '').trim() || 'mailto:team@stokai.app', String(env.VAPID_PUBLIC_KEY).trim(), String(env.VAPID_PRIVATE_KEY).trim());
  vapidPronto = true;
}

// ---------------------------------------------------------------------------
//  Inscrições (a pessoa, num aparelho)
// ---------------------------------------------------------------------------

export class ErroDePush extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** O que o navegador manda em `PushSubscription.toJSON()`. */
export function lerInscricao(corpo: unknown): { endpoint: string; p256dh: string; auth: string } {
  const s = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, any>;
  const endpoint = String(s.endpoint ?? '').trim();
  const p256dh = String(s.keys?.p256dh ?? '').trim();
  const auth = String(s.keys?.auth ?? '').trim();
  if (!/^https:\/\/.{10,2000}$/.test(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) throw new ErroDePush('Inscrição inválida.');
  return { endpoint, p256dh, auth };
}

export async function inscrever(req: RequisicaoAtende, corpo: unknown, aparelho: string | null): Promise<void> {
  if (!pushConfigurado()) throw new ErroDePush('As notificações por push não estão configuradas neste servidor.', 503);
  const s = lerInscricao(corpo);
  const db = req.dbAtende!;
  // O endpoint é do aparelho: se outra pessoa entrou no mesmo navegador, a inscrição passa a ser dela.
  const { error } = await db.from('atende_push_inscricoes').upsert({ usuario_id: req.sessao!.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, aparelho: aparelho ? aparelho.slice(0, 200) : null, usado_em: new Date().toISOString() }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function cancelar(req: RequisicaoAtende, endpoint: unknown): Promise<void> {
  const e = String(endpoint ?? '').trim();
  if (!e) return;
  await req.dbAtende!.from('atende_push_inscricoes').delete().eq('endpoint', e).eq('usuario_id', req.sessao!.id);
}

export async function situacao(req: RequisicaoAtende): Promise<{ configurado: boolean; chave: string | null; inscricoes: number }> {
  const { count } = await req.dbAtende!.from('atende_push_inscricoes').select('id', { count: 'exact', head: true }).eq('usuario_id', req.sessao!.id);
  return { configurado: pushConfigurado(), chave: chavePublica(), inscricoes: count ?? 0 };
}

// ---------------------------------------------------------------------------
//  Envio (sem sessão: chamado pelo webhook e pela triagem)
// ---------------------------------------------------------------------------

/**
 * Quem deve saber de uma conversa: quem está atendendo; sem ninguém, os
 * membros do time; sem time, todo mundo ativo da empresa. `exceto` tira
 * quem causou o evento (não se avisa a si mesmo).
 */
export async function destinatariosDaConversa(empresaId: string, conversa: { atendente_id: number | null; time_id: string | null }, exceto: number | null = null): Promise<number[]> {
  let ids: number[];
  if (conversa.atendente_id) ids = [Number(conversa.atendente_id)];
  else if (conversa.time_id) {
    const { data } = await supabaseServer.from('atende_time_membros').select('usuario_id').eq('time_id', conversa.time_id);
    ids = ((data || []) as any[]).map((m) => Number(m.usuario_id));
  } else {
    const { data } = await supabaseServer.from('atende_usuarios').select('id').eq('empresa_id', empresaId).eq('ativo', true);
    ids = ((data || []) as any[]).map((u) => Number(u.id));
  }
  return [...new Set(ids)].filter((id) => id !== exceto);
}

/** Manda a mesma notificação para todos os aparelhos das pessoas. Nunca lança: falha vira log; inscrição morta é apagada. */
export async function notificar(empresaId: string, usuarioIds: number[], carga: CargaDoPush): Promise<{ enviadas: number; apagadas: number }> {
  const r = { enviadas: 0, apagadas: 0 };
  if (!pushConfigurado() || usuarioIds.length === 0) return r;
  const { data } = await supabaseServer.from('atende_push_inscricoes').select('id, endpoint, p256dh, auth').eq('empresa_id', empresaId).in('usuario_id', usuarioIds);
  const inscricoes = (data || []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;
  if (!inscricoes.length) return r;
  prepararVapid();
  const corpo = JSON.stringify(carga);
  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, corpo, { TTL: 60 * 60, urgency: 'high', topic: carga.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '_') });
        r.enviadas++;
      } catch (e: any) {
        const status = Number(e?.statusCode ?? 0);
        if (status === 404 || status === 410) {
          await supabaseServer.from('atende_push_inscricoes').delete().eq('id', i.id);
          r.apagadas++;
        } else console.error('[atende push]', status || '', String(e?.body ?? e?.message ?? e).slice(0, 200));
      }
    }),
  );
  if (r.enviadas) void supabaseServer.from('atende_push_inscricoes').update({ usado_em: new Date().toISOString() }).in('id', inscricoes.map((i) => i.id)).then(() => undefined, () => undefined);
  return r;
}

/** Atalho: avisa quem cuida da conversa. */
export async function avisarSobreConversa(empresaId: string, conversa: { id: string; atendente_id: number | null; time_id: string | null }, carga: Omit<CargaDoPush, 'url' | 'tag' | 'conversaId'>, exceto: number | null = null): Promise<void> {
  if (!pushConfigurado()) return;
  try {
    const ids = await destinatariosDaConversa(empresaId, conversa, exceto);
    await notificar(empresaId, ids, { ...carga, url: `/atende/central/${conversa.id}`, tag: `conversa-${conversa.id}`, conversaId: conversa.id });
  } catch (e: any) {
    console.error('[atende push] avisar:', e.message);
  }
}
