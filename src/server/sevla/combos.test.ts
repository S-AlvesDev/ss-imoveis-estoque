import { describe, it, expect, vi } from 'vitest';

/**
 * Combos da SEVLA — a parte pura: o desconto em centavos exatos, os preços
 * por combo e ciclo, e a decisão de quem volta ao preço cheio quando o
 * outro produto sai.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: { from: () => ({}) } }));

import { comDescontoDoCombo, COMBO_DESCONTO } from '../../shared/sevla';
import { COMBOS, comboDe, precosDoCombo, catalogoDeCombos, motivoDoCombo, descricaoDoCombo, decisaoDoCombo, ESPERA_DO_CHECKOUT_MS, REF_COMBO, type LinhaDoCombo } from './combos';

describe('o desconto do combo', () => {
  it('é de 5%, em centavos exatos e nunca um centavo a mais', () => {
    expect(COMBO_DESCONTO).toBe(5);
    expect(comDescontoDoCombo(199.9)).toBe(189.9); // 189,905 → para baixo
    expect(comDescontoDoCombo(299.9)).toBe(284.9);
    expect(comDescontoDoCombo(1200)).toBe(1140);
    expect(comDescontoDoCombo(1999)).toBe(1899.05);
    expect(comDescontoDoCombo(0.01)).toBe(0);
  });
});

describe('os preços dos combos', () => {
  it('são os três planos, no mesmo nível nos dois produtos', () => {
    expect(COMBOS.map((c) => c.id)).toEqual(['essencial', 'profissional', 'empresarial']);
    for (const c of COMBOS) expect(c.stok).toBe(c.atende);
    expect(comboDe('profissional')?.nome).toBe('Combo Profissional');
    expect(comboDe('misto')).toBeNull();
    expect(comboDe(undefined)).toBeNull();
  });

  it('descontam 5% de cada produto e somam (mensal)', () => {
    const p = precosDoCombo(comboDe('profissional')!, 'mensal')!;
    expect(p).toEqual({ stok: 379.9, atende: 569.9, total: 949.8, cheio: 999.8, economia: 50 });
    const e = precosDoCombo(comboDe('essencial')!, 'mensal')!;
    expect(e).toEqual({ stok: 189.9, atende: 284.9, total: 474.8, cheio: 499.8, economia: 25 });
    const g = precosDoCombo(comboDe('empresarial')!, 'mensal')!;
    expect(g).toEqual({ stok: 1140, atende: 1139.9, total: 2279.9, cheio: 2399.9, economia: 120 });
  });

  it('no anual, o desconto vai por cima dos dois meses grátis de cada produto', () => {
    const p = precosDoCombo(comboDe('profissional')!, 'anual')!;
    expect(p.cheio).toBe(9998); // 3.999 + 5.999
    expect(p.stok).toBe(3799.05); // 3.999 × 0,95
    expect(p.atende).toBe(5699.05); // 5.999 × 0,95
    expect(p.total).toBe(9498.1);
    expect(p.economia).toBe(499.9);
  });

  it('o catálogo leva o desconto e os dois ciclos para a tela', () => {
    const cat = catalogoDeCombos();
    expect(cat).toHaveLength(3);
    expect(cat[1]).toMatchObject({ id: 'profissional', desconto: 5, stok: 'profissional', atende: 'profissional' });
    expect(cat[1].precos.mensal?.total).toBe(949.8);
    expect(cat[1].precos.anual?.total).toBe(9498.1);
  });

  it('o motivo na fatura diz o produto, o plano e que é combo; o Pix único diz os dois', () => {
    const c = comboDe('profissional')!;
    expect(motivoDoCombo('stok', c, 'mensal')).toBe('Stok Aí — Profissional (mensal) · combo SEVLA');
    expect(motivoDoCombo('atende', c, 'anual')).toBe('Atende Aí — Profissional (anual) · combo SEVLA');
    expect(descricaoDoCombo(c, 'mensal')).toBe('SEVLA — Combo Profissional: Stok Aí + Atende Aí (mensal)');
    expect(REF_COMBO).toBe('sevla-combo:');
  });
});

describe('acertar o combo: quem fica sozinho volta ao preço cheio', () => {
  const agora = new Date('2026-09-20T12:00:00Z');
  const linha = (o: Partial<LinhaDoCombo> = {}): LinhaDoCombo => ({ id: 'x', status: 'autorizada', combo: 'profissional', created_at: '2026-09-01T00:00:00Z', mp_preapproval_id: 'pre', plano: 'profissional', ciclo: 'mensal', ...o });

  it('os dois em vigor com combo: nada a fazer', () => {
    expect(decisaoDoCombo([linha({ id: 's' })], [linha({ id: 'a' })], agora)).toEqual({ stok: null, atende: null });
  });

  it('sem combo em nenhum dos dois: nada a fazer', () => {
    expect(decisaoDoCombo([linha({ combo: null })], [linha({ combo: null })], agora)).toEqual({ stok: null, atende: null });
    expect(decisaoDoCombo([], [], agora)).toEqual({ stok: null, atende: null });
  });

  it('o Atende foi cancelado: o Stok perde o desconto', () => {
    const d = decisaoDoCombo([linha({ id: 's' })], [linha({ id: 'a', status: 'cancelada' })], agora);
    expect(d.stok?.id).toBe('s');
    expect(d.atende).toBeNull();
  });

  it('o Stok nunca existiu ou trocou de plano por fora (assinatura nova sem combo): o Atende perde o desconto', () => {
    expect(decisaoDoCombo([], [linha({ id: 'a' })], agora).atende?.id).toBe('a');
    const d = decisaoDoCombo([linha({ id: 's2', combo: null }), linha({ id: 's1', status: 'cancelada' })], [linha({ id: 'a' })], agora);
    expect(d.atende?.id).toBe('a');
    expect(d.stok).toBeNull();
  });

  it('o checkout do outro ainda está pendente há pouco: espera', () => {
    const recente = new Date(agora.getTime() - 3600_000).toISOString();
    const d = decisaoDoCombo([linha({ id: 's' })], [linha({ id: 'a', status: 'pendente', created_at: recente })], agora);
    expect(d).toEqual({ stok: null, atende: null });
  });

  it('o checkout do outro ficou pendente por mais de 48 h: desiste e tira o desconto', () => {
    const velho = new Date(agora.getTime() - ESPERA_DO_CHECKOUT_MS - 1000).toISOString();
    const d = decisaoDoCombo([linha({ id: 's' })], [linha({ id: 'a', status: 'pendente', created_at: velho })], agora);
    expect(d.stok?.id).toBe('s');
  });

  it('uma intenção pendente sem combo (ou sem id do MP) não segura o desconto', () => {
    const recente = new Date(agora.getTime() - 3600_000).toISOString();
    expect(decisaoDoCombo([linha({ id: 's' })], [linha({ status: 'pendente', combo: null, created_at: recente })], agora).stok?.id).toBe('s');
    expect(decisaoDoCombo([linha({ id: 's' })], [linha({ status: 'pendente', mp_preapproval_id: null, created_at: recente })], agora).stok?.id).toBe('s');
  });

  it('pausada conta como em vigor (o MP vai tentar de novo)', () => {
    expect(decisaoDoCombo([linha({ status: 'pausada' })], [linha()], agora)).toEqual({ stok: null, atende: null });
  });

  it('a assinatura em vigor manda, mesmo com uma intenção mais nova pendente por cima', () => {
    const d = decisaoDoCombo([linha({ id: 'nova', status: 'pendente', combo: null, mp_preapproval_id: null }), linha({ id: 's' })], [linha({ id: 'a' })], agora);
    expect(d).toEqual({ stok: null, atende: null });
  });
});
