import { describe, it, expect } from 'vitest';
import {
  movementDirection,
  needsPurchase,
  needsTransfer,
  ondeTem,
  percentOfMinimum,
  saldoEm,
  signedQuantity,
  statusLabel,
  stockStatus,
  stockTotal,
} from './utils';

/**
 * Só os campos que as regras de saldo enxergam. Dois estoques na unidade,
 * com os ids 'central' e 'obra' — os nomes de antes, agora só nos testes.
 */
function material(central: number, obra: number, estoque_minimo: number) {
  return { saldo_unidade: central + obra, saldos_unidade: { central, obra }, estoque_minimo };
}

describe('stockTotal', () => {
  it('soma os dois almoxarifados', () => {
    expect(stockTotal(material(30, 12, 0))).toBe(42);
  });

  it('aceita valores vindos do banco como texto', () => {
    // O Supabase devolve numeric como string; sem Number() a soma vira concatenação.
    const doBanco = { saldo_unidade: '42', saldos_unidade: { central: '30', obra: '12' }, estoque_minimo: '5' } as never;
    expect(stockTotal(doBanco)).toBe(42);
    expect(saldoEm(doBanco, 'obra')).toBe(12);
  });

  it('com mais de uma unidade, conta SÓ a unidade que está sendo olhada', () => {
    // saldo_unidade/saldos_unidade já são a visão de Nova Cruz (30 + 12); o
    // saldo de Natal nem chega aqui — o hook filtra pelos estoques da unidade.
    // O mínimo se compara com 42, e o que faltar em Nova Cruz se compra em Nova Cruz.
    expect(stockTotal(material(30, 12, 0))).toBe(42);
  });

  it('estoque sem linha de saldo conta como zero', () => {
    expect(saldoEm(material(30, 12, 0), 'inexistente')).toBe(0);
  });
});

describe('stockStatus — com mais de uma unidade', () => {
  it('zerado nesta unidade é RUPTURA mesmo que outra unidade tenha', () => {
    // Nova Cruz está em 0/0; Natal tem 50. Para Nova Cruz isso é falta de
    // verdade — a decisão certa é comprar, não pedir a Natal.
    const m = material(0, 0, 10);
    expect(stockStatus(m, 'obra')).toBe('RUPTURA');
    expect(stockStatus(m, 'central')).toBe('RUPTURA');
    expect(stockStatus(m, 'empresa')).toBe('RUPTURA');
  });

  it('remessa só vale dentro da mesma unidade', () => {
    // Obra de Nova Cruz vazia, Central de Nova Cruz com 20: remessa.
    expect(stockStatus(material(20, 0, 10), 'obra')).toBe('TRANSFERIR');
  });
});

describe('stockStatus — o bug dos 99 alarmes falsos', () => {
  it('NÃO acusa falta quando o material existe no outro almoxarifado', () => {
    // Este é o caso exato que a versão antiga marcava como crítico:
    // 500 na Central, 0 na Obra, mínimo 10.
    expect(stockStatus(material(500, 0, 10), 'empresa')).toBe('OK');
  });

  it('acusa remessa, não falta, quando visto pela ótica da Obra', () => {
    expect(stockStatus(material(500, 0, 10), 'obra')).toBe('TRANSFERIR');
  });

  it('espelha a lógica para a Central', () => {
    expect(stockStatus(material(0, 500, 10), 'central')).toBe('TRANSFERIR');
  });

  it('mínimo 0 não gera alerta permanente', () => {
    // A comparação antiga era `<=`, então 0 <= 0 marcava crítico para sempre.
    expect(stockStatus(material(5, 5, 0), 'empresa')).toBe('OK');
  });

  it('mínimo 0 ainda acusa quando zera em tudo', () => {
    expect(stockStatus(material(0, 0, 0), 'empresa')).toBe('RUPTURA');
  });
});

describe('stockStatus — classificação', () => {
  it('RUPTURA quando não existe em lugar nenhum', () => {
    expect(stockStatus(material(0, 0, 10), 'empresa')).toBe('RUPTURA');
  });

  it('RUPTURA tem precedência sobre remessa: não há de onde transferir', () => {
    expect(stockStatus(material(0, 0, 10), 'obra')).toBe('RUPTURA');
  });

  it('ABAIXO quando o total da empresa fica sob o mínimo', () => {
    expect(stockStatus(material(3, 2, 10), 'empresa')).toBe('ABAIXO');
  });

  it('ATENCAO entre o mínimo e 1,5x o mínimo', () => {
    expect(stockStatus(material(12, 0, 10), 'empresa')).toBe('ATENCAO');
  });

  it('OK a partir de 1,5x o mínimo', () => {
    expect(stockStatus(material(15, 0, 10), 'empresa')).toBe('OK');
  });

  it('exatamente no mínimo ainda não é falta', () => {
    // Fronteira: `total < minimo` é estrito. No mínimo o item está no limite,
    // não abaixo dele — vira ATENCAO, não ABAIXO.
    expect(stockStatus(material(10, 0, 10), 'empresa')).toBe('ATENCAO');
  });

  it('saldo negativo conta como ruptura', () => {
    // Ajuste manual errado pode deixar saldo negativo; não pode virar "OK".
    expect(stockStatus(material(-5, 0, 10), 'empresa')).toBe('RUPTURA');
  });

  it('escopo local não mascara falta real da empresa', () => {
    // Zerado na Obra e abaixo do mínimo no total: a remessa resolve o local,
    // mas a empresa continua precisando comprar.
    expect(stockStatus(material(2, 0, 10), 'obra')).toBe('TRANSFERIR');
    expect(stockStatus(material(2, 0, 10), 'empresa')).toBe('ABAIXO');
  });
});

