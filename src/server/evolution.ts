/**
 * Evolution API — o WhatsApp do Stok Aí.
 *
 * A Evolution roda num servidor nosso (VPS) com um número conectado por QR
 * Code, e expõe uma API HTTP: mandamos texto por ela e ela nos avisa, por
 * webhook, do que chega. Aqui é só o que fala com essa API; o que fazer
 * com cada mensagem é do assistente.ts.
 */

export interface AmbienteEvolution {
  /** Ex.: https://whatsapp.stokai.app */
  EVOLUTION_URL?: string;
  /** A chave global (AUTHENTICATION_API_KEY) da instalação. */
  EVOLUTION_API_KEY?: string;
  /** A instância padrão (o número do Stok Aí). */
  EVOLUTION_INSTANCE?: string;
  /** O que a Evolution manda em ?token= no webhook, para conferirmos que é ela. */
  EVOLUTION_WEBHOOK_TOKEN?: string;
}

export function evolutionConfigurada(env: AmbienteEvolution = process.env as AmbienteEvolution): boolean {
  return Boolean(env.EVOLUTION_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE);
}

function base(env: AmbienteEvolution): string {
  return (env.EVOLUTION_URL ?? '').replace(/\/+$/, '');
}

async function evo<T>(caminho: string, init: RequestInit = {}, env: AmbienteEvolution = process.env as AmbienteEvolution): Promise<T> {
  if (!evolutionConfigurada(env)) throw new Error('Evolution API não configurada (EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE).');
  const r = await fetch(`${base(env)}${caminho}`, {
    ...init,
    headers: { apikey: env.EVOLUTION_API_KEY as string, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
  const texto = await r.text();
  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = { raw: texto };
  }
  if (!r.ok) throw new Error(`Evolution ${init.method ?? 'GET'} ${caminho}: ${corpo?.response?.message ?? corpo?.message ?? corpo?.error ?? `HTTP ${r.status}`}`);
  return corpo as T;
}

/** Só dígitos, com DDI. "+55 (84) 99143-4190" → "5584991434190"; sem DDI, assume Brasil. */
export function normalizarTelefone(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return null;
  const comDdi = d.length <= 11 ? `55${d}` : d;
  return /^\d{12,15}$/.test(comDdi) ? comDdi : null;
}

/**
 * O mesmo número brasileiro nas duas grafias do WhatsApp: contas antigas
 * ainda aparecem sem o nono dígito (55 84 9128-4470), e o cadastro costuma
 * ter com (55 84 99128-4470). Devolve o próprio e o equivalente, quando há.
 */
export function variantesDoTelefone(telefone: string): string[] {
  const m = /^55(\d{2})(\d{8,9})$/.exec(telefone);
  if (!m) return [telefone];
  const [, ddd, local] = m;
  if (local.length === 9 && local.startsWith('9')) return [telefone, `55${ddd}${local.slice(1)}`];
  if (local.length === 8) return [telefone, `55${ddd}9${local}`];
  return [telefone];
}

/** Manda um texto para um número, pela instância pedida (ou a padrão). */
export async function enviarTexto(telefone: string, texto: string, instancia?: string | null, env: AmbienteEvolution = process.env as AmbienteEvolution): Promise<void> {
  const inst = instancia || (env.EVOLUTION_INSTANCE as string);
  await evo(`/message/sendText/${encodeURIComponent(inst)}`, { method: 'POST', body: JSON.stringify({ number: telefone, text: texto }) }, env);
}

/** Estado da conexão de uma instância: 'open' = conectada. */
export interface Midia {
  base64: string;
  mimetype: string;
}

/** Baixa a foto ou o arquivo de uma mensagem recebida, em base64. */
export async function baixarMidia(chave: { id: string; remoteJid: string; fromMe: boolean }, instancia?: string | null, env: AmbienteEvolution = process.env as AmbienteEvolution): Promise<Midia> {
  const inst = instancia || (env.EVOLUTION_INSTANCE as string);
  const r = await evo<{ base64?: string; mimetype?: string; mediaType?: string }>(`/chat/getBase64FromMediaMessage/${encodeURIComponent(inst)}`, { method: 'POST', body: JSON.stringify({ message: { key: chave }, convertToMp4: false }) }, env);
  if (!r.base64) throw new Error('A Evolution não devolveu o arquivo.');
  return { base64: r.base64, mimetype: r.mimetype ?? 'application/octet-stream' };
}

export async function estadoDaInstancia(instancia?: string | null, env: AmbienteEvolution = process.env as AmbienteEvolution): Promise<string> {
  const inst = instancia || (env.EVOLUTION_INSTANCE as string);
  const r = await evo<{ instance?: { state?: string }; state?: string }>(`/instance/connectionState/${encodeURIComponent(inst)}`, {}, env);
  return r.instance?.state ?? r.state ?? 'desconhecido';
}

// ---------------------------------------------------------------------------
//  O webhook: o que a Evolution manda quando chega mensagem
// ---------------------------------------------------------------------------

export interface MensagemRecebida {
  instancia: string;
  telefone: string;
  nome: string | null;
  texto: string | null;
  /** 'texto' | 'imagem' | 'audio' | 'documento' | 'outro' */
  tipo: 'texto' | 'imagem' | 'audio' | 'documento' | 'outro';
  idMensagem: string | null;
  /** A chave da mensagem na Evolution — é com ela que se baixa a foto ou o arquivo. */
  chave: { id: string; remoteJid: string; fromMe: boolean } | null;
  /** Tipo do arquivo (image/jpeg, application/pdf), quando a mensagem traz um. */
  mimetype: string | null;
}

/**
 * Extrai a mensagem de um evento `messages.upsert`. Ignora o que não é
 * conversa individual (grupos, status) e o que nós mesmos mandamos.
 * Devolve null para o que não interessa.
 */
export function lerEvento(body: any): MensagemRecebida | null {
  if (!body || typeof body !== 'object') return null;
  const evento = String(body.event ?? '').toLowerCase().replace(/_/g, '.');
  if (evento !== 'messages.upsert') return null;
  const dados = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!dados?.key) return null;
  if (dados.key.fromMe) return null;
  const jid = String(dados.key.remoteJid ?? '');
  if (!jid.endsWith('@s.whatsapp.net')) return null; // grupo, broadcast, status
  const telefone = normalizarTelefone(jid.split('@')[0]);
  if (!telefone) return null;

  const m = dados.message ?? {};
  let texto: string | null = null;
  let tipo: MensagemRecebida['tipo'] = 'outro';
  if (typeof m.conversation === 'string') {
    texto = m.conversation;
    tipo = 'texto';
  } else if (m.extendedTextMessage?.text) {
    texto = String(m.extendedTextMessage.text);
    tipo = 'texto';
  } else if (m.imageMessage) {
    texto = m.imageMessage.caption ? String(m.imageMessage.caption) : null;
    tipo = 'imagem';
  } else if (m.audioMessage) {
    tipo = 'audio';
  } else if (m.documentMessage) {
    texto = m.documentMessage.caption ? String(m.documentMessage.caption) : null;
    tipo = 'documento';
  }
  const mimetype = m.imageMessage?.mimetype ?? m.documentMessage?.mimetype ?? m.audioMessage?.mimetype ?? null;
  const chave = dados.key.id ? { id: String(dados.key.id), remoteJid: jid, fromMe: false } : null;
  return { instancia: String(body.instance ?? ''), telefone, nome: dados.pushName ? String(dados.pushName) : null, texto: texto?.trim() || null, tipo, idMensagem: dados.key.id ? String(dados.key.id) : null, chave, mimetype: mimetype ? String(mimetype) : null };
}
