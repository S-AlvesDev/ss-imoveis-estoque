import type { Cliente, Conversa } from '../../../shared/tipos';

/** Nome para mostrar: o que a equipe deu, o do WhatsApp, ou o telefone formatado. */
export function nomeDoCliente(c: Cliente): string {
  return c.nome?.trim() || c.nome_whatsapp?.trim() || telefoneBonito(c.telefone);
}

export function iniciais(nome: string): string {
  const p = nome.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/);
  const s = ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  return s || '#';
}

/** 5584991234567 → +55 (84) 99123-4567; outros países, só com o +. */
export function telefoneBonito(d: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  if (m) return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
  return `+${d}`;
}

/** Hora se foi hoje, "ontem", dia da semana na semana, data depois. */
export function quando(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  const mesmoDia = d.toDateString() === agora.toDateString();
  if (mesmoDia) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return 'ontem';
  const dias = (agora.getTime() - d.getTime()) / 86_400_000;
  if (dias < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Separador de dia na linha do tempo. */
export function rotuloDoDia(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === agora.toDateString()) return 'Hoje';
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

export function tamanhoBonito(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function duracaoBonita(s?: number): string {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

export const COR_DO_ESTADO: Record<Conversa['estado'], string> = {
  nova: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  em_triagem: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  na_fila: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  em_atendimento: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  aguardando_cliente: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  encerrada: 'bg-slate-500/10 text-slate-500',
};

/** Lê um arquivo do navegador como base64 puro (sem o prefixo data:). */
export function lerComoBase64(arquivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(arquivo);
  });
}

/** Tempo decorrido, curto: 90 s → "1 min"; 1h30 → "1 h 30"; 2 dias → "2 d". */
export function duracao(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`;
  return `${Math.floor(h / 24)} d`;
}
