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

/**
 * "digitando…" no WhatsApp da pessoa. É só aparência, e é justamente por
 * isso que vale: a espera de três segundos deixa de parecer mudez. Falha
 * em silêncio — nunca atrasa nem derruba a resposta de verdade.
 */
export async function mostrarDigitando(telefone: string, instancia?: string | null, env: AmbienteEvolution = process.env as AmbienteEvolution): Promise<void> {
  const inst = instancia || (env.EVOLUTION_INSTANCE as string);
  try {
    await evo(`/chat/sendPresence/${encodeURIComponent(inst)}`, { method: 'POST', body: JSON.stringify({ number: telefone, presence: 'composing', delay: 1200 }) }, env);
  } catch {
    // Presença é enfeite: se a Evolution não tiver a rota, segue o jogo.
  }
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

// ---------------------------------------------------------------------------
//  O número da própria empresa: uma instância por organização
// ---------------------------------------------------------------------------

export interface QrCode {
  /** data:image/png;base64,… pronto para um <img>. */
  base64: string | null;
  /** Código de pareamento, quando a Evolution oferece. */
  codigo: string | null;
}

function lerQr(r: any): QrCode {
  const q = r?.qrcode ?? r;
  const base64 = q?.base64 ?? null;
  return { base64: base64 ? (String(base64).startsWith('data:') ? String(base64) : `data:image/png;base64,${base64}`) : null, codigo: q?.pairingCode ?? q?.code ?? null };
}

/** Cria a instância (idempotente: se já existe, só segue) e aponta o webhook para nós. */
export async function criarInstancia(nome: string, webhookUrl: string, env: AmbienteEvolution = process.env as AmbienteEvolution): Promise<void> {
  try {
    await evo(`/instance/create`, { method: 'POST', body: JSON.stringify({ instanceName: nome, integration: 'WHATSAPP-BAILEYS', qrcode: true, webhook: { url: webhookUrl, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] } }) }, env);
  } catch (e: any) {
    if (!/already|exist|em uso|in use/i.test(String(e.message))) throw e;
  }
  await configurarWebhook(nome, webhookUrl, env);
}

/** Garante o webhook da instância (formato da v2; cai para o da v1 se a Evolution for antiga). */
export async function configurarWebhook(nome: string, webhookUrl: string, env: AmbienteEvolution = process.env as AmbienteEvolution): Promise<void> {
  try {
    await evo(`/webhook/set/${encodeURIComponent(nome)}`, { method: 'POST', body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] } }) }, env);
  } catch {
    await evo(`/webhook/set/${encodeURIComponent(nome)}`, { method: 'POST', body: JSON.stringify({ enabled: true, url: webhookUrl, webhook_by_events: false, events: ['MESSAGES_UPSERT'] }) }, env);
  }
}

/** O QR code atual para conectar a instância (só faz sentido enquanto não está `open`). */
export async function qrDaInstancia(nome: string, env: AmbienteEvolution = process.env as AmbienteEvolution): Promise<QrCode> {
  return lerQr(await evo(`/instance/connect/${encodeURIComponent(nome)}`, {}, env));
}

/** Desconecta o número e apaga a instância. Tolerante: se já não existe, tudo bem. */
export async function apagarInstancia(nome: string, env: AmbienteEvolution = process.env as AmbienteEvolution): Promise<void> {
  try {
    await evo(`/instance/logout/${encodeURIComponent(nome)}`, { method: 'DELETE' }, env);
  } catch {
    // já estava desconectada
  }
  try {
    await evo(`/instance/delete/${encodeURIComponent(nome)}`, { method: 'DELETE' }, env);
  } catch (e: any) {
    if (!/not found|não encontrad|does not exist/i.test(String(e.message))) throw e;
  }
}

/** A instância padrão (o número do Stok Aí) — para saber se uma mensagem veio de um número de empresa. */
export function ehInstanciaDoStokAi(instancia: string | null | undefined, env: AmbienteEvolution = process.env as AmbienteEvolution): boolean {
  return !instancia || instancia === env.EVOLUTION_INSTANCE;
}

