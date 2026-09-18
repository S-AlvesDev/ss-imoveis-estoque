import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
import { presencaEfetiva, PRESENCA_VALIDA_MS } from '../shared/presenca';
import { duracao } from '../app/pages/central/util';
import { cursorDoDelta } from './conversas';

describe('Etapa 4 — presença', () => {
  const agora = Date.parse('2026-09-16T17:30:00Z');
  const ha = (ms: number) => new Date(agora - ms).toISOString();

  it('quem bateu há menos de 2 min está online; "ausente" é escolha da pessoa e fica', () => {
    expect(presencaEfetiva({ presenca: 'online', presenca_em: ha(10_000) }, agora)).toBe('online');
    expect(presencaEfetiva({ presenca: 'ausente', presenca_em: ha(10_000) }, agora)).toBe('ausente');
    // Saiu pela porta (Sair grava 'offline'): offline na hora, mesmo com a batida recente.
    expect(presencaEfetiva({ presenca: 'offline', presenca_em: ha(5_000) }, agora)).toBe('offline');
  });

  it('quem parou de bater está offline, diga o banco o que disser', () => {
    expect(presencaEfetiva({ presenca: 'online', presenca_em: ha(PRESENCA_VALIDA_MS + 1) }, agora)).toBe('offline');
    expect(presencaEfetiva({ presenca: 'ausente', presenca_em: ha(10 * 60_000) }, agora)).toBe('offline');
    expect(presencaEfetiva({ presenca: 'online', presenca_em: null }, agora)).toBe('offline');
    expect(presencaEfetiva(null, agora)).toBe('offline');
  });
});

describe('Etapa 4 — tempo de espera na tela', () => {
  it('formata curto', () => {
    expect(duracao(30_000)).toBe('agora');
    expect(duracao(90_000)).toBe('1 min');
    expect(duracao(59 * 60_000)).toBe('59 min');
    expect(duracao(60 * 60_000)).toBe('1 h');
    expect(duracao(90 * 60_000)).toBe('1 h 30');
    expect(duracao(5 * 60 * 60_000 + 5 * 60_000)).toBe('5 h 05');
    expect(duracao(49 * 60 * 60_000)).toBe('2 d');
    expect(duracao(-5000)).toBe('agora');
  });
});

describe('Etapa 4 — o cursor do sync vem do relógio do banco', () => {
  const agora = Date.parse('2026-09-18T02:55:30.000Z');

  it('o maior atualizado_em visto, com precisão de milissegundo', () => {
    expect(cursorDoDelta(['2026-09-18T02:54:44.513686+00:00', '2026-09-18T02:54:40.000+00:00', null], '2026-09-18T02:54:00.000Z', agora)).toBe('2026-09-18T02:54:44.513Z');
  });

  it('sem nada novo, o cursor anterior fica — mesmo com o servidor 22 s adiantado', () => {
    expect(cursorDoDelta([], '2026-09-18T02:54:00.000Z', agora)).toBe('2026-09-18T02:54:00.000Z');
  });

  it('na primeira vez sem nada, 5 min atrás do servidor', () => {
    expect(cursorDoDelta([], null, agora)).toBe('2026-09-18T02:50:30.000Z');
  });
});
