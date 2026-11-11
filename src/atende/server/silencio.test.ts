import { describe, it, expect, vi } from 'vitest';

/**
 * O vigia do silêncio.
 *
 * O caso real: a instância de um cliente parou de entregar às 15h28 e
 * ninguém soube até a reclamação, horas depois. A conexão dizia "conectada"
 * o tempo todo — o vigia que existia só olhava o estado, então não tinha o
 * que ver. O sinal honesto era o silêncio.
 *
 * Duas coisas precisam estar certas para o aviso não virar ruído ignorado:
 * madrugada e domingo não podem contar como silêncio, e o limite tem que
 * sair do movimento de cada empresa.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});
vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: {} }));

import { horasUteisEntre, limiteDeSilencio, silencioAnormal, duracaoUtil, SILENCIO_MINIMO_H, SILENCIO_MAXIMO_H } from '../shared/silencio';
import { emailDoSilencio } from './rotinas';

/** Um instante no horário de Brasília (UTC-3), escrito como se lê no relógio daqui. */
const br = (iso: string) => new Date(`${iso}-03:00`);

describe('horas de expediente', () => {
  it('dentro do mesmo dia útil, é a conta direta', () => {
    // Terça, 15h28 às 18h28 — o intervalo do caso real.
    expect(horasUteisEntre(br('2026-11-10T15:28:00'), br('2026-11-10T18:28:00'))).toBeCloseTo(3, 5);
  });

  it('a madrugada não conta — é o que impede o aviso de acordar ninguém à toa', () => {
    expect(horasUteisEntre(br('2026-11-10T02:00:00'), br('2026-11-10T05:00:00'))).toBe(0);
  });

  it('a noite emenda na manhã seguinte sem contar o que há entre as duas', () => {
    // 19h→20h de terça (1h) + 8h→9h de quarta (1h).
    expect(horasUteisEntre(br('2026-11-10T19:00:00'), br('2026-11-11T09:00:00'))).toBeCloseTo(2, 5);
  });

  it('sábado conta; domingo, não', () => {
    expect(horasUteisEntre(br('2026-11-14T08:00:00'), br('2026-11-14T20:00:00'))).toBeCloseTo(12, 5);
    expect(horasUteisEntre(br('2026-11-15T00:00:00'), br('2026-11-16T00:00:00'))).toBe(0);
  });

  it('o fim de semana inteiro não faz uma sexta à noite virar emergência', () => {
    // Sexta 19h → segunda 11h: 1h de sexta + 12h de sábado + 3h de segunda.
    expect(horasUteisEntre(br('2026-11-13T19:00:00'), br('2026-11-16T11:00:00'))).toBeCloseTo(16, 5);
  });

  it('o relógio andando para trás não vira hora negativa', () => {
    expect(horasUteisEntre(br('2026-11-10T18:00:00'), br('2026-11-10T15:00:00'))).toBe(0);
    expect(horasUteisEntre(br('2026-11-10T15:00:00'), br('2026-11-10T15:00:00'))).toBe(0);
  });

  it('silêncio antigo não trava a conta nem explode o número', () => {
    const h = horasUteisEntre(br('2019-01-01T08:00:00'), br('2026-11-10T20:00:00'));
    expect(h).toBeGreaterThan(SILENCIO_MAXIMO_H);
    expect(Number.isFinite(h)).toBe(true);
  });
});

describe('o limite de cada empresa', () => {
  it('empresa sem nenhum movimento nunca é cobrada', () => {
    expect(limiteDeSilencio(0)).toBe(Infinity);
  });

  it('empresa movimentada é cobrada rápido; a muito movimentada, no piso', () => {
    expect(limiteDeSilencio(288)).toBeCloseTo(3, 5); // 2 por hora útil → 3 h
    expect(limiteDeSilencio(1440)).toBeCloseTo(0.6, 5); // 10 por hora útil → 36 min
    expect(limiteDeSilencio(5000)).toBe(SILENCIO_MINIMO_H); // piso de 30 min
  });

  it('empresa de movimento médio ganha um limite proporcional', () => {
    expect(limiteDeSilencio(72)).toBeCloseTo(12, 5); // 1 a cada 2 horas úteis
  });

  it('empresa quase parada só é cobrada no teto', () => {
    expect(limiteDeSilencio(36)).toBeCloseTo(SILENCIO_MAXIMO_H, 5);
    expect(limiteDeSilencio(1)).toBe(SILENCIO_MAXIMO_H);
  });

  it('o limite nunca sai da faixa, por mais estranho que seja o número', () => {
    for (const n of [1, 7, 36, 72, 144, 288, 10_000]) {
      const l = limiteDeSilencio(n);
      expect(l).toBeGreaterThanOrEqual(SILENCIO_MINIMO_H);
      expect(l).toBeLessThanOrEqual(SILENCIO_MAXIMO_H);
    }
  });

  it('mais movimento nunca resulta em limite maior', () => {
    const limites = [1, 10, 36, 72, 144, 288, 1000].map((n) => limiteDeSilencio(n));
    for (let i = 1; i < limites.length; i++) expect(limites[i]).toBeLessThanOrEqual(limites[i - 1]);
  });
});

