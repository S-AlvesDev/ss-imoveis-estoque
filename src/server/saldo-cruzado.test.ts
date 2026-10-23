import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Uma operação só pode encostar nos depósitos que ela move.
 *
 * O defeito relatado: um funcionário deu saída no almoxarifado de obra e o
 * central foi descontado junto. A causa não é a conta — `calcularMovimento`
 * acerta os números — é a GRAVAÇÃO: o cálculo devolvia o mapa inteiro de
 * saldos (todos os depósitos daquele material, lidos no início da
 * requisição) e `gravarSaldos` escrevia linha por linha, inclusive as que a
 * operação nunca tocou.
 *
 * Enquanto nada mais acontece ao mesmo tempo, reescrever o mesmo valor passa
 * despercebido. Mas entre a leitura e a gravação cabe outra operação: uma
 * entrada no central, feita por outra pessoa, é desfeita pela saída da obra
 * — que grava por cima o saldo velho do central. Some estoque sem nenhum
 * movimento que explique, e a conta "descontou no central" aparece.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { calcularMovimento, gravarSaldos } from './estoque';

const CENTRAL = 'd0000000-0000-4000-8000-00000000000c';
const OBRA = 'd0000000-0000-4000-8000-00000000000b';
const nomeDe = (id: string) => (id === CENTRAL ? 'Almoxarifado Central' : 'Almoxarifado de Obra');

/** O banco, com o que foi efetivamente escrito em cada chamada. */
const banco = { saldos: {} as Record<string, number>, escritas: [] as string[][] };

const db = {
  from: () => ({
    upsert: async (linhas: any[]) => {
      banco.escritas.push(linhas.map((l) => l.warehouse_id));
      for (const l of linhas) banco.saldos[l.warehouse_id] = Number(l.saldo);
      return { error: null };
    },
  }),
} as any;

beforeEach(() => {
  banco.saldos = { [CENTRAL]: 100, [OBRA]: 50 };
  banco.escritas = [];
});

describe('a gravação só encosta no que a operação moveu', () => {
  it('consumo na obra não escreve no central', async () => {
    const atuais = { ...banco.saldos };
    const r = calcularMovimento(atuais, { origem_id: OBRA, quantidade: 10, rotulo: 'este consumo', nomeDe });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tocados).toEqual([OBRA]);
    await gravarSaldos(db, 1, r.novos, r.tocados);
    expect(banco.escritas).toEqual([[OBRA]]);
  });

  it('transferência escreve os dois lados, e só os dois', async () => {
    const r = calcularMovimento({ ...banco.saldos, outro: 7 }, { origem_id: CENTRAL, destino_id: OBRA, quantidade: 10, rotulo: 'esta transferência', nomeDe });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Set(r.tocados)).toEqual(new Set([CENTRAL, OBRA]));
    await gravarSaldos(db, 1, r.novos, r.tocados);
    expect(new Set(banco.escritas[0])).toEqual(new Set([CENTRAL, OBRA]));
  });

  it('ajuste escreve só o depósito ajustado', async () => {
    const r = calcularMovimento({ ...banco.saldos }, { destino_id: CENTRAL, quantidade: -3, ajuste: true, rotulo: 'este ajuste', nomeDe });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tocados).toEqual([CENTRAL]);
  });

  it('o relato: a saída na obra não pode desfazer uma entrada feita no central no meio do caminho', async () => {
    // Quem vai dar saída na obra lê os saldos agora.
    const lidosPelaObra = { ...banco.saldos };

    // Enquanto isso, outra pessoa dá entrada de 30 no central e grava.
    const entrada = calcularMovimento({ ...banco.saldos }, { destino_id: CENTRAL, quantidade: 30, rotulo: 'esta entrada', nomeDe });
    expect(entrada.ok).toBe(true);
    if (!entrada.ok) return;
    await gravarSaldos(db, 1, entrada.novos, entrada.tocados);
    expect(banco.saldos[CENTRAL]).toBe(130);

    // Só então a saída da obra conclui, com o mapa que leu lá atrás.
    const saida = calcularMovimento(lidosPelaObra, { origem_id: OBRA, quantidade: 10, rotulo: 'este consumo', nomeDe });
    expect(saida.ok).toBe(true);
    if (!saida.ok) return;
    await gravarSaldos(db, 1, saida.novos, saida.tocados);

    expect(banco.saldos[OBRA]).toBe(40);
    // Antes, o central voltava para 100: a entrada de 30 sumia sem deixar rastro.
    expect(banco.saldos[CENTRAL]).toBe(130);
  });
});
