import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { mesclarPrecos, precosAtuais, midiaLegivel } from './cotacoes';
import type { ItemDeCotacao, PrecoRespondido } from '../shared/cotacoes';

const itens: ItemDeCotacao[] = [
  { n: 1, material_id: 1, descricao: 'Cimento CP-II 50kg', quantidade: 10, unidade: 'sc' },
  { n: 2, material_id: null, descricao: 'Tinta acrílica 18L', quantidade: 2, unidade: 'lata' },
];

describe('o que a IA diz ter lido', () => {
  it('registra preço, prazo e observação do item certo', () => {
    const { precos, mudou } = mesclarPrecos(itens, [], [{ n: 1, preco_unitario: 31.9, prazo: 'amanhã', observacao: 'mínimo 5 sacos' }]);
    expect(mudou).toBe(true);
    expect(precos).toEqual([{ n: 1, preco_unitario: 31.9, disponivel: true, prazo: 'amanhã', observacao: 'mínimo 5 sacos' }]);
  });
  it('"não tenho" é ausência, não preço zero', () => {
    const { precos } = mesclarPrecos(itens, [], [{ n: 2, disponivel: false }]);
    expect(precos[0]).toMatchObject({ n: 2, disponivel: false, preco_unitario: null });
  });
  it('arredonda centavos e recusa preço impossível', () => {
    expect(mesclarPrecos(itens, [], [{ n: 1, preco_unitario: 31.899 }]).precos[0].preco_unitario).toBe(31.9);
    for (const lixo of ['trinta reais', -5, Infinity, NaN, {}]) {
      expect(mesclarPrecos(itens, [], [{ n: 1, preco_unitario: lixo }]).precos[0].preco_unitario).toBeNull();
    }
  });
  it('ignora item que não está na cotação e entrada sem sentido', () => {
    expect(mesclarPrecos(itens, [], [{ n: 9, preco_unitario: 10 }])).toEqual({ precos: [], mudou: false });
    expect(mesclarPrecos(itens, [], [{ preco_unitario: 10 }, { n: 'x' }, null])).toEqual({ precos: [], mudou: false });
    expect(mesclarPrecos(itens, [], 'sei lá')).toEqual({ precos: [], mudou: false });
  });
  it('a resposta nova substitui a anterior do mesmo item e mantém a ordem', () => {
    const antes: PrecoRespondido[] = [
      { n: 1, preco_unitario: 35, disponivel: true, prazo: null, observacao: null },
      { n: 2, preco_unitario: 180, disponivel: true, prazo: null, observacao: null },
    ];
    const { precos } = mesclarPrecos(itens, antes, [{ n: 1, preco_unitario: 31.9 }]);
    expect(precos.map((p) => [p.n, p.preco_unitario])).toEqual([
      [1, 31.9],
      [2, 180],
    ]);
  });
  it('não mexe no que já estava quando nada aproveitável chega', () => {
    const antes: PrecoRespondido[] = [{ n: 1, preco_unitario: 31.9, disponivel: true, prazo: null, observacao: null }];
    expect(mesclarPrecos(itens, antes, [])).toEqual({ precos: antes, mudou: false });
  });
  it('corta texto gigante que a IA devolva', () => {
    const { precos } = mesclarPrecos(itens, [], [{ n: 1, preco_unitario: 1, prazo: 'x'.repeat(200), observacao: 'y'.repeat(500) }]);
    expect(precos[0].prazo).toHaveLength(80);
    expect(precos[0].observacao).toHaveLength(200);
  });
});

describe('o resumo que a IA vê a cada rodada', () => {
  it('diz o que falta, o que não tem e o que já tem preço', () => {
    const precos: PrecoRespondido[] = [
      { n: 1, preco_unitario: 31.9, disponivel: true, prazo: '2 dias', observacao: null },
      { n: 2, preco_unitario: null, disponivel: false, prazo: null, observacao: null },
    ];
    const texto = precosAtuais(itens, precos).replace(/ /g, ' ');
    expect(texto).toContain('1) Cimento CP-II 50kg: R$ 31,90/sc, prazo 2 dias');
    expect(texto).toContain('2) Tinta acrílica 18L: não tem');
    expect(precosAtuais(itens, []).split('\n')).toEqual(['1) Cimento CP-II 50kg: sem resposta', '2) Tinta acrílica 18L: sem resposta']);
  });
});

describe('arquivo que o fornecedor manda', () => {
  it('foto e PDF vão para a IA; áudio e o resto, não', () => {
    expect(midiaLegivel({ base64: 'x', mimetype: 'image/jpeg' })).toBe(true);
    expect(midiaLegivel({ base64: 'x', mimetype: 'application/pdf' })).toBe(true);
    expect(midiaLegivel({ base64: 'x', mimetype: 'audio/ogg' })).toBe(false);
    expect(midiaLegivel({ base64: 'x', mimetype: 'application/vnd.ms-excel' })).toBe(false);
    expect(midiaLegivel(null)).toBe(false);
    expect(midiaLegivel(undefined)).toBe(false);
  });
});
