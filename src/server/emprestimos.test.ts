import { describe, it, expect } from 'vitest';
import { validarRetirada, prazoEm, estaAtrasado, estaPendente, formatarHoras, MAX_PRAZO_HORAS } from './emprestimos';
import { validarEstoque, OPERACOES, ehOperacaoGenerica } from './estoque';

const valida = { material_id: 7, quantidade: 3, tomador_nome: '  Ana Souza ', tomador_referencia: '20240012', prazo_horas: 2 };

describe('validarRetirada', () => {
  it('limpa e devolve a retirada', () => {
    const r = validarRetirada(valida, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.retirada).toEqual({ material_id: 7, quantidade: 3, tomador_nome: 'Ana Souza', tomador_referencia: '20240012', observacao: null, prazo_horas: 2 });
  });

  it('sem prazo informado usa o padrão do estoque; sem padrão, 2 horas', () => {
    const semPrazo = { ...valida, prazo_horas: undefined };
    expect(validarRetirada(semPrazo, 6).ok && (validarRetirada(semPrazo, 6) as any).retirada.prazo_horas).toBe(6);
    expect((validarRetirada(semPrazo, null) as any).retirada.prazo_horas).toBe(2);
    expect((validarRetirada({ ...valida, prazo_horas: '' }, 6) as any).retirada.prazo_horas).toBe(6);
  });

  it('aceita fração de hora e arredonda a quantidade a 2 casas', () => {
    const r = validarRetirada({ ...valida, prazo_horas: 1.5, quantidade: 2.456 }, null);
    expect(r.ok && r.retirada.prazo_horas).toBe(1.5);
    expect(r.ok && r.retirada.quantidade).toBe(2.46);
  });

  it.each([
    ['sem material', { ...valida, material_id: 0 }, 'material'],
    ['quantidade zero', { ...valida, quantidade: 0 }, 'quantidade'],
    ['nome curto', { ...valida, tomador_nome: 'A' }, 'retirando'],
    ['referência longa', { ...valida, tomador_referencia: 'x'.repeat(41) }, 'Referência'],
    ['prazo zero', { ...valida, prazo_horas: 0 }, 'prazo'],
    ['prazo além de um ano', { ...valida, prazo_horas: MAX_PRAZO_HORAS + 1 }, 'prazo'],
    ['corpo nulo', null, 'material'],
  ])('reprova %s', (_, body, trecho) => {
    const r = validarRetirada(body, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.toLowerCase()).toContain(trecho.toLowerCase());
  });
});

describe('prazo e atraso', () => {
  const agora = new Date('2026-09-12T10:00:00Z');

  it('prazoEm soma as horas', () => {
    expect(prazoEm(2, agora).toISOString()).toBe('2026-09-12T12:00:00.000Z');
    expect(prazoEm(0.5, agora).toISOString()).toBe('2026-09-12T10:30:00.000Z');
  });

  it('pendente é o que não voltou; atrasado é pendente e vencido', () => {
    const vence = prazoEm(2, agora).toISOString();
    expect(estaPendente({ prazo_em: vence, devolvido_em: null })).toBe(true);
    expect(estaAtrasado({ prazo_em: vence, devolvido_em: null }, agora)).toBe(false);
    expect(estaAtrasado({ prazo_em: vence, devolvido_em: null }, new Date('2026-09-12T12:00:01Z'))).toBe(true);
    expect(estaAtrasado({ prazo_em: vence, devolvido_em: '2026-09-12T13:00:00Z' }, new Date('2026-09-13T00:00:00Z'))).toBe(false);
  });

  it('formatarHoras fala como gente', () => {
    expect(formatarHoras(2)).toBe('2 h');
    expect(formatarHoras(1.5)).toBe('1 h 30 min');
    expect(formatarHoras(0.75)).toBe('45 min');
    expect(formatarHoras(72)).toBe('3 dias');
  });
});

describe('validarEstoque', () => {
  it('almoxarifado não tem prazo; empréstimo tem, com padrão 2', () => {
    expect(validarEstoque({ nome: ' Almoxarifado ', modo: 'almoxarifado', prazo_padrao_horas: 9 })).toEqual({ ok: true, nome: 'Almoxarifado', modo: 'almoxarifado', prazo_padrao_horas: null });
    expect(validarEstoque({ nome: 'Esportes', modo: 'emprestimo' })).toEqual({ ok: true, nome: 'Esportes', modo: 'emprestimo', prazo_padrao_horas: 2 });
    expect(validarEstoque({ nome: 'Esportes', modo: 'emprestimo', prazo_padrao_horas: 48 })).toMatchObject({ ok: true, prazo_padrao_horas: 48 });
  });

  it('sem modo, é almoxarifado', () => {
    expect(validarEstoque({ nome: 'Depósito' })).toMatchObject({ ok: true, modo: 'almoxarifado' });
  });

  it.each([
    ['nome curto', { nome: 'A', modo: 'almoxarifado' }],
    ['modo inventado', { nome: 'Depósito', modo: 'bagunca' }],
    ['prazo fracionado no padrão', { nome: 'Esportes', modo: 'emprestimo', prazo_padrao_horas: 1.5 }],
    ['prazo zero', { nome: 'Esportes', modo: 'emprestimo', prazo_padrao_horas: 0 }],
  ])('reprova %s', (_, body) => {
    expect(validarEstoque(body).ok).toBe(false);
  });
});

describe('operações genéricas', () => {
  it('cada operação diz o lado do estoque escolhido', () => {
    expect(OPERACOES.ENTRADA.lado).toBe('destino');
    expect(OPERACOES.SAIDA.lado).toBe('origem');
    expect(OPERACOES.CONSUMO.lado).toBe('origem');
    expect(OPERACOES.AJUSTE).toMatchObject({ lado: 'destino', ajuste: true });
    expect(OPERACOES.TRANSFERENCIA).toMatchObject({ lado: 'origem', precisaDestino: true });
  });

  it('só aceita as cinco', () => {
    expect(ehOperacaoGenerica('ENTRADA')).toBe(true);
    expect(ehOperacaoGenerica('REMESSA_OBRA')).toBe(false);
    expect(ehOperacaoGenerica(42)).toBe(false);
  });
});
