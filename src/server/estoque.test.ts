import { describe, it, expect } from 'vitest';
import {
  FLUXO_DA_OPERACAO,
  calcularMovimento,
  acharDeposito,
  depositosDoFluxo,
  depositosDaUnidade,
  arredondar,
  totalDosDepositos,
  type Deposito,
  type SaldosPorDeposito,
} from './estoque';

const CENTRAL = 'd0000000-0000-4000-8000-00000000000c';
const OBRA = 'd0000000-0000-4000-8000-00000000000b';
const NATAL = 'd0000000-0000-4000-8000-00000000000e';

const depositos: Deposito[] = [
  { id: CENTRAL, nome: 'Almoxarifado Central', tipo: 'CENTRAL', unit_id: 'u1', ativo: true },
  { id: OBRA, nome: 'Almoxarifado de Obra', tipo: 'OBRA', unit_id: 'u1', ativo: true },
];

const nomeDe = (id: string) => depositos.find((d) => d.id === id)?.nome ?? id;

/** Monta um pedido a partir de uma operação legada, como a rota faz. */
function pedido(tipo: string, quantidade: number) {
  const fluxo = FLUXO_DA_OPERACAO[tipo];
  return { ...depositosDoFluxo(fluxo, depositos), quantidade, ajuste: fluxo.ajuste, rotulo: fluxo.rotulo, nomeDe };
}

describe('FLUXO_DA_OPERACAO', () => {
  it('cobre exatamente as operações que o servidor aceita', () => {
    // Se uma operação nova entrar em OPERATION_ROLES sem entrar aqui, ela
    // passa na permissão e cai na rota sem saber para onde mover o saldo.
    expect(Object.keys(FLUXO_DA_OPERACAO).sort()).toEqual(
      ['AJUSTE_CENTRAL', 'AJUSTE_OBRA', 'CONSUMO_OBRA', 'DEVOLUCAO_CENTRAL', 'ENTRADA_CENTRAL', 'REMESSA_OBRA', 'SAIDA'].sort(),
    );
  });

  it('transferências têm os dois lados', () => {
    expect(FLUXO_DA_OPERACAO.REMESSA_OBRA).toMatchObject({ origem: 'CENTRAL', destino: 'OBRA' });
    expect(FLUXO_DA_OPERACAO.DEVOLUCAO_CENTRAL).toMatchObject({ origem: 'OBRA', destino: 'CENTRAL' });
  });
});

describe('calcularMovimento — as operações do dia a dia', () => {
  const atuais: SaldosPorDeposito = { [CENTRAL]: 100, [OBRA]: 30 };

  it('entrada soma na Central', () => {
    const r = calcularMovimento(atuais, pedido('ENTRADA_CENTRAL', 25));
    expect(r).toEqual({ ok: true, novos: { [CENTRAL]: 125, [OBRA]: 30 } });
  });

  it('saída tira da Central', () => {
    const r = calcularMovimento(atuais, pedido('SAIDA', 40));
    expect(r).toEqual({ ok: true, novos: { [CENTRAL]: 60, [OBRA]: 30 } });
  });

  it('remessa move da Central para a Obra sem mudar o total', () => {
    const r = calcularMovimento(atuais, pedido('REMESSA_OBRA', 50));
    expect(r).toEqual({ ok: true, novos: { [CENTRAL]: 50, [OBRA]: 80 } });
    if (r.ok) expect(totalDosDepositos(r.novos)).toBe(totalDosDepositos(atuais));
  });

  it('consumo tira da Obra', () => {
    const r = calcularMovimento(atuais, pedido('CONSUMO_OBRA', 10));
    expect(r).toEqual({ ok: true, novos: { [CENTRAL]: 100, [OBRA]: 20 } });
  });

  it('devolução move da Obra para a Central', () => {
    const r = calcularMovimento(atuais, pedido('DEVOLUCAO_CENTRAL', 30));
    expect(r).toEqual({ ok: true, novos: { [CENTRAL]: 130, [OBRA]: 0 } });
  });

  it('ajuste soma um delta com sinal — negativo inclusive', () => {
    expect(calcularMovimento(atuais, pedido('AJUSTE_CENTRAL', -7))).toEqual({
      ok: true, novos: { [CENTRAL]: 93, [OBRA]: 30 },
    });
    expect(calcularMovimento(atuais, pedido('AJUSTE_OBRA', 12.5))).toEqual({
      ok: true, novos: { [CENTRAL]: 100, [OBRA]: 42.5 },
    });
  });
});

