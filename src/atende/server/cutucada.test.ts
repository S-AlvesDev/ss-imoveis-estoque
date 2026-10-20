import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * "Olha essa conversa": supervisor ou admin faz a tela do atendente tocar,
 * para o caso de o cliente ter respondido e ninguém ter visto.
 *
 * O chamado é gravado como evento e pega carona no `delta` (a tela já
 * pergunta de 4 em 4 segundos), então o que importa aqui é: só chama quem
 * tem alguém para chamar, não vira martelo, e só chega a quem é destinado.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

const banco = vi.hoisted(() => ({ conversas: [] as any[], eventos: [] as any[], recenteDaConversa: null as any }));
const push = vi.hoisted(() => ({ avisos: [] as any[] }));

vi.mock('../../lib/supabaseServer', () => ({ supabaseServer: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } }));
vi.mock('./push', () => ({ avisarSobreConversa: async (empresaId: string, c: any, carga: any) => { push.avisos.push({ empresaId, conversa: c.id, para: c.atendente_id, ...carga }); } }));

import { cutucar, ErroDeConversa, CUTUCADA_INTERVALO_MS } from './conversas';

const CONVERSA = 'c1111111-1111-4111-8111-111111111111';

const TIME = 't1111111-1111-4111-8111-111111111111';

/**
 * O `db` do tenant. Precisa devolver também a lista de times da pessoa: é
 * dela que sai a visão, e sem ela nem um supervisor enxerga a conversa.
 */
function reqDe(sessao: { id: number; nome: string; papel: string }, conversa: any) {
  return {
    sessao: { ...sessao, email: 'x@y.com', empresa_id: 'e1' },
    dbAtende: {
      from: (tabela: string) => {
        const resultado = () => {
          if (tabela === 'atende_time_membros') return { data: [{ time_id: TIME, supervisiona: true }], error: null };
          if (tabela === 'atende_eventos') return { data: banco.recenteDaConversa, error: null };
          return { data: conversa, error: null };
        };
        const b: any = {
          select: () => b,
          eq: () => b,
          gte: () => b,
          limit: () => b,
          maybeSingle: async () => resultado(),
          single: async () => resultado(),
          insert: async (v: any) => (banco.eventos.push(v), { data: [v], error: null }),
          then: (ok: (r: any) => any, falha?: (e: any) => any) => Promise.resolve(resultado()).then(ok, falha),
        };
        return b;
      },
    },
  } as any;
}

const conversaCom = (extra: Record<string, unknown> = {}) => ({ id: CONVERSA, atendente_id: 7, time_id: TIME, estado: 'em_atendimento', cliente: { nome: 'Dona Maria', telefone: '5584999' }, ...extra });

beforeEach(() => {
  banco.eventos = [];
  banco.recenteDaConversa = null;
  push.avisos = [];
});

describe('chamar a atenção de quem está com a conversa', () => {
  const supervisora = { id: 2, nome: 'Ana', papel: 'supervisor' };

  it('grava o chamado para o atendente da conversa, com quem chamou', async () => {
    const r = await cutucar(reqDe(supervisora, conversaCom()), CONVERSA);
    expect(r).toEqual({ para: 7 });
    expect(banco.eventos[0]).toMatchObject({ conversa_id: CONVERSA, usuario_id: 2, tipo: 'cutucada' });
    expect(banco.eventos[0].dados).toMatchObject({ para: 7, de_nome: 'Ana', texto: null });
  });

  it('o recado vai junto quando existe, cortado no tamanho', async () => {
    await cutucar(reqDe(supervisora, conversaCom()), CONVERSA, '  O cliente está esperando desde cedo  ');
    expect(banco.eventos[0].dados.texto).toBe('O cliente está esperando desde cedo');
    banco.eventos = [];
    await cutucar(reqDe(supervisora, conversaCom()), CONVERSA, 'x'.repeat(500));
    expect(banco.eventos[0].dados.texto).toHaveLength(200);
  });

  it('também vai por push, para alcançar quem está com o celular no bolso', async () => {
    await cutucar(reqDe(supervisora, conversaCom()), CONVERSA);
    expect(push.avisos[0]).toMatchObject({ conversa: CONVERSA, para: 7, titulo: 'Ana chamou você' });
    expect(push.avisos[0].corpo).toContain('Dona Maria');
  });

  it('conversa sem ninguém não dá para chamar — transfira ou atribua antes', async () => {
    await expect(cutucar(reqDe(supervisora, conversaCom({ atendente_id: null, estado: 'na_fila' })), CONVERSA)).rejects.toThrow(/não está com ninguém/);
    expect(banco.eventos).toHaveLength(0);
  });

  it('chamar a si mesmo não faz sentido', async () => {
    await expect(cutucar(reqDe({ id: 7, nome: 'Eu', papel: 'supervisor' }, conversaCom({ atendente_id: 7 })), CONVERSA)).rejects.toThrow(/já é sua/);
    expect(push.avisos).toHaveLength(0);
  });

  it('chamar de novo na mesma conversa, logo em seguida, é recusado — é chamado, não martelo', async () => {
    banco.recenteDaConversa = { id: 'ev-anterior' };
    const erro = await cutucar(reqDe(supervisora, conversaCom()), CONVERSA).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDeConversa);
    expect(erro.status).toBe(429);
    expect(banco.eventos).toHaveLength(0);
    expect(CUTUCADA_INTERVALO_MS).toBeGreaterThan(0);
  });
});
