import { describe, it, expect } from 'vitest';
import { compararCotacao, mensagemDeCotacao, mensagemDePedido, totalDaResposta, formatarMoeda, type ItemDeCotacao, type PrecoRespondido } from './cotacoes';

const itens: ItemDeCotacao[] = [
  { n: 1, material_id: 1, descricao: 'Cimento CP-II 50kg', quantidade: 10, unidade: 'sc' },
  { n: 2, material_id: null, descricao: 'Tinta acrílica branca 18L', quantidade: 2, unidade: 'lata' },
  { n: 3, material_id: 2, descricao: 'Areia média', quantidade: 1.5, unidade: 'm³' },
];

const A: PrecoRespondido[] = [
  { n: 1, preco_unitario: 32, disponivel: true, prazo: '2 dias', observacao: null },
  { n: 2, preco_unitario: 180, disponivel: true, prazo: null, observacao: null },
  { n: 3, preco_unitario: 120, disponivel: true, prazo: null, observacao: null },
];
const B: PrecoRespondido[] = [
  { n: 1, preco_unitario: 29.9, disponivel: true, prazo: 'amanhã', observacao: 'mínimo 5 sacos' },
  { n: 2, preco_unitario: null, disponivel: false, prazo: null, observacao: null },
  { n: 3, preco_unitario: 100, disponivel: true, prazo: null, observacao: null },
];

describe('mensagem ao fornecedor', () => {
  it('lista numerada, empresa, entrega e pedido de preço unitário', () => {
    const m = mensagemDeCotacao({ empresa: 'Imobiliária São Severino', contato: 'João', titulo: 'Obra Norte', itens, entrega: 'Obra Bairro Norte', observacoes: null });
    expect(m).toContain('Olá, João!');
    expect(m).toContain('assistente de compras da Imobiliária São Severino');
    expect(m).toContain('1) 10 sc — Cimento CP-II 50kg');
    expect(m).toContain('3) 1,5 m³ — Areia média');
    expect(m).toContain('Entrega em: Obra Bairro Norte');
    expect(m).toContain('preço unitário');
  });
  it('sem contato, cumprimenta sem nome', () => {
    expect(mensagemDeCotacao({ empresa: 'X', contato: null, titulo: 'T', itens, entrega: null, observacoes: null })).toMatch(/^Olá! 👋/);
  });
});

describe('totais e comparação', () => {
  it('soma quantidade × preço só do que tem preço e está disponível', () => {
    expect(totalDaResposta(itens, A)).toEqual({ total: 860, itensCotados: 3 });
    expect(totalDaResposta(itens, B)).toEqual({ total: 449, itensCotados: 2 });
    expect(totalDaResposta(itens, [])).toEqual({ total: 0, itensCotados: 0 });
  });
  it('marca o mais barato por item e o melhor total entre quem cotou tudo', () => {
    const c = compararCotacao(itens, [{ fornecedor_id: 'a', precos: A }, { fornecedor_id: 'b', precos: B }]);
    expect(c.porItem.map((p) => p.melhor)).toEqual(['b', 'a', 'b']);
    expect(c.totais.a).toEqual({ total: 860, itensCotados: 3, completo: true });
    expect(c.totais.b).toEqual({ total: 449, itensCotados: 2, completo: false });
    // B é mais barato no total, mas não cotou a tinta: quem cotou tudo ganha.
    expect(c.melhorTotal).toBe('a');
    // Cada item do mais barato: 10×29,9 + 2×180 + 1,5×100 = 809.
    expect(c.melhorCombinado).toBe(809);
  });
  it('sem ninguém completo, o menor total parcial ganha; sem resposta, ninguém', () => {
    const c = compararCotacao(itens, [{ fornecedor_id: 'b', precos: B }, { fornecedor_id: 'c', precos: [{ n: 1, preco_unitario: 50, disponivel: true, prazo: null, observacao: null }] }]);
    expect(c.melhorTotal).toBe('b');
    expect(compararCotacao(itens, [{ fornecedor_id: 'a', precos: [] }]).melhorTotal).toBeNull();
  });
});

describe('pedido', () => {
  it('só os itens com preço, com subtotal, total e nota fiscal', () => {
    // O Intl põe espaço duro depois do R$; para ler no teste, vira espaço comum.
    const m = mensagemDePedido({ empresa: 'Imobiliária São Severino', contato: null, titulo: 'Obra Norte', itens, precos: B, entrega: 'Obra Bairro Norte', observacoes: 'Falar com Carlos.' }).replace(/\u00a0/g, ' ');
    expect(m).toContain('1) 10 sc — Cimento CP-II 50kg — R$ 29,90 = R$ 299,00');
    expect(m).not.toContain('Tinta');
    expect(m).toContain('Total: R$ 449,00');
    expect(m).toContain('nota fiscal em nome da Imobiliária São Severino');
    expect(m).toContain('Falar com Carlos.');
  });
  it('formata dinheiro em real', () => {
    expect(formatarMoeda(1234.5).replace(/\u00a0/g, ' ')).toBe('R$ 1.234,50');
    expect(formatarMoeda(null)).toBe('—');
  });
});