describe('calcularMovimento — o que ela recusa', () => {
  const atuais: SaldosPorDeposito = { [CENTRAL]: 100, [OBRA]: 30 };

  it('não deixa tirar mais do que existe, e diz de onde faltou', () => {
    const r = calcularMovimento(atuais, pedido('SAIDA', 101));
    expect(r).toEqual({ ok: false, erro: 'Saldo insuficiente em Almoxarifado Central para esta saída.' });

    const c = calcularMovimento(atuais, pedido('CONSUMO_OBRA', 31));
    expect(c).toEqual({ ok: false, erro: 'Saldo insuficiente em Almoxarifado de Obra para este consumo.' });
  });

  it('tirar exatamente o que existe é permitido (zera, não fica negativo)', () => {
    const r = calcularMovimento(atuais, pedido('CONSUMO_OBRA', 30));
    expect(r).toEqual({ ok: true, novos: { [CENTRAL]: 100, [OBRA]: 0 } });
  });

  it('quantidade negativa numa entrada é recusada — seria saída disfarçada', () => {
    // Antes da virada isso passava: -5 numa entrada reduzia o saldo e o
    // histórico registrava "entrada". A regra nova fecha essa porta.
    expect(calcularMovimento(atuais, pedido('ENTRADA_CENTRAL', -5))).toEqual({
      ok: false, erro: 'A quantidade precisa ser maior que zero.',
    });
    expect(calcularMovimento(atuais, pedido('REMESSA_OBRA', 0))).toEqual({
      ok: false, erro: 'A quantidade precisa ser maior que zero.',
    });
  });

  it('quantidade que não é número é recusada', () => {
    expect(calcularMovimento(atuais, pedido('ENTRADA_CENTRAL', Number('abc')))).toEqual({
      ok: false, erro: 'Quantidade inválida.',
    });
  });

  it('ajuste que levaria a saldo negativo é recusado', () => {
    expect(calcularMovimento(atuais, pedido('AJUSTE_OBRA', -31))).toEqual({
      ok: false, erro: 'A operação resultaria em saldo negativo.',
    });
  });

  it('um saldo negativo herdado em OUTRO depósito não trava a operação', () => {
    // Produção já teve saldo negativo. Se uma entrada na Central fosse barrada
    // porque a Obra está em -2, o estoque pararia por um problema que não é
    // desta operação.
    const comNegativo: SaldosPorDeposito = { [CENTRAL]: 10, [OBRA]: -2 };
    const r = calcularMovimento(comNegativo, pedido('ENTRADA_CENTRAL', 5));
    expect(r).toEqual({ ok: true, novos: { [CENTRAL]: 15, [OBRA]: -2 } });
  });

  it('depósito ainda sem linha de saldo conta como zero', () => {
    const r = calcularMovimento({}, pedido('ENTRADA_CENTRAL', 5));
    expect(r).toEqual({ ok: true, novos: { [CENTRAL]: 5 } });
    expect(calcularMovimento({}, pedido('SAIDA', 1))).toMatchObject({ ok: false });
  });
});

describe('calcularMovimento — arredondamento', () => {
  it('grava com 2 casas, como a coluna do banco', () => {
    const r = calcularMovimento({ [CENTRAL]: 0.1 }, pedido('ENTRADA_CENTRAL', 0.2));
    // Sem arredondar, 0.1 + 0.2 = 0.30000000000000004 — e o banco guardaria 0.30.
    expect(r).toEqual({ ok: true, novos: { [CENTRAL]: 0.3 } });
  });

  it('arredondar', () => {
    expect(arredondar(987654.321)).toBe(987654.32);
    expect(arredondar(1.005)).toBe(1); // float: 1.005 é 1.00499...; o banco faz o mesmo
    expect(arredondar(-3.456)).toBe(-3.46);
  });
});

describe('depositosDaUnidade — com uma unidade tudo serve; com duas, precisa dizer qual', () => {
  const natal: Deposito[] = [
    { id: 'nc', nome: 'Central de Natal', tipo: 'CENTRAL', unit_id: 'u2', ativo: true },
    { id: 'no', nome: 'Obra de Natal', tipo: 'OBRA', unit_id: 'u2', ativo: true },
  ];

  it('uma unidade só: devolve tudo mesmo sem informar', () => {
    expect(depositosDaUnidade(depositos)).toHaveLength(2);
    expect(depositosDaUnidade(depositos, null)).toHaveLength(2);
  });

  it('duas unidades sem informar: recusa', () => {
    expect(() => depositosDaUnidade([...depositos, ...natal])).toThrow(/mais de uma unidade/);
  });

  it('duas unidades informando: devolve só a pedida, e o Central dela é único', () => {
    const deNatal = depositosDaUnidade([...depositos, ...natal], 'u2');
    expect(deNatal.map((d) => d.id)).toEqual(['nc', 'no']);
    expect(acharDeposito(deNatal, 'CENTRAL').id).toBe('nc');
  });

  it('unidade inexistente: recusa em vez de devolver vazio', () => {
    // Vazio viraria "sem depósito CENTRAL" mais adiante — erro certo, mas o
    // motivo real é outro, e a mensagem tem que dizer o motivo real.
    expect(() => depositosDaUnidade(depositos, 'nao-existe')).toThrow(/Unidade sem depósito/);
  });
});

