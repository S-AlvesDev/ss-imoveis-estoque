import type { RequisicaoAtende } from './auth';
import { ErroDeConversa } from './conversas';

/**
 * Modelos de mensagem: texto pronto (com o placeholder {nome}) que quem
 * atende insere de um clique ao responder, em vez de digitar a mesma
 * explicação de novo em cada conversa parecida.
 */

export interface ModeloDeMensagem {
  id: string;
  titulo: string;
  texto: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

const COLUNAS = 'id, titulo, texto, ativo, criado_em, atualizado_em';

export async function listarModelos(req: RequisicaoAtende, opcoes: { incluirInativos?: boolean } = {}): Promise<ModeloDeMensagem[]> {
  let q = req.dbAtende!.from('atende_modelos_mensagem').select(COLUNAS).order('titulo');
  if (!opcoes.incluirInativos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) {
    if (/atende_modelos_mensagem/.test(error.message)) return []; // sem a migração 047 ainda
    throw error;
  }
  return (data || []) as unknown as ModeloDeMensagem[];
}

function validarCampos(corpo: any) {
  const titulo = String(corpo?.titulo ?? '').trim().slice(0, 60);
  if (!titulo) throw new ErroDeConversa('Dê um título ao modelo.');
  const texto = String(corpo?.texto ?? '').trim().slice(0, 4000);
  if (!texto) throw new ErroDeConversa('Escreva o texto do modelo.');
  return { titulo, texto };
}

export async function criarModelo(req: RequisicaoAtende, corpo: any): Promise<ModeloDeMensagem[]> {
  const campos = validarCampos(corpo);
  const { error } = await req.dbAtende!.from('atende_modelos_mensagem').insert({ ...campos, criado_por: req.sessao!.id });
  if (error) throw error;
  return listarModelos(req);
}

export async function atualizarModelo(req: RequisicaoAtende, id: string, corpo: any): Promise<ModeloDeMensagem[]> {
  const campos = validarCampos(corpo);
  const ativo = corpo?.ativo === undefined ? undefined : Boolean(corpo.ativo);
  const { error } = await req.dbAtende!
    .from('atende_modelos_mensagem')
    .update({ ...campos, ...(ativo === undefined ? {} : { ativo }), atualizado_em: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return listarModelos(req, { incluirInativos: true });
}

export async function desativarModelo(req: RequisicaoAtende, id: string): Promise<ModeloDeMensagem[]> {
  const { error } = await req.dbAtende!.from('atende_modelos_mensagem').update({ ativo: false, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  return listarModelos(req);
}
