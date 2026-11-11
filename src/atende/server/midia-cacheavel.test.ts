import { describe, it, expect, vi } from 'vitest';

/**
 * Por que a franquia de tráfego do Storage estava acabando.
 *
 * Cada abertura de conversa assinava uma URL nova para o mesmo arquivo. Para
 * o navegador, endereço diferente é arquivo diferente: ele baixava tudo de
 * novo, toda vez. Trocar de conversa e voltar baixava a conversa inteira
 * outra vez — o mesmo áudio, o mesmo print, dezenas de vezes por dia, por
 * pessoa.
 *
 * O conserto é fazer o endereço se repetir. O que se guarda aqui é essa
 * regra: enquanto a URL valer com folga, é ela que sai — igual para todo
 * mundo, para o navegador poder reaproveitar.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { urlAindaServe, MARGEM_PARA_REASSINAR_MS, URL_DE_VISUALIZACAO_SEGUNDOS, URL_ASSINADA_SEGUNDOS, CACHE_DA_MIDIA } from './midias';

const AGORA = Date.parse('2026-11-10T15:00:00Z');
const comValidade = (ms: number) => ({ caminho: 'e/c/m.jpg', url_vista: 'https://exemplo.supabase.co/x?token=abc', url_vista_vence: AGORA + ms });

describe('reaproveitar a URL', () => {
  it('URL com folga é reaproveitada — é o que deixa o navegador cachear', () => {
    expect(urlAindaServe(comValidade(12 * 3600_000), AGORA)).toBe(true);
  });

  it('perto de vencer, assina de novo: ninguém recebe URL que morre no meio do download', () => {
    expect(urlAindaServe(comValidade(MARGEM_PARA_REASSINAR_MS - 1), AGORA)).toBe(false);
    expect(urlAindaServe(comValidade(MARGEM_PARA_REASSINAR_MS + 1), AGORA)).toBe(true);
  });

  it('vencida não serve', () => {
    expect(urlAindaServe(comValidade(-1), AGORA)).toBe(false);
  });

  it('mídia sem URL guardada (o que existe hoje no banco) assina normalmente', () => {
    expect(urlAindaServe({ caminho: 'e/c/m.jpg' }, AGORA)).toBe(false);
  });

  it('lixo no campo não vira URL', () => {
    for (const m of [null, undefined, {}, { url_vista: '' }, { url_vista: 42, url_vista_vence: AGORA + 9e9 }, { url_vista: 'https://x', url_vista_vence: 'amanhã' }, { url_vista: 'https://x' }]) {
      expect(urlAindaServe(m, AGORA)).toBe(false);
    }
  });
});

describe('as validades combinam entre si', () => {
  it('a URL de visualização dura bem mais que a margem — senão reassinaria sempre', () => {
    expect(URL_DE_VISUALIZACAO_SEGUNDOS * 1000).toBeGreaterThan(MARGEM_PARA_REASSINAR_MS * 2);
  });

  it('visualização é longa; download continua curto, que é uma vez só', () => {
    expect(URL_DE_VISUALIZACAO_SEGUNDOS).toBeGreaterThan(URL_ASSINADA_SEGUNDOS);
  });

  it('o arquivo é imutável (o caminho tem o id da mensagem), então o cache é longo', () => {
    expect(Number(CACHE_DA_MIDIA)).toBeGreaterThanOrEqual(URL_DE_VISUALIZACAO_SEGUNDOS);
  });

  it('uma URL recém-assinada é reaproveitável — a conta não pode nascer vencida', () => {
    expect(urlAindaServe(comValidade(URL_DE_VISUALIZACAO_SEGUNDOS * 1000), AGORA)).toBe(true);
  });
});
