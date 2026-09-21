import { api } from './lib/api';

/**
 * As notificações do Atende Aí no navegador, em duas camadas:
 *
 * 1. Na aba aberta (sempre): som curto, contador no título e um toast
 *    quando o cliente responde ou chega conversa nova para mim ou para a
 *    minha fila. Vem do próprio sync — sem permissão nenhuma.
 * 2. Fora da aba (a pessoa ativa): Web Push pelo service worker
 *    (/atende/sw.js) — chega com o Atende fechado, no celular e no
 *    computador. No iPhone só depois de "Adicionar à Tela de Início".
 *
 * Sem VAPID no servidor, a camada 2 não existe e a tela diz isso.
 */

export type EstadoDasNotificacoes = 'sem_suporte' | 'negadas' | 'inativas' | 'ativas';

const CAMINHO_DO_SW = '/atende/sw.js';
const ESCOPO = '/atende/';
const CHAVE_DO_SOM = 'atende-som';

export function suportaPush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function ehIphoneNoNavegador(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalado = (window.matchMedia?.('(display-mode: standalone)').matches ?? false) || (navigator as any).standalone === true;
  return ios && !instalado;
}

/** Registra o service worker (idempotente). Nulo se o navegador não tem. */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(CAMINHO_DO_SW, { scope: ESCOPO });
  } catch (e) {
    console.warn('[atende] service worker:', e);
    return null;
  }
}

let inscricaoAtual: PushSubscription | null | undefined;

/** A inscrição deste navegador, se houver. */
export async function inscricaoLocal(): Promise<PushSubscription | null> {
  if (!suportaPush()) return null;
  if (inscricaoAtual !== undefined) return inscricaoAtual;
  const reg = await navigator.serviceWorker.getRegistration(ESCOPO);
  inscricaoAtual = (await reg?.pushManager.getSubscription()) ?? null;
  return inscricaoAtual;
}

export async function estadoDasNotificacoes(): Promise<EstadoDasNotificacoes> {
  if (!suportaPush()) return 'sem_suporte';
  if (Notification.permission === 'denied') return 'negadas';
  return (await inscricaoLocal()) ? 'ativas' : 'inativas';
}

function base64ParaBytes(b64: string): Uint8Array {
  const preenchido = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(preenchido.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Ativa: pede permissão (precisa vir de um clique), inscreve no push e
 * guarda no servidor. Lança com mensagem legível quando não dá.
 */
export async function ativarNotificacoes(): Promise<void> {
  if (!suportaPush()) throw new Error(ehIphoneNoNavegador() ? 'No iPhone, primeiro adicione o Atende Aí à Tela de Início (compartilhar → Adicionar à Tela de Início) e ative por lá.' : 'Este navegador não suporta notificações.');
  const { configurado, chave } = await api.get<{ configurado: boolean; chave: string | null }>('/push');
  if (!configurado || !chave) throw new Error('As notificações por push não estão configuradas neste servidor.');
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('Permissão negada. Libere as notificações do site nas configurações do navegador.');
  const reg = (await registrarServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chave) as BufferSource });
  await api.post('/push/inscrever', { inscricao: sub.toJSON() });
  inscricaoAtual = sub;
}

export async function desativarNotificacoes(): Promise<void> {
  const sub = await inscricaoLocal();
  if (!sub) return;
  try {
    await api.delete('/push/inscrever', { endpoint: sub.endpoint });
  } catch {
    /* o servidor apaga na próxima tentativa de envio */
  }
  await sub.unsubscribe();
  inscricaoAtual = null;
}

// ---------------------------------------------------------------------------
//  Som e título (camada 1)
// ---------------------------------------------------------------------------

export function somLigado(): boolean {
  try {
    return localStorage.getItem(CHAVE_DO_SOM) !== 'off';
  } catch {
    return true;
  }
}

export function definirSom(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE_DO_SOM, ligado ? 'on' : 'off');
  } catch {
    /* sem storage */
  }
}

let contexto: AudioContext | null = null;

/** Dois toques curtos, gerados na hora (sem arquivo de áudio). Silencioso se o navegador ainda não liberou som. */
export function tocarAviso() {
  if (!somLigado()) return;
  try {
    contexto ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (contexto.state === 'suspended') void contexto.resume();
    const t = contexto.currentTime;
    const o = contexto.createOscillator();
    const g = contexto.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.setValueAtTime(1175, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(contexto.destination);
    o.start(t);
    o.stop(t + 0.4);
  } catch {
    /* sem áudio */
  }
}

const TITULO_PADRAO = 'Atende Aí — Seu atendimento, no controle.';

/** ATD-07: o título da aba acompanha a tela (a que a página manda via <Pagina titulo="…">), não fica fixo. */
export function atualizarTitulo(naoLidas: number, tituloDaTela?: string | null) {
  if (typeof document === 'undefined') return;
  const base = tituloDaTela ? `${tituloDaTela} · Atende Aí` : TITULO_PADRAO;
  document.title = naoLidas > 0 ? `(${naoLidas}) ${base}` : base;
}

/** Notificação do sistema direto da página — só quando a aba está escondida e o push NÃO está ativo (senão o service worker cuida). */
export async function notificarDaPagina(titulo: string, corpo: string, tag: string, aoClicar: () => void) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
  if (await inscricaoLocal()) return;
  try {
    const n = new Notification(titulo, { body: corpo, icon: '/atende/favicon_atendeai.png', tag });
    n.onclick = () => {
      window.focus();
      aoClicar();
      n.close();
    };
  } catch {
    /* alguns navegadores só notificam pelo service worker */
  }
}
