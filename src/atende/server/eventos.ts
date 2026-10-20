import type { TipoDaMensagem, MidiaDaMensagem, StatusDaMensagem } from '../shared/tipos';

/**
 * O que a Evolution manda no webhook do Atende Aí, traduzido. Puro: recebe o
 * corpo, devolve o que interessa — sem banco, sem rede — para ser testado
 * com os formatos reais.
 *
 * Diferente do leitor do Stok Aí (src/server/evolution.ts), este aceita
 * `fromMe` (o que a empresa mandou pelo celular tem que aparecer na central),
 * entende todos os tipos de mídia, e lê também os eventos de status
 * (entregue/lida) e de conexão.
 */

export interface ChaveDaMensagem {
  id: string;
  remoteJid: string;
  fromMe: boolean;
}

export interface MensagemDoWhatsApp {
  tipoDeEvento: 'mensagem';
  instancia: string;
  chave: ChaveDaMensagem;
  /** Só dígitos com DDI. */
  telefone: string;
  fromMe: boolean;
  /** O nome que o contato usa no WhatsApp (pushName), quando vem. */
  nomeWhatsapp: string | null;
  tipo: TipoDaMensagem;
  texto: string | null;
  /** Metadados da mídia; o arquivo em si é baixado depois. `temArquivo` diz se há o que baixar. */
  midia: MidiaDaMensagem | null;
  temArquivo: boolean;
  /** O id da mensagem citada, se esta responde a outra. */
  respondendoA: string | null;
  /** Quando a mensagem foi enviada, segundo o WhatsApp. */
  em: Date;
}

export interface AtualizacaoDeStatus {
  tipoDeEvento: 'status';
  instancia: string;
  waId: string;
  status: StatusDaMensagem;
}

export interface AtualizacaoDeConexao {
  tipoDeEvento: 'conexao';
  instancia: string;
  /** 'open' | 'close' | 'connecting' */
  estado: string;
  numero: string | null;
}

export type EventoDoAtende = MensagemDoWhatsApp | AtualizacaoDeStatus | AtualizacaoDeConexao;

/** JID → telefone. '5584991234567@s.whatsapp.net' → '5584991234567'; grupos e status → nulo. */
export function telefoneDoJid(jid: unknown): string | null {
  const s = String(jid ?? '');
  if (!s.endsWith('@s.whatsapp.net')) return null;
  const d = s.split('@')[0].split(':')[0];
  return /^\d{10,15}$/.test(d) ? d : null;
}

/** Os códigos de status do WhatsApp (Baileys) e os nomes que a Evolution usa. */
export function traduzirStatus(s: unknown): StatusDaMensagem | null {
  const v = String(s ?? '').toUpperCase();
  if (v === '2' || v === 'SERVER_ACK' || v === 'SENT') return 'enviada';
  if (v === '3' || v === 'DELIVERY_ACK' || v === 'DELIVERED') return 'entregue';
  if (v === '4' || v === '5' || v === 'READ' || v === 'PLAYED') return 'lida';
  if (v === '0' || v === 'ERROR' || v === 'FAILED') return 'falhou';
  return null;
}

