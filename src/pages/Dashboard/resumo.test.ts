import { describe, it, expect } from 'vitest';
import type { Deposito, Material, MaterialMovement } from '@/shared/types';
import { atividadesRecentes, catalogoComHistorico, filtrarPorUnidade, porCategoria, saldoComHistorico, serieDiaria, topMateriais, variacao } from './resumo';

const AGORA = new Date('2026-09-12T15:00:00');
const dia = (n: number, hora = '10:00:00') => new Date(new Date(`2026-09-12T${hora}`).getTime() - n * 86400000).toISOString();

function mov(p: Partial<MaterialMovement> & { tipo_operacao: string; quantidade: number; created_at: string }): MaterialMovement {
  return { id: Math.floor(Math.random() * 1e6), material_id: 1, funcionario_matricula: 'S01', justificativa: null, materials: { nome: 'Cimento' }, ...p };
}
function mat(p: Partial<Material> & { id: number }): Material {
  return {
    nome: `Material ${p.id}`, unidade_medida: 'un', qtd_volumes: 1, fator_multiplicador: 1, saldos: {}, saldo_unidade: 0, saldos_unidade: {}, na_unidade: true,
    estoque_minimo: 0, categoria: 'Geral', created_at: dia(100), ...p,
  } as Material;
}

describe('variacao', () => {
  it('percentual sobre o anterior; nula sem base', () => {
    expect(variacao(120, 100)).toBe(20);
    expect(variacao(80, 100)).toBe(-20);
    expect(variacao(5, 0)).toBeNull();
  });
});

describe('serieDiaria', () => {
  it('7 dias: um ponto por dia, hoje incluso, zeros preenchidos', () => {
    const s = serieDiaria([mov({ tipo_operacao: 'ENTRADA_CENTRAL', quantidade: 10, created_at: dia(0) }), mov({ tipo_operacao: 'CONSUMO_OBRA', quantidade: 3, created_at: dia(2) })], 7, AGORA);
    expect(s).toHaveLength(7);
    expect(s[6].entradas).toBe(10);
    expect(s[4].saidas).toBe(3);
    expect(s[0]).toMatchObject({ entradas: 0, saidas: 0 });
  });

  it('remessa e devolução são internas: não entram nem como entrada nem como saída', () => {
    const s = serieDiaria([mov({ tipo_operacao: 'REMESSA_OBRA', quantidade: 50, created_at: dia(0) }), mov({ tipo_operacao: 'DEVOLUCAO_CENTRAL', quantidade: 5, created_at: dia(0) })], 7, AGORA);
    expect(s[6]).toMatchObject({ entradas: 0, saidas: 0 });
  });

  it('90 dias vira 13 semanas, a última terminando hoje', () => {
    const s = serieDiaria([mov({ tipo_operacao: 'SAIDA', quantidade: 7, created_at: dia(0) }), mov({ tipo_operacao: 'SAIDA', quantidade: 1, created_at: dia(89) })], 90, AGORA);
    expect(s).toHaveLength(13);
    expect(s[12].saidas).toBe(7);
    expect(s[0].saidas).toBe(1);
  });

  it('ignora o que é mais antigo que o período', () => {
    const s = serieDiaria([mov({ tipo_operacao: 'ENTRADA_CENTRAL', quantidade: 99, created_at: dia(8) })], 7, AGORA);
    expect(s.every((p) => p.entradas === 0)).toBe(true);
  });
});

const LEGADO = { central: 'c1', obra: 'o1' };

describe('saldoComHistorico', () => {
  it('com depósito gravado, o id decide: transferência sai de um e entra no outro; ajuste leva o sinal', () => {
    const movs = [
      { ...mov({ tipo_operacao: 'TRANSFERENCIA', quantidade: 20, created_at: dia(0) }), warehouse_origem_id: 'a', warehouse_destino_id: 'b' } as MaterialMovement,
      { ...mov({ tipo_operacao: 'AJUSTE', quantidade: -5, created_at: dia(0) }), warehouse_destino_id: 'b' } as MaterialMovement,
      { ...mov({ tipo_operacao: 'EMPRESTIMO', quantidade: 3, created_at: dia(0) }), warehouse_origem_id: 'b' } as MaterialMovement,
    ];
    expect(saldoComHistorico(50, movs, 'a', AGORA).serie[12]).toBe(70);
    expect(saldoComHistorico(50, movs, 'b', AGORA).serie[12]).toBe(38); // 50 - 20 + 5 + 3
  });

  it('anda para trás a partir do saldo atual', () => {
    // Hoje: 100 no Central. Ontem entraram 30 e anteontem saíram 10.
    const r = saldoComHistorico(100, [mov({ tipo_operacao: 'ENTRADA_CENTRAL', quantidade: 30, created_at: dia(1) }), mov({ tipo_operacao: 'SAIDA', quantidade: 10, created_at: dia(2) })], 'c1', AGORA, LEGADO);
    expect(r.serie).toHaveLength(14);
    expect(r.serie[13]).toBe(100); // hoje
    expect(r.serie[12]).toBe(100); // ontem ao fim do dia (a entrada de ontem já contava)
    expect(r.serie[11]).toBe(70); // anteontem: antes da entrada de ontem
    expect(r.serie[10]).toBe(80); // antes da saída de anteontem
    // 30 dias atrás o saldo era 100 - (30 - 10) = 80 → +25%
    expect(r.tendencia).toBe(25);
  });

  it('remessa tira do Central e põe na Obra; ajuste leva o sinal', () => {
    const movs = [mov({ tipo_operacao: 'REMESSA_OBRA', quantidade: 20, created_at: dia(0) }), mov({ tipo_operacao: 'AJUSTE_OBRA', quantidade: -5, created_at: dia(0) })];
    expect(saldoComHistorico(50, movs, 'c1', AGORA, LEGADO).serie[12]).toBe(70);
    expect(saldoComHistorico(50, movs, 'o1', AGORA, LEGADO).serie[12]).toBe(35);
  });

  it('sem movimentação: linha reta e tendência nula', () => {
    const r = saldoComHistorico(42, [], 'o1', AGORA);
    expect(new Set(r.serie).size).toBe(1);
    expect(r.tendencia).toBeNull();
    expect(r.mudancaEm30Dias).toBe(0);
  });

  it('BUG-02: depósito novo (base 30 dias atrás é zero) com movimentação real — tendência nula, mas mudancaEm30Dias não', () => {
    const r = saldoComHistorico(8, [mov({ tipo_operacao: 'ENTRADA_CENTRAL', quantidade: 8, created_at: dia(1) })], 'c1', AGORA, LEGADO);
    expect(r.tendencia).toBeNull(); // 30 dias atrás era 0: não dá para calcular %
    expect(r.mudancaEm30Dias).toBe(8); // mas a mudança de verdade não é nula
  });
});

