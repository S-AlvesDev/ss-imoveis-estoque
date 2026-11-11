import { supabaseServer } from '../../lib/supabaseServer';

/**
 * As mídias das conversas num bucket privado do Storage. Só o servidor
 * escreve e lê (chave de serviço); o navegador recebe uma URL assinada que
 * vale poucos minutos, e só depois de o servidor conferir que a pessoa pode
 * ver aquela conversa.
 *
 * Caminho: <empresa>/<conversa>/<mensagem>.<ext> — nunca se adivinha o de
 * outra empresa, e apagar uma conversa é apagar uma pasta.
 */
export const BUCKET_DE_MIDIAS = 'atende-midias';
export const URL_ASSINADA_SEGUNDOS = 10 * 60;
/**
 * A URL de VISUALIZAÇÃO vale 12 h, e é reaproveitada enquanto valer.
 *
 * Com 10 minutos, cada vez que alguém abria a conversa o servidor assinava
 * uma URL nova — e URL nova é endereço novo para o navegador, que então
 * baixava tudo outra vez. Trocar de conversa e voltar baixava a conversa
 * inteira de novo. Era isso que estava consumindo a franquia de tráfego do
 * Storage: o mesmo áudio, o mesmo print, dezenas de vezes por dia.
 *
 * Para o navegador poder guardar, o endereço tem de se repetir. Daí a
 * validade longa e a URL gravada na própria mensagem (ver `urlDaMidia`).
 * O download continua com a URL curta: é uma vez só, não há o que cachear.
 */
export const URL_DE_VISUALIZACAO_SEGUNDOS = 12 * 3600;
/** Reassina antes de vencer, para ninguém receber uma URL quase morta. */
export const MARGEM_PARA_REASSINAR_MS = 60 * 60 * 1000;
/**
 * Um ano. O caminho tem o id da mensagem, então o conteúdo daquele endereço
 * nunca muda — pode ser guardado para sempre, e todo byte que o navegador
 * guarda é um byte que não sai da nossa franquia.
 */
export const CACHE_DA_MIDIA = '31536000';
/** O máximo que aceitamos subir pela central (o bucket corta em 25 MB). */
export const MIDIA_MAX_BYTES = 20 * 1024 * 1024;

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

export function extensaoDe(mimetype: string, nome?: string | null): string {
  const doNome = nome ? /\.([a-z0-9]{1,5})$/i.exec(nome)?.[1]?.toLowerCase() : undefined;
  return EXTENSOES[mimetype.toLowerCase()] ?? EXTENSOES[mimetype.split(';')[0].trim().toLowerCase()] ?? doNome ?? 'bin';
}

export function caminhoDaMidia(empresaId: string, conversaId: string, mensagemId: string, mimetype: string, nome?: string | null): string {
  return `${empresaId}/${conversaId}/${mensagemId}.${extensaoDe(mimetype, nome)}`;
}

/** Sobe um arquivo em base64. Devolve o caminho gravado. */
export async function guardarMidia(caminho: string, base64: string, mimetype: string): Promise<{ caminho: string; tamanho: number }> {
  const bytes = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (bytes.length === 0) throw new Error('Arquivo vazio.');
  if (bytes.length > MIDIA_MAX_BYTES) throw new Error(`Arquivo grande demais (máximo ${Math.round(MIDIA_MAX_BYTES / 1024 / 1024)} MB).`);
  const { error } = await supabaseServer.storage.from(BUCKET_DE_MIDIAS).upload(caminho, bytes, { contentType: mimetype.split(';')[0].trim(), upsert: true, cacheControl: CACHE_DA_MIDIA });
  if (error) throw new Error(`Storage: ${error.message}`);
  return { caminho, tamanho: bytes.length };
}

/**
 * A URL para o navegador subir um arquivo direto no Storage — o arquivo não
 * passa pela função (a Vercel corta corpos acima de 4,5 MB). Vale 2 h e
 * aceita um único PUT.
 */
export async function urlDeUpload(caminho: string): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await supabaseServer.storage.from(BUCKET_DE_MIDIAS).createSignedUploadUrl(caminho);
  if (error || !data) throw new Error(`Storage: ${error?.message ?? 'sem URL de upload'}`);
  return { signedUrl: data.signedUrl, token: data.token };
}

/** O arquivo chegou? (o servidor não confia num caminho vindo do navegador). */
export async function tamanhoDaMidia(caminho: string): Promise<number | null> {
  const pasta = caminho.slice(0, caminho.lastIndexOf('/'));
  const nome = caminho.slice(caminho.lastIndexOf('/') + 1);
  const { data, error } = await supabaseServer.storage.from(BUCKET_DE_MIDIAS).list(pasta, { search: nome, limit: 5 });
  if (error) throw new Error(`Storage: ${error.message}`);
  const achado = (data || []).find((f) => f.name === nome);
  if (!achado) return null;
  return Number((achado.metadata as any)?.size ?? 0) || 0;
}

/** A URL que o navegador usa para ver/baixar, válida por poucos minutos. */
export async function urlAssinada(caminho: string, download?: string, segundos = URL_ASSINADA_SEGUNDOS): Promise<string> {
  const { data, error } = await supabaseServer.storage.from(BUCKET_DE_MIDIAS).createSignedUrl(caminho, segundos, download ? { download } : undefined);
  if (error || !data?.signedUrl) throw new Error(`Storage: ${error?.message ?? 'sem URL'}`);
  return data.signedUrl;
}

/** Que tipo de mensagem um arquivo vira, pelo mimetype. */
export function tipoPeloMimetype(mimetype: string): 'imagem' | 'video' | 'audio' | 'documento' {
  const m = mimetype.toLowerCase();
  if (m.startsWith('image/')) return 'imagem';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'documento';
}

/**
 * Dá para reaproveitar a URL já guardada nesta mídia?
 *
 * É a regra que faz o navegador conseguir cachear: enquanto a resposta for
 * sim, todo mundo recebe exatamente o mesmo endereço, e o arquivo não sai
 * do Storage de novo. A margem existe para ninguém receber uma URL que
 * vence no meio do carregamento de um vídeo.
 */
export function urlAindaServe(midia: any, agora = Date.now()): boolean {
  const url = midia?.url_vista;
  if (typeof url !== 'string' || !url) return false;
  const vence = Number(midia?.url_vista_vence);
  if (!Number.isFinite(vence)) return false;
  return vence - agora > MARGEM_PARA_REASSINAR_MS;
}