describe('o caso que motivou isto', () => {
  /**
   * A imobiliária recebeu 176 mensagens numa segunda e ZERO na terça: a
   * instância ficou conectada e surda, e ninguém soube o dia inteiro. Em 14
   * dias ela recebe ~1.400 mensagens — cerca de 10 por hora de expediente.
   */
  const limiteDela = limiteDeSilencio(1400);

  it('com o movimento dela, meia hora calada já é anormal', () => {
    expect(limiteDela).toBeLessThan(1);
    expect(limiteDela).toBeGreaterThanOrEqual(SILENCIO_MINIMO_H);
  });

  it('parou às 13h42 e por volta das 14h20 já teria avisado', () => {
    const silencio = horasUteisEntre(br('2026-11-11T13:42:00'), br('2026-11-11T14:20:00'));
    expect(silencio).toBeGreaterThanOrEqual(limiteDela);
  });

  it('e não teria avisado dez minutos depois da parada', () => {
    expect(horasUteisEntre(br('2026-11-11T13:42:00'), br('2026-11-11T13:52:00'))).toBeLessThan(limiteDela);
  });

  it('o dia perdido cabia num aviso: 3 h de atraso viraram menos de 40 min', () => {
    const antes = 3; // o piso que havia quando escrevi isto
    expect(limiteDela).toBeLessThan(antes / 4);
  });
});

describe('o aviso na tela', () => {
  const agora = br('2026-11-11T14:20:00');

  it('conexão calada além do limite dela é anormal', () => {
    const r = silencioAnormal({ ultimo_evento_em: br('2026-11-11T13:42:00').toISOString(), limite_silencio_h: 0.6 }, agora);
    expect(r).toMatchObject({ anormal: true });
    expect(r!.horas).toBeCloseTo(38 / 60, 2);
  });

  it('calada de menos não assusta ninguém', () => {
    expect(silencioAnormal({ ultimo_evento_em: br('2026-11-11T14:10:00').toISOString(), limite_silencio_h: 0.6 }, agora)!.anormal).toBe(false);
  });

  it('sem limite guardado (migração 058 ainda não rodou), a tela não inventa aviso', () => {
    expect(silencioAnormal({ ultimo_evento_em: br('2026-11-11T10:00:00').toISOString(), limite_silencio_h: null }, agora)).toBeNull();
    expect(silencioAnormal(null, agora)).toBeNull();
    expect(silencioAnormal({ ultimo_evento_em: null, limite_silencio_h: 0.6 }, agora)).toBeNull();
  });

  it('o piso vale também na tela: limite minúsculo não vira alarme a cada minuto', () => {
    const r = silencioAnormal({ ultimo_evento_em: br('2026-11-11T14:15:00').toISOString(), limite_silencio_h: 0.01 }, agora);
    expect(r!.limite).toBe(SILENCIO_MINIMO_H);
    expect(r!.anormal).toBe(false);
  });

  it('de madrugada o contador não anda, então não acorda ninguém', () => {
    const r = silencioAnormal({ ultimo_evento_em: br('2026-11-10T22:00:00').toISOString(), limite_silencio_h: 0.6 }, br('2026-11-11T03:00:00'));
    expect(r!.anormal).toBe(false);
  });

  it('o tempo é dito como gente fala', () => {
    expect(duracaoUtil(0.5)).toBe('30 min');
    expect(duracaoUtil(0)).toBe('0 min');
    expect(duracaoUtil(2.5)).toBe('2,5 h');
    expect(duracaoUtil(30)).toBe('mais de um dia');
  });
});

describe('o e-mail', () => {
  const base = { desde: br('2026-11-10T15:28:00'), horasUteis: 3.2, limite: 3, estado: 'conectada' };

  it('diz a hora em que parou e quanto tempo faz', () => {
    const { subject, html } = emailDoSilencio('Imobiliária São Severino', base);
    expect(subject).toContain('Imobiliária São Severino');
    expect(html).toContain('15:28');
    expect(html).toContain('3,2 h');
  });

  it('quando a conexão jura estar de pé, o e-mail diz que esse é o problema', () => {
    expect(emailDoSilencio('X', base).html).toMatch(/diz que está de pé/);
  });

  it('quando ela já se admite caída, o texto muda', () => {
    const html = emailDoSilencio('X', { ...base, estado: 'conectando' }).html;
    expect(html).not.toMatch(/diz que está de pé/);
    expect(html).toContain('conectando');
  });

  it('manda para a tela que resolve, não para a página inicial', () => {
    expect(emailDoSilencio('X', base).html).toContain('/whatsapp');
  });

  it('o nome da empresa é escapado — vem do cadastro, não de nós', () => {
    expect(emailDoSilencio('<script>alerta()</script>', base).html).not.toContain('<script>alerta()');
  });
});
