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
});
