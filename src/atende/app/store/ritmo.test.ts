import { describe, it, expect } from 'vitest';
import { intervaloDoSync, ATIVO_MS, OCIOSO_MS, ESCONDIDO_SEM_PUSH_MS, ESCONDIDO_COM_PUSH_MS } from './ritmo';

const visivel = (tiquesVazios: number) => intervaloDoSync({ escondido: false, temPush: false, tiquesVazios });

describe('ritmo do sync, com a aba na frente', () => {
  it('bate rápido enquanto chega novidade', () => {
    expect(visivel(0)).toBe(ATIVO_MS);
  });

  it('afrouxa um degrau por tique vazio', () => {
    expect(visivel(1)).toBe(OCIOSO_MS[0]);
    expect(visivel(2)).toBe(OCIOSO_MS[1]);
    expect(visivel(3)).toBe(OCIOSO_MS[2]);
  });

  it('para de afrouxar no teto, por mais silêncio que faça', () => {
    expect(visivel(4)).toBe(OCIOSO_MS[OCIOSO_MS.length - 1]);
    expect(visivel(900)).toBe(OCIOSO_MS[OCIOSO_MS.length - 1]);
  });

  it('o teto é o atraso máximo que alguém olhando a tela pode sentir', () => {
    expect(Math.max(...OCIOSO_MS)).toBeLessThanOrEqual(20_000);
  });

  it('volta ao ritmo rápido assim que a contagem zera', () => {
    expect(visivel(3)).toBe(OCIOSO_MS[2]);
    expect(visivel(0)).toBe(ATIVO_MS);
  });
});

describe('ritmo do sync, com a aba escondida', () => {
  it('sem push, continua batendo: é ele que dispara a notificação do sistema', () => {
    expect(intervaloDoSync({ escondido: true, temPush: false, tiquesVazios: 0 })).toBe(ESCONDIDO_SEM_PUSH_MS);
    expect(intervaloDoSync({ escondido: true, temPush: false, tiquesVazios: 50 })).toBe(ESCONDIDO_SEM_PUSH_MS);
  });

  it('sem push, não demora mais que um minuto para avisar', () => {
    expect(ESCONDIDO_SEM_PUSH_MS).toBeLessThanOrEqual(60_000);
  });

  it('com push, quem avisa é o service worker; aqui é só rede de segurança', () => {
    expect(intervaloDoSync({ escondido: true, temPush: true, tiquesVazios: 0 })).toBe(ESCONDIDO_COM_PUSH_MS);
  });

  it('escondida nunca bate mais rápido do que na frente', () => {
    const naFrente = visivel(0);
    expect(ESCONDIDO_SEM_PUSH_MS).toBeGreaterThan(naFrente);
    expect(ESCONDIDO_COM_PUSH_MS).toBeGreaterThan(naFrente);
  });
});
