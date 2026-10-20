import { supabaseServer } from '../../lib/supabaseServer';
import { fotoDoContato } from '../../server/evolution';

/**
 * A foto de perfil do cliente, guardada por nós.
 *
 * Antes, `atende_clientes.foto_url` guardava a URL que a Evolution devolve —
 * o CDN do WhatsApp (`pps.whatsapp.net/...&oe=6ABAD755`). Aquele `oe=` é uma
 * data de validade: passada ela, a Meta responde 403 e o avatar quebra para
 * sempre, porque a foto só era buscada uma vez, ao criar o cliente. No
 * ambiente de teste já havia três assim.
 *
 * Agora a imagem é baixada e guardada no bucket `logos` (o mesmo da logo da
 * empresa, já público e já criado — sem migração nova), sob um caminho
 * próprio. A URL que fica no banco é estável e não vence.
 *
 * Sobre privacidade: a foto JÁ era servida de uma URL pública e sem
 * autenticação (o CDN da Meta não pede nada). Guardá-la num bucket público,
 * em caminho com dois UUIDs, não abre nada que não estivesse aberto — e tira
 * a dependência de um domínio de terceiro dentro do painel.
 */

export const BUCKET_DAS_FOTOS = 'logos';
/** Avatar é imagem pequena; acima disto é coisa errada e não vale guardar. */
export const FOTO_MAX_BYTES = 2 * 1024 * 1024;
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Onde a foto de um cliente mora. Dois UUIDs: não se adivinha, não colide com as logos. */
export function caminhoDaFoto(empresaId: string, clienteId: string, mimetype = 'image/jpeg'): string {
  const ext = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';
  return `atende/clientes/${empresaId}/${clienteId}.${ext}`;
}

/** É uma URL do CDN do WhatsApp — ou seja, uma que vai vencer? */
export function ehUrlQueVence(url: string | null | undefined): boolean {
  if (!url) return false;
  return /(^|\.)whatsapp\.net\//i.test(url) || /pps\.whatsapp/i.test(url);
}

/**
 * Baixa a imagem e guarda no bucket. Devolve a URL pública, ou nulo quando
 * não deu — nunca estoura: um avatar é enfeite, não pode derrubar o registro
 * de uma mensagem que chegou.
 */
export async function guardarFotoDoCliente(empresaId: string, clienteId: string, url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const mimetype = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim().toLowerCase();
    if (!TIPOS.has(mimetype)) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (!bytes.length || bytes.length > FOTO_MAX_BYTES) return null;

    const caminho = caminhoDaFoto(empresaId, clienteId, mimetype);
    const { error } = await supabaseServer.storage.from(BUCKET_DAS_FOTOS).upload(caminho, bytes, { contentType: mimetype, upsert: true });
    if (error) {
      console.warn('[atende foto] storage:', error.message);
      return null;
    }
    return supabaseServer.storage.from(BUCKET_DAS_FOTOS).getPublicUrl(caminho).data.publicUrl;
  } catch (e: any) {
    console.warn('[atende foto] baixar:', String(e?.message ?? e).slice(0, 160));
    return null;
  }
}

/**
 * Conserta as fotos que já estão quebradas (ou prestes a quebrar): as que
 * ainda apontam para o CDN do WhatsApp. A URL guardada não serve mais — já
 * venceu —, então pede uma nova à Evolution e guarda a imagem.
 *
 * Roda no cron, aos poucos: é uma chamada à Evolution e um download por
 * cliente, e não há pressa nenhuma.
 */
export async function consertarFotosVencidas(limite = 25): Promise<{ olhadas: number; trocadas: number }> {
  const { data, error } = await supabaseServer
    .from('atende_clientes')
    .select('id, empresa_id, telefone, foto_url')
    .like('foto_url', '%whatsapp.net%')
    .limit(limite);
  if (error) {
    console.warn('[atende foto] procurar vencidas:', error.message);
    return { olhadas: 0, trocadas: 0 };
  }
  const clientes = (data || []) as Array<{ id: string; empresa_id: string; telefone: string; foto_url: string | null }>;
  if (!clientes.length) return { olhadas: 0, trocadas: 0 };

  // Uma consulta de instância por empresa, não por cliente.
  const instancias = new Map<string, string | null>();
  let trocadas = 0;
  for (const c of clientes) {
    if (!instancias.has(c.empresa_id)) {
      const { data: cx } = await supabaseServer.from('atende_conexoes').select('instancia').eq('empresa_id', c.empresa_id).maybeSingle();
      instancias.set(c.empresa_id, (cx as any)?.instancia ?? null);
    }
    const instancia = instancias.get(c.empresa_id) ?? null;
    if (!instancia) continue;
    // A URL guardada já venceu: a Evolution dá uma nova, e é dela que baixamos.
    const nova = await guardarFotoDoCliente(c.empresa_id, c.id, await fotoDoContato(c.telefone, instancia));
    // Não conseguiu (cliente sem foto, número saiu do WhatsApp): limpa, para a
    // tela mostrar as iniciais em vez de uma imagem quebrada.
    await supabaseServer.from('atende_clientes').update({ foto_url: nova }).eq('id', c.id);
    if (nova) trocadas += 1;
  }
  return { olhadas: clientes.length, trocadas };
}