describe('catalogoComHistorico', () => {
  it('conta o que entrou no catálogo nos últimos 30 dias', () => {
    const r = catalogoComHistorico([mat({ id: 1 }), mat({ id: 2, created_at: dia(3) }), mat({ id: 3, created_at: dia(0) })], AGORA);
    expect(r.total).toBe(3);
    expect(r.tendencia).toBe(200); // de 1 para 3
    expect(r.serie[13]).toBe(3);
    expect(r.serie[9]).toBe(1);
  });

  it('BUG-02: catálogo novo (tudo criado nos últimos 30 dias) — tendência nula, mas criadosEm30 diz o que houve', () => {
    const r = catalogoComHistorico([mat({ id: 1, created_at: dia(2) }), mat({ id: 2, created_at: dia(1) })], AGORA);
    expect(r.tendencia).toBeNull(); // 2 - 2 = 0 de base: não dá para calcular %
    expect(r.criadosEm30).toBe(2);
  });
});

describe('topMateriais', () => {
  it('ordena por quantidade e compara 30 dias com os 30 anteriores', () => {
    const materials = [mat({ id: 1, nome: 'Cimento' }), mat({ id: 2, nome: 'Areia' })];
    const movs = [
      mov({ material_id: 1, tipo_operacao: 'SAIDA', quantidade: 10, created_at: dia(1) }),
      mov({ material_id: 1, tipo_operacao: 'SAIDA', quantidade: 5, created_at: dia(40) }),
      mov({ material_id: 2, tipo_operacao: 'SAIDA', quantidade: 100, created_at: dia(1) }),
      mov({ material_id: 99, tipo_operacao: 'SAIDA', quantidade: 999, created_at: dia(1) }), // material que não existe mais
    ];
    const top = topMateriais(materials, movs, 5, AGORA);
    expect(top.map((t) => t.material.nome)).toEqual(['Areia', 'Cimento']);
    expect(top[1].tendencia).toBe(100); // 10 contra 5
    expect(top[0].tendencia).toBeNull(); // sem base nos 30 anteriores
  });
});

describe('porCategoria', () => {
  it('percentuais e "Outros" para categoria desconhecida', () => {
    const f = porCategoria([mat({ id: 1, categoria: 'Geral' }), mat({ id: 2, categoria: 'Geral' }), mat({ id: 3, categoria: 'Inventada' }), mat({ id: 4, categoria: 'Equipamentos' })], ['Geral', 'Equipamentos']);
    expect(f[0]).toEqual({ nome: 'Geral', valor: 2, pct: 50 });
    expect(f.find((x) => x.nome === 'Outros')?.valor).toBe(1);
  });
});

describe('filtrarPorUnidade', () => {
  const depositos: Deposito[] = [{ id: 'c1', nome: 'Central', tipo: 'CENTRAL', unit_id: 'u1', ativo: true, modo: 'almoxarifado', prazo_padrao_horas: null, operacoes_permitidas: null, exige_assinatura: false, dias_aviso_validade: 30 }];
  const comDeposito = { ...mov({ tipo_operacao: 'SAIDA', quantidade: 1, created_at: dia(0) }), warehouse_origem_id: 'c1' } as MaterialMovement;
  const deOutra = { ...mov({ tipo_operacao: 'SAIDA', quantidade: 1, created_at: dia(0) }), warehouse_origem_id: 'c9' } as MaterialMovement;
  const antiga = mov({ tipo_operacao: 'SAIDA', quantidade: 1, created_at: dia(0) });

  it('fica com o que tocou um depósito da unidade', () => {
    expect(filtrarPorUnidade([comDeposito, deOutra], depositos, false)).toEqual([comDeposito]);
  });
  it('movimentação antiga sem depósito conta só com uma unidade', () => {
    expect(filtrarPorUnidade([antiga], depositos, true)).toEqual([antiga]);
    expect(filtrarPorUnidade([antiga], depositos, false)).toEqual([]);
  });
});

describe('atividadesRecentes', () => {
  it('as mais novas primeiro, com o nome do material resolvido', () => {
    const a = atividadesRecentes(
      [mov({ id: 1, materials: null, material_id: 7, tipo_operacao: 'SAIDA', quantidade: 2, created_at: dia(5) }), mov({ id: 2, tipo_operacao: 'ENTRADA_CENTRAL', quantidade: 9, created_at: dia(0) })],
      [mat({ id: 7, nome: 'Tijolo' })],
    );
    expect(a.map((x) => x.id)).toEqual([2, 1]);
    expect(a[1].material).toBe('Tijolo');
    expect(a[0].material).toBe('Cimento');
  });
});
