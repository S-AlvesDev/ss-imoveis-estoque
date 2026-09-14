/**
 * Cotações: o que é puro e serve ao servidor e à tela — montar as
 * mensagens ao fornecedor, comparar respostas, formatar dinheiro.
 * Nada aqui fala com banco nem com WhatsApp.
 */

export interface ItemDeCotacao {
  /** Número do item na mensagem (1, 2, 3…): é assim que o fornecedor se refere a ele. */
  n: number;
  material_id: number | null;
  descricao: string;
  quantidade: number;
  unidade: string;
}

export interface PrecoRespondido {
  n: number;
  /** Nulo = não informou (ou não tem). */
  preco_unitario: number | null;
  disponivel: boolean;
  prazo: string | null;
  observacao: string | null;
}

export type StatusDaCotacao = 'aberta' | 'encerrada' | 'cancelada';
export type StatusDoFornecedorNaCotacao = 'pendente' | 'enviada' | 'respondida' | 'sem_estoque' | 'erro' | 'pedido';

export interface Fornecedor {
  id: string;
  nome: string;
  whatsapp: string;
  contato: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
}

export interface FalaComFornecedor {
  de: 'nos' | 'fornecedor';
  texto: string;
  em: string;
}

export interface FornecedorNaCotacao {
  fornecedor_id: string;
  fornecedor: Pick<Fornecedor, 'id' | 'nome' | 'whatsapp' | 'contato'>;
  status: StatusDoFornecedorNaCotacao;
  enviada_em: string | null;
  respondida_em: string | null;
  erro: string | null;
  precos: PrecoRespondido[];
  total: number | null;
  conversa: FalaComFornecedor[];
}

export interface Cotacao {
  id: string;
  titulo: string;
  itens: ItemDeCotacao[];
  entrega: string | null;
  observacoes: string | null;
  status: StatusDaCotacao;
  pedido: { fornecedor_id: string; total: number | null; enviado_em: string } | null;
  created_at: string;
  encerrada_em: string | null;
  criado_por: number | null;
  fornecedores: FornecedorNaCotacao[];
}