describe('needsPurchase', () => {
  it('é verdadeiro só quando falta de verdade', () => {
    expect(needsPurchase(material(0, 0, 10))).toBe(true);
    expect(needsPurchase(material(3, 2, 10))).toBe(true);
  });

  it('é falso quando basta transferir', () => {
    expect(needsPurchase(material(500, 0, 10))).toBe(false);
  });

  it('é falso no limiar de atenção', () => {
    expect(needsPurchase(material(12, 0, 10))).toBe(false);
  });
});

describe('needsTransfer', () => {
  it('aponta remessa quando falta aqui e existe lá', () => {
    expect(needsTransfer(material(500, 0, 10), 'obra')).toBe(true);
    expect(needsTransfer(material(0, 500, 10), 'central')).toBe(true);
  });

  it('não aponta remessa quando o local tem saldo', () => {
    expect(needsTransfer(material(500, 5, 10), 'obra')).toBe(false);
  });

  it('não aponta remessa quando não há de onde transferir', () => {
    expect(needsTransfer(material(0, 0, 10), 'obra')).toBe(false);
  });
});

describe('percentOfMinimum', () => {
  it('calcula a cobertura do mínimo', () => {
    expect(percentOfMinimum(material(23, 0, 50))).toBe(46);
  });

  it('devolve null quando não há mínimo definido', () => {
    // Sem mínimo não existe percentual; a tela deve dizer isso, não mostrar 0%.
    expect(percentOfMinimum(material(10, 0, 0))).toBeNull();
  });

  it('passa de 100 quando o saldo supera o mínimo', () => {
    expect(percentOfMinimum(material(20, 0, 10))).toBe(200);
  });
});

describe('statusLabel', () => {
  it('diz onde tem quando quem chama sabe; genérico quando não', () => {
    expect(statusLabel('TRANSFERIR', 'obra', 'Almoxarifado Central')).toBe('Tem em Almoxarifado Central');
    expect(statusLabel('TRANSFERIR', 'obra')).toBe('Tem em outro estoque');
    expect(statusLabel('TRANSFERIR', 'empresa')).toBe('Tem em outro estoque');
  });

  it('ondeTem lista os estoques com saldo, fora o de quem olha', () => {
    const depositos = [
      { id: 'central', nome: 'Almoxarifado Central' },
      { id: 'obra', nome: 'Obra' },
      { id: 'esportes', nome: 'Coordenação de Esportes' },
    ];
    const m = { saldo_unidade: 25, saldos_unidade: { central: 20, obra: 0, esportes: 5 }, estoque_minimo: 0 };
    expect(ondeTem(m, depositos, 'obra')).toBe('Almoxarifado Central e Coordenação de Esportes');
    expect(ondeTem(m, depositos, 'central')).toBe('Coordenação de Esportes');
    expect(ondeTem(material(0, 0, 0), depositos, 'obra')).toBe('');
  });

  it('mantém o rótulo dos demais status', () => {
    expect(statusLabel('RUPTURA', 'obra')).toBe('Sem estoque');
    expect(statusLabel('ABAIXO', 'empresa')).toBe('Abaixo do mínimo');
  });
});

describe('movementDirection', () => {
  it('classifica entrada e saída', () => {
    expect(movementDirection('ENTRADA_CENTRAL')).toBe('in');
    expect(movementDirection('SAIDA')).toBe('out');
    expect(movementDirection('CONSUMO_OBRA')).toBe('out');
  });

  it('trata remessa e devolução como transferência', () => {
    // Não alteram o total da empresa — contá-las como entrada/saída era
    // parte da confusão que gerava alarme falso.
    expect(movementDirection('REMESSA_OBRA')).toBe('transfer');
    expect(movementDirection('DEVOLUCAO_CENTRAL')).toBe('transfer');
  });

  it('exclusão sai do estoque', () => {
    expect(movementDirection('EXCLUSÃO')).toBe('out');
  });

  it('ajuste é neutro: pode somar ou subtrair', () => {
    expect(movementDirection('AJUSTE_CENTRAL')).toBe('neutral');
  });
});

describe('signedQuantity', () => {
  it('assina conforme a direção', () => {
    expect(signedQuantity({ tipo_operacao: 'ENTRADA_CENTRAL', quantidade: 30 })).toBe('+30');
    expect(signedQuantity({ tipo_operacao: 'CONSUMO_OBRA', quantidade: 15 })).toBe('−15');
  });

  it('normaliza quantidade já negativa no banco', () => {
    // Registros antigos podem ter quantidade negativa; o sinal vem do tipo.
    expect(signedQuantity({ tipo_operacao: 'CONSUMO_OBRA', quantidade: -15 })).toBe('−15');
  });

  it('não assina transferência nem ajuste', () => {
    expect(signedQuantity({ tipo_operacao: 'REMESSA_OBRA', quantidade: 8 })).toBe('8');
    expect(signedQuantity({ tipo_operacao: 'AJUSTE_OBRA', quantidade: 8 })).toBe('8');
  });
});
