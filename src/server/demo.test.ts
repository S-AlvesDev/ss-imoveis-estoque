import { describe, it, expect } from 'vitest';
import { validarPedidoDemo, ehRobo, emailDoPedido, TAMANHOS_DE_OPERACAO } from './demo';

const valido = {
  nome: '  Ana Souza ',
  empresa: 'Construtora Horizonte',
  email: 'ANA@Horizonte.com.br',
  telefone: '(84) 99999-0000',
  tamanho: '2-5',
  origem: 'hero',
};

describe('validarPedidoDemo — o que passa', () => {
  it('limpa espaços e baixa o e-mail', () => {
    const r = validarPedidoDemo(valido);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pedido).toEqual({
      nome: 'Ana Souza',
      empresa: 'Construtora Horizonte',
      email: 'ana@horizonte.com.br',
      telefone: '(84) 99999-0000',
      tamanho: '2-5',
      origem: 'hero',
    });
  });

  it('telefone é opcional', () => {
    const r = validarPedidoDemo({ ...valido, telefone: '' });
    expect(r.ok && r.pedido.telefone).toBeNull();
  });

  it('aceita todas as faixas de operação', () => {
    for (const tamanho of TAMANHOS_DE_OPERACAO) {
      expect(validarPedidoDemo({ ...valido, tamanho }).ok).toBe(true);
    }
  });

  it('origem inesperada vira nula em vez de reprovar o pedido', () => {
    const r = validarPedidoDemo({ ...valido, origem: '<script>' });
    expect(r.ok && r.pedido.origem).toBeNull();
  });
});

describe('validarPedidoDemo — o que reprova', () => {
  it.each([
    ['corpo vazio', {}, 'nome'],
    ['nome curto', { ...valido, nome: 'A' }, 'nome'],
    ['empresa longa', { ...valido, empresa: 'x'.repeat(81) }, 'empresa'],
    ['e-mail sem arroba', { ...valido, email: 'ana.horizonte.com' }, 'e-mail'],
    ['telefone com texto', { ...valido, telefone: 'me liga' }, 'telefone'],
    ['tamanho fora da lista', { ...valido, tamanho: 'muitas' }, 'tamanho'],
    ['campos com tipo errado', { ...valido, nome: 42 }, 'nome'],
  ])('%s', (_, body, campo) => {
    const r = validarPedidoDemo(body);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.toLowerCase()).toContain(campo);
  });

  it('não é derrubado por corpo que não é objeto', () => {
    expect(validarPedidoDemo(null).ok).toBe(false);
    expect(validarPedidoDemo('texto').ok).toBe(false);
  });
});

describe('ehRobo', () => {
  it('pessoa não preenche o campo escondido', () => {
    expect(ehRobo(valido)).toBe(false);
  });
  it('robô preenche', () => {
    expect(ehRobo({ ...valido, site: 'http://spam.example' })).toBe(true);
  });
});

describe('emailDoPedido', () => {
  it('escapa o que veio do formulário', () => {
    const r = validarPedidoDemo({ ...valido, nome: 'Ana <b>Souza</b>', empresa: 'A & B' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { subject, html } = emailDoPedido(r.pedido);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('A &amp; B');
    expect(subject).toBe('Pedido de demonstração: A & B');
  });

  it('mostra o rótulo da faixa, não o código', () => {
    const r = validarPedidoDemo({ ...valido, tamanho: '20+', telefone: '' });
    if (!r.ok) throw new Error('deveria validar');
    const { html } = emailDoPedido(r.pedido);
    expect(html).toContain('Mais de 20 unidades');
    expect(html).toContain('—'); // telefone ausente
  });
});
