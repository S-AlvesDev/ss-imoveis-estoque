import { describe, it, expect } from 'vitest';
import { intervaloDoTique } from './useSincronizacao';

/**
 * O ritmo do sync — por que ele não é fixo.
 *
 * Cada tique dispara consultas ao banco, e cada consulta vira linha de log
 * na Supabase. Com 4 segundos cravados o dia inteiro, uma aba aberta
 * sozinha gerava dezenas de milhares de consultas por dia sem nada
 * acontecer: foi isso, e não o volume de atendimento, que estourou a cota.
 *
 * O que não pode quebrar nessa economia: quem está atendendo não pode
 * sentir diferença nenhuma.
 */

describe('o ritmo', () => {
  it('com movimento, 4 segundos — o atendimento não muda de velocidade', () => {
    expect(intervaloDoTique(0, false)).toBe(4_000);
  });

  it('o afrouxamento só começa depois de meio minuto calado', () => {
    expect(intervaloDoTique(7, false)).toBe(4_000);
    expect(intervaloDoTique(8, false)).toBe(8_000);
  });

  it('com a aba à vista, 8 s é o limite — quem espera um cliente não pode esperar mais', () => {
    expect(intervaloDoTique(30, false)).toBe(8_000);
    expect(intervaloDoTique(10_000, false)).toBe(8_000);
  });

  it('aba escondida é o mais lento: ninguém está olhando', () => {
    expect(intervaloDoTique(0, true)).toBe(20_000);
    expect(intervaloDoTique(999, true)).toBe(20_000);
  });

  it('esconder a aba nunca deixa o ritmo mais rápido do que estava', () => {
    for (const v of [0, 8, 30, 500]) expect(intervaloDoTique(v, true)).toBeGreaterThanOrEqual(intervaloDoTique(v, false));
  });

  it('mais silêncio nunca resulta em tique mais frequente', () => {
    const ritmos = [0, 5, 8, 20, 30, 100].map((v) => intervaloDoTique(v, false));
    for (let i = 1; i < ritmos.length; i++) expect(ritmos[i]).toBeGreaterThanOrEqual(ritmos[i - 1]);
  });

  it('nenhum ritmo passa de 20 s: o alarme da supervisão tem que chegar', () => {
    for (const escondido of [true, false]) {
      for (const v of [0, 8, 30, 1e6]) expect(intervaloDoTique(v, escondido)).toBeLessThanOrEqual(20_000);
    }
  });
});

/**
 * Com push, quem avisa é o service worker: mensagem nova e cutucada saem pelo
 * servidor (ver `cutucar()`, em server/conversas.ts). Aí o relógio da aba
 * escondida vira rede de segurança e pode afrouxar — sem que o atendente com o
 * celular no bolso perca nada. É o único jeito de economizar sem cobrar dele.
 */
describe('o push muda o que a aba escondida precisa fazer', () => {
  it('sem push, a aba escondida continua nos 20 s de sempre', () => {
    expect(intervaloDoTique(0, true, false)).toBe(20_000);
    expect(intervaloDoTique(999, true, false)).toBe(20_000);
  });

  it('não saber se tem push é tratado como não ter: erra para o lado de avisar', () => {
    expect(intervaloDoTique(0, true)).toBe(intervaloDoTique(0, true, false));
  });

  it('com push, a aba escondida afrouxa', () => {
    expect(intervaloDoTique(0, true, true)).toBeGreaterThan(intervaloDoTique(0, true, false));
  });

  it('mas nunca além dos 2 min que uma cutucada vale — se o push falhar, o delta ainda alcança', () => {
    expect(intervaloDoTique(0, true, true)).toBeLessThan(2 * 60_000);
  });

  it('o push não mexe no ritmo de quem está olhando a tela', () => {
    for (const v of [0, 8, 999]) expect(intervaloDoTique(v, false, true)).toBe(intervaloDoTique(v, false, false));
  });

  it('a aba escondida com push ainda é mais lenta que a aba à vista', () => {
    expect(intervaloDoTique(999, true, true)).toBeGreaterThan(intervaloDoTique(999, false, true));
  });
});

describe('a economia', () => {
  /** Uma jornada de 12 h quase toda calada, que é o caso comum. */
  const tiquesEm = (ms: number, janelaMs: number) => Math.round(janelaMs / ms);

  it('uma aba parada o dia todo passa a custar metade dos tiques', () => {
    const doze = 12 * 3600_000;
    const antes = tiquesEm(4_000, doze);
    const depois = tiquesEm(intervaloDoTique(999, false), doze);
    expect(antes / depois).toBeCloseTo(2, 1);
  });

  it('o pior atraso com alguém olhando é 8 s — o dobro do de antes, não mais', () => {
    expect(intervaloDoTique(1e6, false)).toBeLessThanOrEqual(2 * 4_000);
  });

  it('ligar o push corta em dois terços o que uma aba esquecida custa', () => {
    const doze = 12 * 3600_000;
    const semPush = tiquesEm(intervaloDoTique(999, true, false), doze);
    const comPush = tiquesEm(intervaloDoTique(999, true, true), doze);
    expect(semPush / comPush).toBeCloseTo(3, 1);
  });
});
