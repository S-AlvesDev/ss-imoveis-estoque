import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { textoDoAvisoDiario, emailDoResumoSemanal, type Pendencias } from './rotinas';

const vazio: Pendencias = { faltando: [], atrasados: [], vencendo: [] };
const cheio: Pendencias = {
  faltando: [
    { nome: 'Cimento CP-II', saldo: 2, minimo: 10, unidade: 'sc', semEstoque: false },
    { nome: 'Luva de raspa', saldo: 0, minimo: 5, unidade: 'par', semEstoque: true },
  ],
  atrasados: [{ tomador: 'João', material: 'Furadeira', quantidade: 1, venceuEm: '2026-09-10T12:00:00Z' }],
  vencendo: [{ material: 'Dipirona 500mg', lote: 'L123', validade: '2026-10-01', quantidade: 40, estoque: 'Farmácia' }],
};

describe('aviso do dia no WhatsApp', () => {
  it('fica calado quando não há pendência', () => {
    expect(textoDoAvisoDiario('Imobiliária', vazio)).toBeNull();
  });
  it('lista o que falta, quem atrasou e o que vence', () => {
    const t = textoDoAvisoDiario('Imobiliária', cheio)!;
    expect(t).toContain('Pendências de hoje na Imobiliária');
    expect(t).toContain('• Cimento CP-II: 2 sc (mín. 10)');
    expect(t).toContain('Luva de raspa: 0 par (mín. 5) — SEM ESTOQUE');
    expect(t).toContain('João — 1 de Furadeira (venceu 10/09/2026)');
    expect(t).toContain('Dipirona 500mg lote L123: 40 em Farmácia, vence 01/10/2026');
  });
});

describe('resumo da semana', () => {
  it('conta movimentos por tipo e os mais consumidos', () => {
    const { subject, html } = emailDoResumoSemanal('IFRN', { de: '2026-09-07T12:00:00Z', ate: '2026-09-14T12:00:00Z', movimentos: 12, porTipo: { SAIDA: 7, ENTRADA: 5 }, maisConsumidos: [{ nome: 'Capacete', quantidade: 4, unidade: 'UN' }], pendencias: cheio }, { VITE_SITE_URL: 'https://stokai.app' });
    expect(subject).toBe('Resumo da semana — IFRN');
    expect(html).toContain('<strong>12</strong> movimentação');
    expect(html).toContain('Saídas: <strong>7</strong>');
    expect(html).toContain('Capacete — 4 UN');
    expect(html).toContain('sem estoque');
    expect(html).toContain('https://stokai.app/entrar');
  });
  it('sem pendência, elogia', () => {
    const { html } = emailDoResumoSemanal('IFRN', { de: '2026-09-07T12:00:00Z', ate: '2026-09-14T12:00:00Z', movimentos: 1, porTipo: { ENTRADA: 1 }, maisConsumidos: [], pendencias: vazio });
    expect(html).toContain('Nenhum material abaixo do mínimo');
  });
});
