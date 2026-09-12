import { describe, it, expect } from 'vitest';
import { podeVer, podeOperar, podeExecutar, ehAdmin, type Acessos } from './acessos';
import { FLUXO_DA_OPERACAO, depositosDoFluxo, type Deposito } from './estoque';
import { CENTRAL_ROLES, OBRA_ROLES, ALL_INVENTORY_ROLES, ADMIN_ROLES } from '../shared/constants';

const CENTRAL = 'c1', OBRA = 'o1';
const depositos: Deposito[] = [
  { id: CENTRAL, nome: 'Central', tipo: 'CENTRAL', unit_id: 'u1', ativo: true, modo: 'almoxarifado', prazo_padrao_horas: null, operacoes_permitidas: null, exige_assinatura: false, dias_aviso_validade: 30 },
  { id: OBRA, nome: 'Obra', tipo: 'OBRA', unit_id: 'u1', ativo: true, modo: 'almoxarifado', prazo_padrao_horas: null, operacoes_permitidas: null, exige_assinatura: false, dias_aviso_validade: 30 },
];

const admin: Acessos = null;
const soCentral: Acessos = new Map([[CENTRAL, 'OPERA']]);
const soObra: Acessos = new Map([[OBRA, 'OPERA']]);
const consultaCentral: Acessos = new Map([[CENTRAL, 'CONSULTA']]);
const ninguem: Acessos = new Map();

describe('ver e operar', () => {
  it('admin vê e opera tudo, sem atribuição nenhuma', () => {
    expect(podeVer(admin, CENTRAL)).toBe(true);
    expect(podeOperar(admin, 'qualquer-coisa')).toBe(true);
    expect(ehAdmin('ADMINISTRADOR')).toBe(true);
    expect(ehAdmin('ALMOXARIFE_OBRA')).toBe(false);
  });

  it('consulta vê mas não opera', () => {
    expect(podeVer(consultaCentral, CENTRAL)).toBe(true);
    expect(podeOperar(consultaCentral, CENTRAL)).toBe(false);
  });

  it('sem atribuição não vê nem opera — falha fecha', () => {
    expect(podeVer(ninguem, CENTRAL)).toBe(false);
    expect(podeOperar(ninguem, CENTRAL)).toBe(false);
  });

  it('atribuição num depósito não vale para outro', () => {
    expect(podeVer(soCentral, OBRA)).toBe(false);
    expect(podeOperar(soObra, CENTRAL)).toBe(false);
  });
});

/**
 * EQUIVALÊNCIA COM OS CARGOS
 *
 * A migração 012 converte ALMOXARIFE_GERAL em OPERA no Central e
 * ALMOXARIFE_OBRA em OPERA na Obra. O que cada um podia fazer por cargo tem
 * que continuar podendo por atribuição — e o que não podia, continuar não
 * podendo. Senão a virada muda quem faz o quê sem ninguém ter pedido.
 */
describe('equivalência: atribuição reproduz o que o cargo permitia', () => {
  const porCargo: Record<string, string[]> = {
    ENTRADA_CENTRAL: CENTRAL_ROLES,
    SAIDA: CENTRAL_ROLES,
    REMESSA_OBRA: CENTRAL_ROLES,
    DEVOLUCAO_CENTRAL: ALL_INVENTORY_ROLES,
    CONSUMO_OBRA: OBRA_ROLES,
    AJUSTE_CENTRAL: CENTRAL_ROLES,
    AJUSTE_OBRA: OBRA_ROLES,
  };
  const perfis: [string, string, Acessos][] = [
    ['ALMOXARIFE_GERAL', 'Central', soCentral],
    ['ALMOXARIFE_OBRA', 'Obra', soObra],
    ['ADMINISTRADOR', 'admin', admin],
  ];

  for (const [cargo, rotulo, acessos] of perfis) {
    for (const [op, fluxo] of Object.entries(FLUXO_DA_OPERACAO)) {
      const permitiaPorCargo = porCargo[op].includes(cargo);
      it(`${rotulo}: ${op} ${permitiaPorCargo ? 'permitido' : 'negado'}`, () => {
        const lados = depositosDoFluxo(fluxo, depositos);
        expect(podeExecutar(acessos, lados, fluxo.quemOpera)).toBe(permitiaPorCargo);
      });
    }
  }

  it('cobre todas as operações que existiam por cargo', () => {
    expect(Object.keys(porCargo).sort()).toEqual(Object.keys(FLUXO_DA_OPERACAO).sort());
    expect(ADMIN_ROLES.every(ehAdmin)).toBe(true);
  });
});

describe('o que a atribuição permite além do cargo', () => {
  it('uma pessoa pode operar a Central de uma unidade e a Obra de outra', () => {
    const natalObra = 'o2';
    const misto: Acessos = new Map([[CENTRAL, 'OPERA'], [natalObra, 'OPERA']]);
    expect(podeOperar(misto, CENTRAL)).toBe(true);
    expect(podeOperar(misto, natalObra)).toBe(true);
    expect(podeOperar(misto, OBRA)).toBe(false);
  });

  it('devolução pode ser registrada por quem está na Obra ou na Central', () => {
    const lados = depositosDoFluxo(FLUXO_DA_OPERACAO.DEVOLUCAO_CENTRAL, depositos);
    expect(podeExecutar(soObra, lados, 'qualquer')).toBe(true);
    expect(podeExecutar(soCentral, lados, 'qualquer')).toBe(true);
    expect(podeExecutar(consultaCentral, lados, 'qualquer')).toBe(false);
  });
});