function texto(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

/**
 * Lê uma mensagem do `messages.upsert`. Devolve nulo para grupos, status
 * (stories), mensagens de protocolo e o que não for conversa individual.
 */
/**
 * O texto de uma mensagem interativa — botão, lista, template, enquete.
 *
 * O WhatsApp tem uma chave diferente para cada formato, e são dois lados: a
 * RESPOSTA de quem clicou (`...ResponseMessage`) e o ENVIO de quem ofereceu as
 * opções (o menu do bot). Antes só três formatos de resposta eram lidos, então
 * toda conversa com bot — o cliente que vem de um atendimento automático, ou o
 * menu que o próprio cliente manda — chegava com a bolha vazia: o atendente
 * não via nada e a triagem classificava como "sem conteúdo identificável".
 */
export function textoDeInterativa(real: any): string | null {
  const nativo = real?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (typeof nativo === 'string' && nativo.length < 4000) {
    try {
      const j = JSON.parse(nativo);
      const t = texto(j?.description ?? j?.title ?? j?.id);
      if (t) return t;
    } catch {
      /* paramsJson nem sempre é JSON — segue para as outras chaves */
    }
  }
  const candidatos = [
    // O que alguém escolheu
    real?.buttonsResponseMessage?.selectedDisplayText,
    real?.listResponseMessage?.title,
    real?.listResponseMessage?.singleSelectReply?.selectedRowId,
    real?.templateButtonReplyMessage?.selectedDisplayText,
    real?.interactiveResponseMessage?.body?.text,
    // O menu que o bot ofereceu
    real?.buttonsMessage?.contentText,
    real?.listMessage?.description,
    real?.listMessage?.title,
    real?.interactiveMessage?.body?.text,
    real?.interactiveMessage?.header?.title,
    real?.templateMessage?.hydratedTemplate?.hydratedContentText,
    real?.templateMessage?.hydratedFourRowTemplate?.hydratedContentText,
    // Outros que carregam texto
    real?.pollCreationMessage?.name,
    real?.pollCreationMessageV2?.name,
    real?.pollCreationMessageV3?.name,
    real?.eventMessage?.name,
    real?.productMessage?.product?.title,
    real?.requestPaymentMessage?.noteMessage?.extendedTextMessage?.text,
  ];
  for (const c of candidatos) {
    const t = texto(c);
    if (t) return t;
  }
  return null;
}

export function lerMensagem(body: any): MensagemDoWhatsApp | null {
  const dados = Array.isArray(body?.data) ? body.data[0] : body?.data;
  const chave = dados?.key;
  if (!chave?.remoteJid || !chave?.id) return null;
  const telefone = telefoneDoJid(chave.remoteJid);
  if (!telefone) return null;
  const m = dados.message ?? {};
  // Mensagem "efêmera" ou "view once" embrulha a de verdade.
  const real = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ?? m.documentWithCaptionMessage?.message ?? m;
  if (real.protocolMessage || real.reactionMessage || real.senderKeyDistributionMessage) return null;

  let tipo: TipoDaMensagem = 'outro';
  let txt: string | null = null;
  let midia: MidiaDaMensagem | null = null;
  let temArquivo = false;
  let respondendoA: string | null = null;

  const ctx = (bloco: any) => {
    const id = bloco?.contextInfo?.stanzaId;
    if (id) respondendoA = String(id);
  };

  if (real.conversation !== undefined) {
    tipo = 'texto';
    txt = texto(real.conversation);
  } else if (real.extendedTextMessage) {
    tipo = 'texto';
    txt = texto(real.extendedTextMessage.text);
    ctx(real.extendedTextMessage);
  } else if (real.imageMessage) {
    tipo = 'imagem';
    txt = texto(real.imageMessage.caption);
    midia = { mimetype: real.imageMessage.mimetype ?? 'image/jpeg', tamanho: numero(real.imageMessage.fileLength), largura: numero(real.imageMessage.width), altura: numero(real.imageMessage.height), pendente: true };
    temArquivo = true;
    ctx(real.imageMessage);
  } else if (real.videoMessage) {
    tipo = 'video';
    txt = texto(real.videoMessage.caption);
    midia = { mimetype: real.videoMessage.mimetype ?? 'video/mp4', tamanho: numero(real.videoMessage.fileLength), duracao: numero(real.videoMessage.seconds), pendente: true };
    temArquivo = true;
    ctx(real.videoMessage);
  } else if (real.audioMessage) {
    tipo = 'audio';
    midia = { mimetype: real.audioMessage.mimetype ?? 'audio/ogg', tamanho: numero(real.audioMessage.fileLength), duracao: numero(real.audioMessage.seconds), pendente: true };
    temArquivo = true;
    ctx(real.audioMessage);
  } else if (real.documentMessage) {
    tipo = 'documento';
    txt = texto(real.documentMessage.caption);
    midia = { mimetype: real.documentMessage.mimetype ?? 'application/octet-stream', nome: texto(real.documentMessage.fileName) ?? undefined, tamanho: numero(real.documentMessage.fileLength), pendente: true };
    temArquivo = true;
    ctx(real.documentMessage);
  } else if (real.stickerMessage) {
    tipo = 'figurinha';
    midia = { mimetype: real.stickerMessage.mimetype ?? 'image/webp', pendente: true };
    temArquivo = true;
  } else if (real.locationMessage || real.liveLocationMessage) {
    const l = real.locationMessage ?? real.liveLocationMessage;
    tipo = 'localizacao';
    txt = texto(l.name) ?? texto(l.address) ?? texto(l.caption);
    midia = { latitude: Number(l.degreesLatitude), longitude: Number(l.degreesLongitude) };
    ctx(l);
  } else if (real.contactMessage || real.contactsArrayMessage) {
    tipo = 'contato';
    const c = real.contactMessage ?? real.contactsArrayMessage?.contacts?.[0];
    const vcard = String(c?.vcard ?? '');
    const tel = /TEL[^:]*:([+\d\s().-]+)/i.exec(vcard)?.[1]?.replace(/\D/g, '') ?? '';
    const nome = texto(c?.displayName) ?? /FN:(.+)/i.exec(vcard)?.[1]?.trim() ?? 'Contato';
    txt = nome;
    midia = { contato: { nome, telefone: tel } };
  } else {
    // Botão, lista, enquete, template… — o que os bots do outro lado mandam.
    tipo = 'outro';
    txt = textoDeInterativa(real);
    // Sem texto, guarda QUAL formato chegou. Antes a mensagem ficava em branco
    // na tela e invisível para a triagem, sem deixar pista de onde melhorar.
    if (!txt) {
      const chaveDesconhecida = Object.keys(real).find((k) => k !== 'messageContextInfo');
      if (chaveDesconhecida) midia = { desconhecido: chaveDesconhecida };
    }
  }

  const ts = Number(dados.messageTimestamp ?? dados.message_timestamp ?? 0);
  return {
    tipoDeEvento: 'mensagem',
    instancia: String(body.instance ?? ''),
    chave: { id: String(chave.id), remoteJid: String(chave.remoteJid), fromMe: Boolean(chave.fromMe) },
    telefone,
    fromMe: Boolean(chave.fromMe),
    nomeWhatsapp: chave.fromMe ? null : texto(dados.pushName),
    tipo,
    texto: txt,
    midia,
    temArquivo,
    respondendoA,
    em: ts > 0 ? new Date(ts * (ts < 1e12 ? 1000 : 1)) : new Date(),
  };
}

function numero(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** `messages.update`: entregue/lida/falhou por id. Pode vir um ou vários. */
export function lerStatus(body: any): AtualizacaoDeStatus[] {
  const lista = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
  const saida: AtualizacaoDeStatus[] = [];
  for (const d of lista) {
    const waId = d?.key?.id ?? d?.keyId ?? d?.messageId;
    const status = traduzirStatus(d?.update?.status ?? d?.status);
    if (waId && status) saida.push({ tipoDeEvento: 'status', instancia: String(body.instance ?? ''), waId: String(waId), status });
  }
  return saida;
}

/** `connection.update`: aberta, fechada, conectando — e o número, quando a Evolution informa. */
export function lerConexao(body: any): AtualizacaoDeConexao | null {
  const d = Array.isArray(body?.data) ? body.data[0] : body?.data;
  const estado = d?.state ?? d?.connection ?? d?.status;
  if (!estado) return null;
  const numero = telefoneDoJid(d?.wuid ?? d?.jid) ?? (typeof d?.number === 'string' ? d.number.replace(/\D/g, '') || null : null);
  return { tipoDeEvento: 'conexao', instancia: String(body.instance ?? ''), estado: String(estado).toLowerCase(), numero };
}

/** O evento inteiro: qual é, e o que traz. Nulo para o que não interessa. */
export function lerEventoDoAtende(body: any): EventoDoAtende[] {
  if (!body || typeof body !== 'object') return [];
  const evento = String(body.event ?? '').toLowerCase().replace(/_/g, '.');
  if (evento === 'messages.upsert') {
    const m = lerMensagem(body);
    return m ? [m] : [];
  }
  if (evento === 'messages.update') return lerStatus(body);
  if (evento === 'connection.update') {
    const c = lerConexao(body);
    return c ? [c] : [];
  }
  return [];
}

/** Um rótulo curto de uma mensagem para a lista de conversas: o texto, ou "[foto]". */
export function previaDe(tipo: TipoDaMensagem, texto: string | null): string {
  if (tipo === 'texto') return texto ?? '';
  const rotulo: Record<Exclude<TipoDaMensagem, 'texto'>, string> = { imagem: '📷 Foto', audio: '🎤 Áudio', video: '🎬 Vídeo', documento: '📄 Documento', figurinha: 'Figurinha', localizacao: '📍 Localização', contato: '👤 Contato', outro: 'Mensagem' };
  return texto ? `${rotulo[tipo]} · ${texto}` : rotulo[tipo];
}
