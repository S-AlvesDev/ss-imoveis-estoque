/**
 * Os dados da empresa em CSV, para ela levar para onde quiser: planilha,
 * outro sistema, o contador. Separador ";" e BOM, que é o que o Excel em
 * português abre sem perguntar nada.
 */

import { scopedDb } from './tenant';
import { depositosDaOrg, saldosDaOrg } from './estoque';

export const TABELAS_EXPORTAVEIS = ['materiais', 'movimentacoes', 'emprestimos', 'usuarios', 'fornecedores', 'cotacoes'] as const;
export type TabelaExportavel = (typeof TABELAS_EXPORTAVEIS)[number];

export function ehTabelaExportavel(v: unknown): v is TabelaExportavel {
  return TABELAS_EXPORTAVEIS.includes(v as TabelaExportavel);
}

function celula(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Cabeçalho + linhas → texto CSV com BOM. */
export function paraCsv(cabecalho: string[], linhas: unknown[][]): string {
  return '\ufeff' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';
}

const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const data = (iso: string | null | undefined) => (iso ? fmt.format(new Date(iso)) : '');

/** Todas as linhas de uma consulta, paginando o limite de 1000 do PostgREST. */
async function todas(construir: () => any): Promise<any[]> {
  const tudo: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await construir().range(de, de + 999);
    if (error) throw error;
    tudo.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  return tudo;
}

export async function exportarCsv(organizationId: string, tabela: TabelaExportavel): Promise<{ nome: string; csv: string }> {
  const db = scopedDb(organizationId);
  const hoje = new Date().toISOString().slice(0, 10);

  if (tabela === 'materiais') {
    const [materiais, depositos, saldos] = await Promise.all([
      todas(() => db.from('materials').select('id, nome, categoria, unidade_medida, estoque_minimo').order('nome')),
      depositosDaOrg(db, { incluirUnidadesInativas: true }),
      saldosDaOrg(db),
    ]);
    const ativos = depositos.filter((d) => d.ativo);
    const cab = ['id', 'nome', 'categoria', 'unidade', 'estoque_minimo', 'saldo_total', ...ativos.map((d) => `saldo:${d.nome}`)];
    const linhas = materiais.map((m) => {
      const s = saldos.get(m.id) ?? {};
      const total = ativos.reduce((a, d) => a + Number(s[d.id] ?? 0), 0);
      return [m.id, m.nome, m.categoria, m.unidade_medida, m.estoque_minimo, total, ...ativos.map((d) => Number(s[d.id] ?? 0))];
    });
    return { nome: `materiais-${hoje}.csv`, csv: paraCsv(cab, linhas) };
  }

  if (tabela === 'movimentacoes') {
    const depositos = await depositosDaOrg(db, { incluirUnidadesInativas: true });
    const nome = (id: string | null) => depositos.find((d) => d.id === id)?.nome ?? '';
    const movs = await todas(() => db.from('material_movements').select('id, created_at, tipo_operacao, quantidade, warehouse_origem_id, warehouse_destino_id, funcionario_matricula, justificativa, materials(nome, unidade_medida)').order('created_at', { ascending: false }));
    const cab = ['id', 'data', 'operacao', 'material', 'quantidade', 'unidade', 'origem', 'destino', 'matricula', 'justificativa'];
    const linhas = movs.map((m) => [m.id, data(m.created_at), m.tipo_operacao, m.materials?.nome, m.quantidade, m.materials?.unidade_medida, nome(m.warehouse_origem_id), nome(m.warehouse_destino_id), m.funcionario_matricula, m.justificativa]);
    return { nome: `movimentacoes-${hoje}.csv`, csv: paraCsv(cab, linhas) };
  }

  if (tabela === 'emprestimos') {
    const depositos = await depositosDaOrg(db, { incluirUnidadesInativas: true });
    const nome = (id: string | null) => depositos.find((d) => d.id === id)?.nome ?? '';
    const emp = await todas(() => db.from('loans').select('id, tipo, created_at, warehouse_id, tomador_nome, tomador_referencia, quantidade, quantidade_devolvida, prazo_em, devolvido_em, encerrado_em, materials(nome)').order('created_at', { ascending: false }));
    const cab = ['id', 'tipo', 'data', 'estoque', 'material', 'quem', 'referencia', 'quantidade', 'devolvido', 'prazo', 'devolvido_em', 'encerrado_em'];
    const linhas = emp.map((e) => [e.id, e.tipo, data(e.created_at), nome(e.warehouse_id), e.materials?.nome, e.tomador_nome, e.tomador_referencia, e.quantidade, e.quantidade_devolvida, data(e.prazo_em), data(e.devolvido_em), data(e.encerrado_em)]);
    return { nome: `emprestimos-${hoje}.csv`, csv: paraCsv(cab, linhas) };
  }

  if (tabela === 'usuarios') {
    const users = await todas(() => db.from('estoque_users').select('id, nome, matricula, email, role, ativo, whatsapp, created_at').order('nome'));
    const cab = ['id', 'nome', 'matricula', 'email', 'cargo', 'ativo', 'whatsapp', 'criado_em'];
    const linhas = users.map((u) => [u.id, u.nome, u.matricula, u.email, u.role, u.ativo ? 'sim' : 'não', u.whatsapp, data(u.created_at)]);
    return { nome: `usuarios-${hoje}.csv`, csv: paraCsv(cab, linhas) };
  }

  if (tabela === 'fornecedores') {
    const f = await todas(() => db.from('fornecedores').select('id, nome, whatsapp, contato, observacoes, ativo, created_at').order('nome'));
    const cab = ['id', 'nome', 'whatsapp', 'contato', 'observacoes', 'ativo', 'criado_em'];
    const linhas = f.map((x) => [x.id, x.nome, x.whatsapp, x.contato, x.observacoes, x.ativo ? 'sim' : 'não', data(x.created_at)]);
    return { nome: `fornecedores-${hoje}.csv`, csv: paraCsv(cab, linhas) };
  }

  // Cotações: uma linha por item × fornecedor, com o preço respondido.
  const cotacoes = await todas(() => db.from('cotacoes').select('id, titulo, status, created_at, entrega, itens, pedido').order('created_at', { ascending: false }));
  const linhasCf = await todas(() => db.from('cotacao_fornecedores').select('cotacao_id, fornecedor_id, status, precos, total, fornecedores(nome)'));
  const linhas: unknown[][] = [];
  for (const c of cotacoes) {
    for (const cf of linhasCf.filter((x) => x.cotacao_id === c.id)) {
      for (const item of (c.itens ?? []) as any[]) {
        const p = (Array.isArray(cf.precos) ? cf.precos : []).find((x: any) => x.n === item.n);
        const preco = p?.disponivel === false ? 'não tem' : (p?.preco_unitario ?? '');
        linhas.push([c.id, c.titulo, c.status, data(c.created_at), cf.fornecedores?.nome, cf.status, c.pedido?.fornecedor_id === cf.fornecedor_id ? 'sim' : '', item.n, item.descricao, item.quantidade, item.unidade, preco, p?.prazo ?? '', p?.observacao ?? '']);
      }
    }
  }
  const cab = ['cotacao_id', 'titulo', 'status', 'data', 'fornecedor', 'situacao_fornecedor', 'pedido_fechado', 'item', 'descricao', 'quantidade', 'unidade', 'preco_unitario', 'prazo', 'observacao'];
  return { nome: `cotacoes-${hoje}.csv`, csv: paraCsv(cab, linhas) };
}
