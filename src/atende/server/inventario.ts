import type { RequisicaoAtende } from './auth';
import { ErroDeConversa } from './conversas';

/**
 * O inventário: o catálogo de itens da empresa — casas para alugar, remédios
 * de uma farmácia, o que for. Serve para quem atende consultar na hora e
 * para o Jatobá responder "quantas casas têm disponíveis?" com dado real.
 *
 * Tabela própria do Atende Aí (migração 046), independente do Stok Aí.
 */

export interface ItemDoInventario {
  id: string;
  nome: string;
  categoria: string | null;
  quantidade: number;
  preco: number | null;
  descricao: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

const COLUNAS = 'id, nome, categoria, quantidade, preco, descricao, ativo, criado_em, atualizado_em';

export async function listarInventario(req: RequisicaoAtende, opcoes: { incluirInativos?: boolean } = {}): Promise<ItemDoInventario[]> {
  let q = req.dbAtende!.from('atende_inventario_itens').select(COLUNAS).order('nome');
  if (!opcoes.incluirInativos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) {
    if (/atende_inventario_itens/.test(error.message)) return []; // sem a migração 046 ainda
    throw error;
  }
  return (data || []) as unknown as ItemDoInventario[];
}

function validarCampos(corpo: any) {
  const nome = String(corpo?.nome ?? '').trim().slice(0, 120);
  if (!nome) throw new ErroDeConversa('Dê um nome ao item.');
  const categoria = corpo?.categoria ? String(corpo.categoria).trim().slice(0, 60) : null;
  const quantidade = Number(corpo?.quantidade ?? 0);
  if (!Number.isFinite(quantidade) || quantidade < 0) throw new ErroDeConversa('Quantidade inválida.');
  const preco = corpo?.preco === null || corpo?.preco === undefined || corpo?.preco === '' ? null : Number(corpo.preco);
  if (preco !== null && (!Number.isFinite(preco) || preco < 0)) throw new ErroDeConversa('Preço inválido.');
  const descricao = corpo?.descricao ? String(corpo.descricao).trim().slice(0, 500) : null;
  return { nome, categoria, quantidade: Math.round(quantidade), preco, descricao };
}

export async function criarItem(req: RequisicaoAtende, corpo: any): Promise<ItemDoInventario[]> {
  const campos = validarCampos(corpo);
  const { error } = await req.dbAtende!.from('atende_inventario_itens').insert(campos);
  if (error) throw error;
  return listarInventario(req);
}

export async function atualizarItem(req: RequisicaoAtende, id: string, corpo: any): Promise<ItemDoInventario[]> {
  const campos = validarCampos(corpo);
  const ativo = corpo?.ativo === undefined ? undefined : Boolean(corpo.ativo);
  const { error } = await req.dbAtende!
    .from('atende_inventario_itens')
    .update({ ...campos, ...(ativo === undefined ? {} : { ativo }), atualizado_em: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return listarInventario(req, { incluirInativos: true });
}

export async function desativarItem(req: RequisicaoAtende, id: string): Promise<ItemDoInventario[]> {
  const { error } = await req.dbAtende!.from('atende_inventario_itens').update({ ativo: false, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  return listarInventario(req);
}

/** O que o Jatobá usa: procura por nome/categoria, só itens ativos. */
export async function consultarInventario(req: RequisicaoAtende, busca?: string, categoria?: string): Promise<Array<Pick<ItemDoInventario, 'nome' | 'categoria' | 'quantidade' | 'preco'>>> {
  let q = req.dbAtende!.from('atende_inventario_itens').select('nome, categoria, quantidade, preco').eq('ativo', true).order('nome').limit(30);
  if (busca) q = q.ilike('nome', `%${busca}%`);
  if (categoria) q = q.ilike('categoria', `%${categoria}%`);
  const { data, error } = await q;
  if (error) {
    if (/atende_inventario_itens/.test(error.message)) return []; // sem a migração 046 ainda
    throw error;
  }
  return (data || []) as unknown as Array<Pick<ItemDoInventario, 'nome' | 'categoria' | 'quantidade' | 'preco'>>;
}