export const NOME_DO_STATUS_DO_FORNECEDOR: Record<StatusDoFornecedorNaCotacao, string> = {
  pendente: 'A enviar',
  enviada: 'Aguardando',
  respondida: 'Respondeu',
  sem_estoque: 'Sem estoque',
  erro: 'Não enviou',
  pedido: 'Pedido fechado',
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatarMoeda(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : moeda.format(v);
}

function qtd(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/** A lista numerada que vai na mensagem e que o fornecedor responde "1) 32,00". */
export function listarItens(itens: ItemDeCotacao[]): string {
  return itens.map((i) => `${i.n}) ${qtd(i.quantidade)} ${i.unidade} — ${i.descricao}`).join('\n');
}

/** A mensagem de cotação: texto fixo, sem IA, sempre igual para todo fornecedor. */
export function mensagemDeCotacao(args: { empresa: string; contato: string | null; titulo: string; itens: ItemDeCotacao[]; entrega: string | null; observacoes: string | null }): string {
  const linhas = [
    `Olá${args.contato ? `, ${args.contato}` : ''}! 👋`,
    `Aqui é o assistente de compras da ${args.empresa} (pelo Stok Aí).`,
    '',
    `Precisamos de cotação para "${args.titulo}":`,
    listarItens(args.itens),
    '',
  ];
  if (args.entrega) linhas.push(`Entrega em: ${args.entrega}`);
  if (args.observacoes) linhas.push(args.observacoes);
  if (args.entrega || args.observacoes) linhas.push('');
  linhas.push('Pode responder por aqui com o preço unitário de cada item (pelo número) e o prazo de entrega? Obrigado!');
  return linhas.join('\n');
}

/** Total de um fornecedor: quantidade × preço dos itens com preço e disponíveis. */
export function totalDaResposta(itens: ItemDeCotacao[], precos: PrecoRespondido[]): { total: number; itensCotados: number } {
  let total = 0;
  let itensCotados = 0;
  for (const item of itens) {
    const p = precos.find((x) => x.n === item.n);
    if (!p || !p.disponivel || p.preco_unitario === null) continue;
    total += item.quantidade * p.preco_unitario;
    itensCotados += 1;
  }
  return { total: Math.round(total * 100) / 100, itensCotados };
}

export interface Comparacao {
  /** Por item: o preço de cada fornecedor e quem é o mais barato. */
  porItem: Array<{ n: number; melhor: string | null; precos: Record<string, PrecoRespondido | undefined> }>;
  /** Por fornecedor: total, quantos itens cotou, se cotou tudo. */
  totais: Record<string, { total: number; itensCotados: number; completo: boolean }>;
  /** O fornecedor com o menor total entre os que cotaram tudo; senão, entre os que cotaram algo. */
  melhorTotal: string | null;
  /** Comprando cada item do mais barato: quanto daria. */
  melhorCombinado: number;
}

export function compararCotacao(itens: ItemDeCotacao[], respostas: Array<{ fornecedor_id: string; precos: PrecoRespondido[] }>): Comparacao {
  const porItem = itens.map((item) => {
    const precos: Record<string, PrecoRespondido | undefined> = {};
    let melhor: string | null = null;
    let menor = Infinity;
    for (const r of respostas) {
      const p = r.precos.find((x) => x.n === item.n);
      precos[r.fornecedor_id] = p;
      if (p && p.disponivel && p.preco_unitario !== null && p.preco_unitario < menor) {
        menor = p.preco_unitario;
        melhor = r.fornecedor_id;
      }
    }
    return { n: item.n, melhor, precos };
  });
  const totais: Comparacao['totais'] = {};
  for (const r of respostas) {
    const t = totalDaResposta(itens, r.precos);
    totais[r.fornecedor_id] = { ...t, completo: t.itensCotados === itens.length && itens.length > 0 };
  }
  const candidatos = Object.entries(totais).filter(([, t]) => t.itensCotados > 0);
  const completos = candidatos.filter(([, t]) => t.completo);
  const escolha = (completos.length ? completos : candidatos).sort((a, b) => a[1].total - b[1].total)[0];
  let melhorCombinado = 0;
  for (const linha of porItem) {
    const item = itens.find((i) => i.n === linha.n)!;
    const p = linha.melhor ? linha.precos[linha.melhor] : undefined;
    if (p && p.preco_unitario !== null) melhorCombinado += item.quantidade * p.preco_unitario;
  }
  return { porItem, totais, melhorTotal: escolha ? escolha[0] : null, melhorCombinado: Math.round(melhorCombinado * 100) / 100 };
}

/** A mensagem de pedido: os itens que fechamos com este fornecedor, com preço, total e a nota fiscal. */
export function mensagemDePedido(args: { empresa: string; contato: string | null; titulo: string; itens: ItemDeCotacao[]; precos: PrecoRespondido[]; entrega: string | null; observacoes: string | null }): string {
  const linhas: string[] = [];
  let total = 0;
  for (const item of args.itens) {
    const p = args.precos.find((x) => x.n === item.n);
    if (!p || !p.disponivel || p.preco_unitario === null) continue;
    const sub = item.quantidade * p.preco_unitario;
    total += sub;
    linhas.push(`${item.n}) ${qtd(item.quantidade)} ${item.unidade} — ${item.descricao} — ${formatarMoeda(p.preco_unitario)} = ${formatarMoeda(sub)}`);
  }
  const partes = [
    `Olá${args.contato ? `, ${args.contato}` : ''}! A ${args.empresa} fechou o pedido "${args.titulo}" com vocês: ✅`,
    '',
    ...linhas,
    `Total: ${formatarMoeda(Math.round(total * 100) / 100)}`,
    '',
  ];
  if (args.entrega) partes.push(`Entrega em: ${args.entrega}`);
  partes.push(`Por favor, entregue com a nota fiscal em nome da ${args.empresa}.`);
  if (args.observacoes) partes.push(args.observacoes);
  partes.push('', 'Qualquer dúvida, responda por aqui. Obrigado!');
  return partes.join('\n');
}
