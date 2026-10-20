import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Disparo em massa — a parte que não pode errar: a mesma pessoa nunca recebe
 * a mensagem duas vezes. A tela chama "processar" a cada 5 s, o cron varre
 * lotes abandonados e nada impede duas abas abertas; os três podem cair em
 * cima da mesma fila ao mesmo tempo.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

/**
 * Banco em memória com a parte que importa aqui: um UPDATE filtrado por
 * `status = 'pendente'` só pega as linhas que ainda estão nesse estado e
 * devolve as que mudou — é assim que o Postgres serializa duas escritas
 * concorrentes na mesma linha, e é disso que a reivindicação depende.
 */
const banco = vi.hoisted(() => ({ itens: [] as any[], lotes: [] as any[] }));

vi.mock('../../lib/supabaseServer', () => {
  function construtor(tabela: string) {
    const filtros: Array<(l: any) => boolean> = [];
    let acao: 'select' | 'update' = 'select';
    let valores: any = null;
    let limite = Infinity;
    const linhas = () => (tabela === 'atende_disparos_item' ? banco.itens : banco.lotes);
    const executar = () => {
      const casa = (l: any) => filtros.every((f) => f(l));
      if (acao === 'update') {
        const alvo = linhas().filter(casa);
        for (const l of alvo) Object.assign(l, valores);
        return { data: alvo, error: null, count: alvo.length };
      }
      const achadas = linhas().filter(casa).slice(0, limite);
      return { data: achadas, error: null, count: linhas().filter(casa).length };
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), b),
      lte: (c: string, v: any) => (filtros.push((l) => l[c] <= v), b),
      in: (c: string, v: any[]) => (filtros.push((l) => v.includes(l[c])), b),
      order: () => b,
      limit: (n: number) => ((limite = n), b),
      update: (v: any) => ((acao = 'update'), (valores = v), b),
      single: () => b,
      maybeSingle: () => b,
      then: (ok: (r: any) => any, falha?: (e: any) => any) => Promise.resolve(executar()).then(ok, falha),
    };
    return b;
  }
  return { supabaseServer: { from: construtor } };
});

/** Cada envio demora um pouco — é essa janela que a chamada seguinte invadia. */
const enviados: string[] = [];
vi.mock('./conversas', () => ({
  ErroDeConversa: class extends Error {},
  primeiroNomeApresentavel: (n: string) => n,
  enviarMensagem: async (_req: any, _conversaId: string, envio: any) => {
    await new Promise((r) => setTimeout(r, 20));
    enviados.push(envio.texto);
    return { status: 'enviada' };
  },
}));

import { processarLote } from './disparos';

const LOTE = 'lote-1';

/** O lote e a conversa de cada cliente: o `db` do tenant só é usado para isso. */
const req: any = {
  dbAtende: {
    from: (tabela: string) => {
      const b: any = {
        select: () => b,
        update: () => b,
        eq: () => b,
        single: async () => ({ data: banco.lotes[0], error: null }),
        maybeSingle: async () => ({ data: tabela === 'atende_conversas' ? { id: 'conv-1' } : banco.lotes[0], error: null }),
      };
      return b;
    },
  },
  sessao: { id: 1, nome: 'Ana', email: 'ana@x.com', papel: 'admin', empresa_id: 'e1' },
};

beforeEach(() => {
  enviados.length = 0;
  const ontem = new Date(Date.now() - 60_000).toISOString();
  banco.lotes = [{ id: LOTE, status: 'enviando', enviados: 0, erros: 0, total: 3 }];
  banco.itens = [1, 2, 3].map((n) => ({ id: `i${n}`, lote_id: LOTE, cliente_id: `c${n}`, mensagem_final: `Oi ${n}`, status: 'pendente', enviar_apos: ontem, enviado_em: null }));
});

describe('disparo em massa — ninguém recebe a mesma mensagem duas vezes', () => {
  it('dois processamentos ao mesmo tempo (a aba e o cron) enviam cada item uma vez só', async () => {
    // O cenário real: a tela chama a cada 5 s, o envio demora mais que isso, e
    // a chamada seguinte entra enquanto a primeira ainda está mandando.
    await Promise.all([processarLote(req, LOTE), processarLote(req, LOTE)]);
    expect(enviados.sort()).toEqual(['Oi 1', 'Oi 2', 'Oi 3']);
    expect(new Set(enviados).size).toBe(enviados.length);
    expect(banco.itens.every((i) => i.status === 'enviado')).toBe(true);
  });

  it('três ao mesmo tempo continuam somando três envios, não nove', async () => {
    await Promise.all([processarLote(req, LOTE), processarLote(req, LOTE), processarLote(req, LOTE)]);
    expect(enviados).toHaveLength(3);
  });

  it('item já enviado não volta a ser pego', async () => {
    banco.itens[0].status = 'enviado';
    await processarLote(req, LOTE);
    expect(enviados.sort()).toEqual(['Oi 2', 'Oi 3']);
  });

  it('o que ainda não venceu espera a vez — o ritmo entre mensagens é da fila', async () => {
    banco.itens[2].enviar_apos = new Date(Date.now() + 60_000).toISOString();
    await processarLote(req, LOTE);
    expect(enviados.sort()).toEqual(['Oi 1', 'Oi 2']);
    expect(banco.itens[2].status).toBe('pendente');
  });
});
