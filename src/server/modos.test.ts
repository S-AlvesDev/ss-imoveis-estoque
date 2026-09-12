import { describe, it, expect } from 'vitest';
import { validarEntrega, assinaturaValida, validoAte, estaAberta, trocaVencida, trocaVencendo } from './entregas';
import { ordenarFefo, alocarSaida, descreverConsumos, validarLote, situacaoDoLote, diasParaVencer } from './lotes';
import { validarItem, transicionar, validarEvento } from './patrimonio';
import { validarEstoque, operacaoPermitida } from './estoque';

const PNG = `data:image/png;base64,${'iVBORw0KGgo='.repeat(3)}`;

// --------------------------- Entrega / EPI ---------------------------
describe('validarEntrega', () => {
  const valida = { material_id: 3, quantidade: 1, tomador_nome: ' Marlon Lima ', tomador_referencia: 'OBRA-2', observacao: '', assinatura: PNG };

  it('limpa e devolve a entrega, com a assinatura', () => {
    const r = validarEntrega(valida, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entrega).toEqual({ material_id: 3, quantidade: 1, tomador_nome: 'Marlon Lima', tomador_referencia: 'OBRA-2', observacao: null, assinatura: PNG });
  });

  it('quando o estoque exige assinatura, sem ela recusa; quando não exige, passa sem', () => {
    const sem = { ...valida, assinatura: null };
    expect(validarEntrega(sem, true)).toEqual({ ok: false, erro: expect.stringContaining('assinatura') });
    expect(validarEntrega(sem, false).ok).toBe(true);
  });

  it.each([
    ['sem material', { ...valida, material_id: 'x' }, 'material'],
    ['quantidade zero', { ...valida, quantidade: 0 }, 'quantidade'],
    ['sem nome', { ...valida, tomador_nome: 'A' }, 'recebendo'],
    ['referência longa', { ...valida, tomador_referencia: 'x'.repeat(41) }, 'Referência'],
    ['assinatura em outro formato', { ...valida, assinatura: 'data:image/jpeg;base64,AAAA' }, 'Assinatura'],
  ])('recusa %s', (_, body, trecho) => {
    const r = validarEntrega(body, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain(trecho);
  });
});

describe('assinaturaValida', () => {
  it('só PNG em data URL, e pequeno', () => {
    expect(assinaturaValida(PNG)).toBe(true);
    expect(assinaturaValida('data:image/png;base64,')).toBe(false);
    expect(assinaturaValida(`data:image/png;base64,${'A'.repeat(120_001)}`)).toBe(false);
    expect(assinaturaValida(42)).toBe(false);
  });
});

describe('validoAte e situação da troca', () => {
  const agora = new Date('2026-09-12T10:00:00Z');

  it('soma a validade de troca em dias; sem validade, sem prazo', () => {
    expect(validoAte(180, agora)?.toISOString()).toBe('2027-03-11T10:00:00.000Z');
    expect(validoAte(null, agora)).toBeNull();
    expect(validoAte(0, agora)).toBeNull();
  });

  it('aberta = nem devolvida nem encerrada', () => {
    expect(estaAberta({ prazo_em: null, devolvido_em: null, encerrado_em: null })).toBe(true);
    expect(estaAberta({ prazo_em: null, devolvido_em: '2026-01-01', encerrado_em: null })).toBe(false);
    expect(estaAberta({ prazo_em: null, devolvido_em: null, encerrado_em: '2026-01-01' })).toBe(false);
  });

  it('vencida: aberta com prazo no passado; vencendo: dentro da janela', () => {
    const ontem = { prazo_em: '2026-09-11T10:00:00Z', devolvido_em: null, encerrado_em: null };
    const em10 = { prazo_em: '2026-09-22T10:00:00Z', devolvido_em: null, encerrado_em: null };
    const em60 = { prazo_em: '2026-11-11T10:00:00Z', devolvido_em: null, encerrado_em: null };
    expect(trocaVencida(ontem, agora)).toBe(true);
    expect(trocaVencida(em10, agora)).toBe(false);
    expect(trocaVencendo(em10, 30, agora)).toBe(true);
    expect(trocaVencendo(em60, 30, agora)).toBe(false);
    expect(trocaVencendo(ontem, 30, agora)).toBe(false);
    expect(trocaVencida({ ...ontem, encerrado_em: '2026-09-11' }, agora)).toBe(false);
  });
});

// --------------------------- Validade e lotes ---------------------------
const lotes = [
  { id: 'b', lote: 'B', validade: '2026-12-01', quantidade: 10 },
  { id: 'a', lote: 'A', validade: '2026-10-01', quantidade: 4 },
  { id: 'n', lote: 'N', validade: null, quantidade: 100 },
  { id: 'c', lote: 'C', validade: '2026-10-01', quantidade: 2 },
];

describe('ordenarFefo', () => {
  it('vence primeiro, sai primeiro; sem validade por último; empate pelo nome', () => {
    expect(ordenarFefo(lotes).map((l) => l.id)).toEqual(['a', 'c', 'b', 'n']);
  });
});

describe('alocarSaida', () => {
  it('atravessa lotes pelo FEFO até completar a quantidade', () => {
    const r = alocarSaida(lotes, 7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.consumos).toEqual([
      { id: 'a', lote: 'A', quantidade: 4 },
      { id: 'c', lote: 'C', quantidade: 2 },
      { id: 'b', lote: 'B', quantidade: 1 },
    ]);
    expect(descreverConsumos(r.consumos)).toBe('A (4), C (2), B (1)');
  });

  it('com lote apontado sai só dele — e diz quanto ele tem quando falta', () => {
    expect(alocarSaida(lotes, 3, 'b')).toEqual({ ok: true, consumos: [{ id: 'b', lote: 'B', quantidade: 3 }] });
    expect(alocarSaida(lotes, 5, 'a')).toEqual({ ok: false, erro: 'O lote A tem só 4.' });
    expect(alocarSaida(lotes, 1, 'zzz')).toEqual({ ok: false, erro: expect.stringContaining('não encontrado') });
  });

  it('recusa quantidade inválida e saldo insuficiente somando tudo', () => {
    expect(alocarSaida(lotes, 0).ok).toBe(false);
    expect(alocarSaida(lotes, 117).ok).toBe(false);
    expect(alocarSaida(lotes, 116).ok).toBe(true);
  });

  it('ignora lotes zerados e trabalha com centavos', () => {
    const r = alocarSaida([{ id: 'z', lote: 'Z', validade: '2020-01-01', quantidade: 0 }, { id: 'a', lote: 'A', validade: '2026-01-01', quantidade: 0.3 }, { id: 'b', lote: 'B', validade: '2026-02-01', quantidade: 0.3 }], 0.5);
    expect(r).toEqual({ ok: true, consumos: [{ id: 'a', lote: 'A', quantidade: 0.3 }, { id: 'b', lote: 'B', quantidade: 0.2 }] });
  });
});

describe('validarLote', () => {
  it('lote obrigatório, validade opcional mas com formato', () => {
    expect(validarLote({ lote: ' L1 ', validade: '2026-10-01' })).toEqual({ ok: true, lote: { lote: 'L1', validade: '2026-10-01' } });
    expect(validarLote({ lote: 'L1', validade: '' })).toEqual({ ok: true, lote: { lote: 'L1', validade: null } });
    expect(validarLote({ lote: '' }).ok).toBe(false);
    expect(validarLote({ lote: 'L1', validade: '01/10/2026' }).ok).toBe(false);
    expect(validarLote({ lote: 'L1', validade: '2026-13-45' }).ok).toBe(false);
  });
});

describe('situacaoDoLote e diasParaVencer', () => {
  const hoje = new Date('2026-09-12T15:00:00');
  it('classifica pelo dia, não pela hora', () => {
    expect(situacaoDoLote('2026-09-11', 30, hoje)).toBe('vencido');
    expect(situacaoDoLote('2026-09-12', 30, hoje)).toBe('vencendo');
    expect(situacaoDoLote('2026-10-12', 30, hoje)).toBe('vencendo');
    expect(situacaoDoLote('2026-10-13', 30, hoje)).toBe('ok');
    expect(situacaoDoLote(null, 30, hoje)).toBe('sem-validade');
  });
  it('conta dias com sinal', () => {
    expect(diasParaVencer('2026-09-15', hoje)).toBe(3);
    expect(diasParaVencer('2026-09-10', hoje)).toBe(-2);
  });
});

// --------------------------- Patrimônio ---------------------------
describe('validarItem', () => {
  const valido = { material_id: 9, codigo: ' PAT-0042 ', serie: 'ABC', local: 'Sala 3', observacao: '', adquirido_em: '2025-02-10', valor: '3499.999' };
  it('limpa e arredonda o valor', () => {
    const r = validarItem(valido);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item).toEqual({ material_id: 9, codigo: 'PAT-0042', serie: 'ABC', local: 'Sala 3', observacao: null, adquirido_em: '2025-02-10', valor: 3500 });
  });
  it.each([
    ['sem modelo', { ...valido, material_id: null }, 'modelo'],
    ['sem número', { ...valido, codigo: '' }, 'número'],
    ['data inválida', { ...valido, adquirido_em: '10/02/2025' }, 'aquisição'],
    ['valor negativo', { ...valido, valor: -1 }, 'Valor'],
  ])('recusa %s', (_, body, trecho) => {
    const r = validarItem(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain(trecho);
  });
});

describe('transicionar', () => {
  it('segue a vida do item', () => {
    expect(transicionar('disponivel', 'alocacao')).toEqual({ ok: true, para: 'em_uso' });
    expect(transicionar('em_uso', 'devolucao')).toEqual({ ok: true, para: 'disponivel' });
    expect(transicionar('em_uso', 'manutencao')).toEqual({ ok: true, para: 'manutencao' });
    expect(transicionar('manutencao', 'retorno')).toEqual({ ok: true, para: 'disponivel' });
    expect(transicionar('manutencao', 'baixa')).toEqual({ ok: true, para: 'baixado' });
  });
  it('recusa o que não cabe — e baixado é o fim', () => {
    expect(transicionar('disponivel', 'devolucao').ok).toBe(false);
    expect(transicionar('em_uso', 'alocacao').ok).toBe(false);
    expect(transicionar('manutencao', 'alocacao').ok).toBe(false);
    expect(transicionar('baixado', 'retorno')).toEqual({ ok: false, erro: expect.stringContaining('baixado') });
  });
});

describe('validarEvento', () => {
  it('alocação exige para quem; os outros aceitam só detalhe', () => {
    expect(validarEvento({ tipo: 'alocacao', para_nome: 'Ana', para_referencia: 'TI', detalhe: '' })).toEqual({ ok: true, evento: { tipo: 'alocacao', para_nome: 'Ana', para_referencia: 'TI', detalhe: null } });
    expect(validarEvento({ tipo: 'alocacao' }).ok).toBe(false);
    expect(validarEvento({ tipo: 'baixa', para_nome: 'Ana', detalhe: 'quebrou' })).toEqual({ ok: true, evento: { tipo: 'baixa', para_nome: null, para_referencia: null, detalhe: 'quebrou' } });
    expect(validarEvento({ tipo: 'cadastro' }).ok).toBe(false);
  });
});

// --------------------------- Operações por estoque ---------------------------
describe('operações permitidas', () => {
  it('almoxarifado pode desligar operações; lista completa vira null', () => {
    const tudo = validarEstoque({ nome: 'Central', modo: 'almoxarifado', operacoes_permitidas: ['ENTRADA', 'SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'AJUSTE'] });
    expect(tudo.ok && tudo.operacoes_permitidas).toBeNull();
    const so = validarEstoque({ nome: 'Cozinha', modo: 'almoxarifado', operacoes_permitidas: ['ENTRADA', 'CONSUMO'] });
    expect(so.ok && so.operacoes_permitidas).toEqual(['ENTRADA', 'CONSUMO']);
    expect(validarEstoque({ nome: 'X', modo: 'almoxarifado', operacoes_permitidas: ['VENDA'] }).ok).toBe(false);
    expect(validarEstoque({ nome: 'X', modo: 'almoxarifado', operacoes_permitidas: [] }).ok).toBe(false);
  });

  it('operacaoPermitida: null libera tudo; lista restringe', () => {
    expect(operacaoPermitida({ operacoes_permitidas: null }, 'AJUSTE')).toBe(true);
    expect(operacaoPermitida({ operacoes_permitidas: ['ENTRADA', 'CONSUMO'] }, 'CONSUMO')).toBe(true);
    expect(operacaoPermitida({ operacoes_permitidas: ['ENTRADA', 'CONSUMO'] }, 'SAIDA')).toBe(false);
  });

  it('entrega guarda exige_assinatura; validade guarda dias de aviso entre 1 e 365', () => {
    const e = validarEstoque({ nome: 'EPI', modo: 'entrega', exige_assinatura: true });
    expect(e.ok && e.exige_assinatura).toBe(true);
    const v = validarEstoque({ nome: 'Farmácia', modo: 'validade', dias_aviso_validade: 45 });
    expect(v.ok && v.dias_aviso_validade).toBe(45);
    expect(validarEstoque({ nome: 'Farmácia', modo: 'validade', dias_aviso_validade: 0 }).ok).toBe(false);
    expect(validarEstoque({ nome: 'Farmácia', modo: 'validade', dias_aviso_validade: 400 }).ok).toBe(false);
  });
});
