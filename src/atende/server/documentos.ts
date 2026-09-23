import { randomUUID } from 'crypto';
import { supabaseServer } from '../../lib/supabaseServer';
import { extensaoDe } from './midias';
import type { RequisicaoAtende } from './auth';
import { ErroDeConversa } from './conversas';
import { TIPOS_DE_DOCUMENTO, type DocumentoDoCliente, type TipoDeDocumento } from '../shared/tipos';

/**
 * Documentos de um cliente (RG, CPF, comprovante de renda, contrato…) —
 * para quem analisa crédito (MCMV) conferir sem precisar abrir a conversa
 * do WhatsApp. Mesmo padrão de Storage privado + URL assinada de
 * `midias.ts`, num bucket próprio: o arquivo nunca passa pela função
 * (a Vercel corta corpos grandes), o navegador sobe direto.
 */

export const BUCKET_DE_DOCUMENTOS = 'atende-documentos';
export const URL_ASSINADA_SEGUNDOS = 10 * 60;
export const DOCUMENTO_MAX_BYTES = 20 * 1024 * 1024;

const COLUNAS = 'id, cliente_id, nome_arquivo, mimetype, tipo, tamanho, anexado_por, criado_em';

function caminhoDoDocumento(empresaId: string, clienteId: string, documentoId: string, mimetype: string, nome?: string | null): string {
  return `${empresaId}/${clienteId}/${documentoId}.${extensaoDe(mimetype, nome)}`;
}

export async function listarDocumentos(req: RequisicaoAtende, clienteId: string): Promise<DocumentoDoCliente[]> {
  const { data, error } = await req.dbAtende!.from('atende_documentos_cliente').select(COLUNAS).eq('cliente_id', clienteId).order('criado_em', { ascending: false });
  if (error) {
    if (/atende_documentos_cliente/.test(error.message)) return []; // sem a migração 048 ainda
    throw error;
  }
  return (data || []) as unknown as DocumentoDoCliente[];
}

/** A URL para o navegador subir o arquivo direto no Storage. */
export async function prepararUploadDeDocumento(req: RequisicaoAtende, clienteId: string, dados: { mimetype?: unknown; nome?: unknown; tamanho?: unknown }): Promise<{ documentoId: string; caminho: string; signedUrl: string; token: string }> {
  const { data: cliente } = await req.dbAtende!.from('atende_clientes').select('id').eq('id', clienteId).maybeSingle();
  if (!cliente) throw new ErroDeConversa('Cliente não encontrado.', 404);
  const mimetype = String(dados.mimetype ?? '').trim().toLowerCase();
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(mimetype)) throw new ErroDeConversa('Tipo de arquivo inválido.');
  const tamanho = Number(dados.tamanho ?? 0);
  if (!Number.isFinite(tamanho) || tamanho <= 0) throw new ErroDeConversa('Arquivo vazio.');
  if (tamanho > DOCUMENTO_MAX_BYTES) throw new ErroDeConversa(`Arquivo grande demais (máximo ${Math.round(DOCUMENTO_MAX_BYTES / 1024 / 1024)} MB).`, 413);
  const documentoId = randomUUID();
  const caminho = caminhoDoDocumento(req.sessao!.empresa_id, clienteId, documentoId, mimetype, typeof dados.nome === 'string' ? dados.nome : null);
  const { data, error } = await supabaseServer.storage.from(BUCKET_DE_DOCUMENTOS).createSignedUploadUrl(caminho);
  if (error || !data) throw new Error(`Storage: ${error?.message ?? 'sem URL de upload'}`);
  return { documentoId, caminho, signedUrl: data.signedUrl, token: data.token };
}

/** Depois do upload direto no Storage: grava o registro. */
export async function registrarDocumento(req: RequisicaoAtende, clienteId: string, args: { documentoId: string; caminho: string; nome: string; mimetype: string; tamanho: number; tipo?: string }): Promise<DocumentoDoCliente[]> {
  if (!args.caminho.startsWith(`${req.sessao!.empresa_id}/${clienteId}/`) || args.caminho.includes('..')) throw new ErroDeConversa('Arquivo inválido.');
  const tipo = (TIPOS_DE_DOCUMENTO as readonly string[]).includes(String(args.tipo)) ? (args.tipo as TipoDeDocumento) : 'outro';
  const { error } = await req.dbAtende!.from('atende_documentos_cliente').insert({
    id: args.documentoId,
    cliente_id: clienteId,
    nome_arquivo: args.nome.slice(0, 200),
    mimetype: args.mimetype,
    caminho: args.caminho,
    tipo,
    tamanho: args.tamanho,
    anexado_por: req.sessao!.id,
  });
  if (error) throw error;
  return listarDocumentos(req, clienteId);
}

/** A URL para baixar/ver — confere que o documento é desta empresa antes de assinar. */
export async function urlDoDocumento(req: RequisicaoAtende, documentoId: string): Promise<string> {
  const { data: doc, error } = await req.dbAtende!.from('atende_documentos_cliente').select('caminho, nome_arquivo').eq('id', documentoId).maybeSingle();
  if (error) throw error;
  if (!doc) throw new ErroDeConversa('Documento não encontrado.', 404);
  const { data, error: erroUrl } = await supabaseServer.storage.from(BUCKET_DE_DOCUMENTOS).createSignedUrl(doc.caminho, URL_ASSINADA_SEGUNDOS, { download: doc.nome_arquivo });
  if (erroUrl || !data?.signedUrl) throw new Error(`Storage: ${erroUrl?.message ?? 'sem URL'}`);
  return data.signedUrl;
}

export async function excluirDocumento(req: RequisicaoAtende, documentoId: string): Promise<void> {
  const { data: doc } = await req.dbAtende!.from('atende_documentos_cliente').select('caminho').eq('id', documentoId).maybeSingle();
  if (!doc) throw new ErroDeConversa('Documento não encontrado.', 404);
  const { error } = await req.dbAtende!.from('atende_documentos_cliente').delete().eq('id', documentoId);
  if (error) throw error;
  await supabaseServer.storage.from(BUCKET_DE_DOCUMENTOS).remove([doc.caminho]);
}