describe('acharDeposito — falha fecha', () => {
  it('acha quando há exatamente um', () => {
    expect(acharDeposito(depositos, 'CENTRAL').id).toBe(CENTRAL);
  });

  it('recusa quando não há nenhum', () => {
    expect(() => acharDeposito([], 'CENTRAL')).toThrow(/Não há depósito CENTRAL/);
  });

  it('recusa quando há dois — não escolhe no chute', () => {
    // É o cenário de duas unidades. Nesse ponto a operação precisa dizer o
    // depósito pelo id; adivinhar seria mexer no saldo de Natal achando que é
    // Nova Cruz.
    const duas = [...depositos, { id: NATAL, nome: 'Central de Natal', tipo: 'CENTRAL' as const, unit_id: 'u2', ativo: true }];
    expect(() => acharDeposito(duas, 'CENTRAL')).toThrow(/2 depósitos CENTRAL/);
  });
});

/**
 * TESTE DIFERENCIAL
 *
 * A lógica antiga era um switch na rota. A nova é `calcularMovimento`. Para
 * uma virada em cima de saldo, "os testes passam" não basta: as duas precisam
 * dar a MESMA resposta para as mesmas entradas — inclusive as recusas.
 *
 * A única diferença deliberada é quantidade <= 0 em operação que não é
 * ajuste: a antiga aceitava, a nova recusa. Fica fora deste teste porque é uma
 * mudança, não uma equivalência.
 */
function logicaAntiga(saldoCentral: number, saldoObra: number, tipo: string, q: number) {
  let c = saldoCentral;
  let o = saldoObra;
  switch (tipo) {
    case 'ENTRADA_CENTRAL': c += q; break;
    case 'SAIDA': if (q > c) return { erro: true }; c -= q; break;
    case 'REMESSA_OBRA': if (q > c) return { erro: true }; c -= q; o += q; break;
    case 'CONSUMO_OBRA': if (q > o) return { erro: true }; o -= q; break;
    case 'DEVOLUCAO_CENTRAL': if (q > o) return { erro: true }; o -= q; c += q; break;
    case 'AJUSTE_CENTRAL': c += q; break;
    case 'AJUSTE_OBRA': o += q; break;
    default: return { erro: true };
  }
  if (c < 0 || o < 0) return { erro: true };
  return { erro: false, c: arredondar(c), o: arredondar(o) };
}

describe('equivalência com a lógica antiga', () => {
  // Gerador determinístico: o teste tem que falhar do mesmo jeito toda vez.
  let semente = 20260910;
  const aleatorio = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff; };
  const valor = (max: number) => arredondar(aleatorio() * max);

  it('dá a mesma resposta para milhares de combinações', () => {
    const tipos = Object.keys(FLUXO_DA_OPERACAO);
    let comparadas = 0;

    for (let i = 0; i < 5000; i++) {
      const tipo = tipos[Math.floor(aleatorio() * tipos.length)];
      const saldoCentral = valor(200);
      const saldoObra = valor(200);
      const ehAjuste = FLUXO_DA_OPERACAO[tipo].ajuste === true;
      // Ajuste pode ser negativo; as demais, só positivas (a diferença deliberada fica de fora).
      const q = ehAjuste ? arredondar(valor(100) - 50) : arredondar(valor(150) + 0.01);

      const antiga = logicaAntiga(saldoCentral, saldoObra, tipo, q);
      const nova = calcularMovimento({ [CENTRAL]: saldoCentral, [OBRA]: saldoObra }, pedido(tipo, q));

      const contexto = `${tipo} q=${q} central=${saldoCentral} obra=${saldoObra}`;
      expect(nova.ok, contexto).toBe(!antiga.erro);
      if (nova.ok && !antiga.erro) {
        expect(nova.novos[CENTRAL], contexto).toBe(antiga.c);
        expect(nova.novos[OBRA], contexto).toBe(antiga.o);
      }
      comparadas++;
    }

    expect(comparadas).toBe(5000);
  });
});
