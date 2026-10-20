import { describe, it, expect } from 'vitest';
import { encaixarAnexos } from './Composer';

/**
 * A fila de anexos do compositor: dá para escolher vários de uma vez, e o
 * seletor pode ser aberto mais de uma vez sem perder o que já estava.
 */
describe('encaixar os anexos escolhidos', () => {
  it('escolher vários de uma vez entra todo mundo', () => {
    expect(encaixarAnexos([], ['a', 'b', 'c'], 10)).toEqual({ fila: ['a', 'b', 'c'], sobraram: 0 });
  });

  it('abrir o seletor de novo soma, não substitui — era o trabalho de botar de um em um', () => {
    expect(encaixarAnexos(['a'], ['b', 'c'], 10)).toEqual({ fila: ['a', 'b', 'c'], sobraram: 0 });
  });

  it('passou do teto: entra o que cabe e diz quantos ficaram de fora', () => {
    expect(encaixarAnexos(['a', 'b'], ['c', 'd', 'e'], 4)).toEqual({ fila: ['a', 'b', 'c', 'd'], sobraram: 1 });
  });

  it('fila cheia não engole mais nada, e avisa', () => {
    expect(encaixarAnexos(['a', 'b'], ['c'], 2)).toEqual({ fila: ['a', 'b'], sobraram: 1 });
  });

  it('a ordem escolhida é mantida — é a ordem em que as mensagens vão sair', () => {
    expect(encaixarAnexos(['1'], ['2', '3', '4'], 10).fila).toEqual(['1', '2', '3', '4']);
  });

  it('nada escolhido não mexe na fila', () => {
    expect(encaixarAnexos(['a'], [], 10)).toEqual({ fila: ['a'], sobraram: 0 });
  });
});
