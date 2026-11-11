import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `ultimo_evento_em`: "última vez que algo chegou por aqui".
 *
 * O painel dizia isso e mostrava um campo que só andava no CONNECTION_UPDATE
 * — ou seja, ignorava justamente o que mais chega, que é mensagem. Uma
 * instância entregando o dia inteiro parecia muda, e uma que tinha parado de
 * entregar parecia viva enquanto mandasse um ping de conexão. Foi por isso
 * que o silêncio de horas de um cliente passou despercebido.
 *
 * Agora qualquer evento carimba. O que importa não é o conteúdo do evento —
 * é a prova de que a Evolution ainda está falando conosco.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

const banco = vi.hoisted(() => ({
  conexoes: [] as any[],
  mensagens: [] as any[],
  /** Quando a migração 057 ainda não rodou, o UPDATE com a coluna nova falha. */
  temColunaDeAviso: true,
  /** Quantas vezes atende_conexoes foi gravada — é como se vê o carimbo acontecer. */
  updatesEmConexoes: 0,
  /** O banco fora do ar na hora de carimbar. */
  quebrarUpdate: false,
}));

vi.mock('../../lib/supabaseServer', () => {
  function construtor(tabela: string) {
    const filtros: Array<(l: any) => boolean> = [];
    let acao: 'select' | 'update' | 'insert' = 'select';
    let valores: any = null;
    const linhas = () => (tabela === 'atende_conexoes' ? banco.conexoes : banco.mensagens);
    const executar = () => {
      const casa = (l: any) => filtros.every((f) => f(l));
      if (acao === 'insert') return { data: valores, error: null };
      if (acao === 'update') {
        if (tabela === 'atende_conexoes') {
          banco.updatesEmConexoes++;
          if (banco.quebrarUpdate) throw new Error('banco fora do ar');
        }
        if (!banco.temColunaDeAviso && valores && 'aviso_silencio_em' in valores) {
          return { data: null, error: { message: `column "aviso_silencio_em" of relation "${tabela}" does not exist` } };
        }
        const alvo = linhas().filter(casa);
        for (const l of alvo) Object.assign(l, valores);
        return { data: alvo, error: null };
      }
      const achadas = linhas().filter(casa);
      return { data: achadas[0] ?? null, error: null };
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), b),
      in: (c: string, v: any[]) => (filtros.push((l) => v.includes(l[c])), b),
      order: () => b,
      limit: () => b,
      update: (v: any) => ((acao = 'update'), (valores = v), b),
      insert: (v: any) => ((acao = 'insert'), (valores = v), b),
      single: () => b,
      maybeSingle: () => b,
      then: (ok: (r: any) => any, falha?: (e: any) => any) => Promise.resolve(executar()).then(ok, falha),
    };
    return b;
  }
  return { supabaseServer: { from: construtor } };
});

import { processarWebhook } from './whatsapp';

const INSTANCIA = 'atende-7e7e000000004000';
const ONTEM = '2026-11-09T18:28:00.000Z';

beforeEach(() => {
  banco.temColunaDeAviso = true;
  banco.quebrarUpdate = false;
  banco.updatesEmConexoes = 0;
  banco.mensagens = [];
  banco.conexoes = [{ id: 'con-1', empresa_id: 'emp-1', instancia: INSTANCIA, estado: 'conectada', ultimo_evento_em: ONTEM, aviso_silencio_em: '2026-11-10T09:00:00.000Z' }];
});

const conexao = () => banco.conexoes[0];

describe('o carimbo de "a Evolution falou conosco"', () => {
  it('um status de entrega carimba, mesmo não mudando mais nada', async () => {
    // A mensagem citada nem existe no banco: aplicarStatus não faz nada com ela.
    await processarWebhook({ event: 'messages.update', instance: INSTANCIA, data: { key: { id: 'ABC' }, update: { status: 'DELIVERY_ACK' } } });
    expect(conexao().ultimo_evento_em).not.toBe(ONTEM);
    expect(Date.parse(conexao().ultimo_evento_em)).toBeGreaterThan(Date.parse(ONTEM));
  });

  it('o aviso de silêncio se apaga sozinho: chegou evento, o problema passou', async () => {
    await processarWebhook({ event: 'messages.update', instance: INSTANCIA, data: { key: { id: 'ABC' }, update: { status: 'READ' } } });
    expect(conexao().aviso_silencio_em).toBeNull();
  });

  it('vários eventos no mesmo corpo carimbam uma vez só — não uma gravação por evento', async () => {
    const antes = conexao().ultimo_evento_em;
    await processarWebhook({
      event: 'messages.update',
      instance: INSTANCIA,
      data: [
        { key: { id: 'A' }, update: { status: 'DELIVERY_ACK' } },
        { key: { id: 'B' }, update: { status: 'READ' } },
        { key: { id: 'C' }, update: { status: 'DELIVERY_ACK' } },
      ],
    });
    expect(banco.updatesEmConexoes).toBe(1);
    expect(Date.parse(conexao().ultimo_evento_em)).toBeGreaterThan(Date.parse(antes));
  });

  it('instância desconhecida não carimba conexão nenhuma', async () => {
    await processarWebhook({ event: 'messages.update', instance: 'atende-outra-empresa', data: { key: { id: 'A' }, update: { status: 'READ' } } });
    expect(conexao().ultimo_evento_em).toBe(ONTEM);
  });

  it('corpo sem evento aproveitável não carimba nada', async () => {
    await processarWebhook({ event: 'contacts.update', instance: INSTANCIA, data: {} });
    expect(conexao().ultimo_evento_em).toBe(ONTEM);
  });

  it('sem a migração 057, ainda assim carimba a hora — só não limpa o aviso', async () => {
    banco.temColunaDeAviso = false;
    await processarWebhook({ event: 'messages.update', instance: INSTANCIA, data: { key: { id: 'A' }, update: { status: 'READ' } } });
    expect(Date.parse(conexao().ultimo_evento_em)).toBeGreaterThan(Date.parse(ONTEM));
    expect(banco.updatesEmConexoes).toBe(2); // a tentativa com a coluna, e a sem
  });

  it('o banco fora do ar na hora de carimbar não derruba o webhook', async () => {
    banco.quebrarUpdate = true;
    const r = await processarWebhook({ event: 'messages.update', instance: INSTANCIA, data: { key: { id: 'A' }, update: { status: 'READ' } } });
    expect(r.eventos).toBe(1);
    expect(banco.updatesEmConexoes).toBe(1); // tentou
  });
});
