import { describe, it, expect, vi } from 'vitest';

/**
 * O Jatobá da SEVLA — o que ele sabe vem dos catálogos, não de texto solto:
 * preços dos dois produtos, combos com o desconto, a conta única, o que não
 * existe. E as ferramentas da conta são só leitura e navegação.
 */
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: { from: () => ({}) } }));

import { conhecimentoDaSevla, FERRAMENTAS_DA_CONTA, DESTINOS_DA_CONTA, REGRAS_DA_HOME_DA_SEVLA, REGRAS_DA_CONTA_DA_SEVLA } from './jatoba';

describe('o conhecimento do Jatobá da SEVLA', () => {
  const texto = conhecimentoDaSevla();

  it('fala da casa e dos dois produtos, com os preços do catálogo', () => {
    expect(texto).toContain('SEVLA INFINITY');
    expect(texto).toContain('Stok Aí');
    expect(texto).toContain('Atende Aí');
    expect(texto).toContain('R$ 199,90'.replace(' ', ' '));
    expect(texto).toContain('R$ 299,90'.replace(' ', ' '));
  });

  it('sabe os combos com 5% e a regra de o desconto valer com os dois', () => {
    expect(texto).toContain('5% de desconto');
    expect(texto).toContain('Combo Profissional');
    expect(texto).toContain('R$ 949,80'.replace(' ', ' '));
    expect(texto).toContain('volta ao preço normal');
  });

  it('explica a conta única e diz o que ainda não existe', () => {
    expect(texto).toContain('SEVLA Identity');
    expect(texto).toContain('stokai.app/cloud/conta');
    expect(texto).toContain('Ainda não existe');
    expect(texto).toContain('terceiro produto');
  });

  it('as regras mandam ficar no conhecimento e não inventar', () => {
    expect(REGRAS_DA_HOME_DA_SEVLA).toContain('Nunca invente');
    expect(REGRAS_DA_CONTA_DA_SEVLA).toContain('NÃO assina');
  });

  it('na conta, as ferramentas são só ler assinaturas e abrir lugares', () => {
    expect(FERRAMENTAS_DA_CONTA.map((f) => f.name)).toEqual(['minhas_assinaturas', 'abrir']);
    expect(Object.keys(DESTINOS_DA_CONTA)).toEqual(['stok', 'atende', 'assinaturas', 'produtos']);
  });
});
