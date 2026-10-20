import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * O plano do Atende Aí: a regra é a mesma do Stok (situacaoDaConta), lida de
 * atende_empresas; o gating diz não com 402; sem a migração 037 nada trava;
 * o pedido de plano registra a intenção sem cobrar.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

const banco = vi.hoisted(() => ({ empresas: {} as Record<string, any>, semMigracao: false }));

vi.mock('../../lib/supabaseServer', () => ({
  supabaseServer: {
    from: (tabela: string) => {
      let id = '';
      const b: any = {
        select: () => b,
        eq: (_c: string, v: string) => ((id = v), b),
        maybeSingle: async () => {
          if (banco.semMigracao) return { data: null, error: { message: 'column atende_empresas.avaliacao_ate does not exist' } };
          if (tabela !== 'atende_empresas') return { data: null, error: null };
          return { data: banco.empresas[id] ?? null, error: null };
        },
      };
      return b;
    },
  },
}));

import { contaDaEmpresa, limparCacheDeContasAtende, negarLimiteAtende, negarRecursoAtende, empresaTem, pedirAssinatura, ErroDePlano } from './plano';
import { cabeMaisUmNoAtende, definicaoAtende, mensagemDeLimiteAtende, mensagemDeRecursoAtende, planoAtendeLibera, planoAtendeMinimoPara, precoAtende } from '../shared/planos';

const EMPRESA = '7e7e0000-0000-4000-8000-000000000001';
const DIA = 24 * 3600 * 1000;
const agora = Date.UTC(2026, 8, 19, 12);
const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => {
  limparCacheDeContasAtende();
  banco.semMigracao = false;
  banco.empresas = {};
});

describe('Atende Aí — o catálogo', () => {
  it('a avaliação libera tudo, como o Empresarial', () => {
    expect(definicaoAtende('avaliacao').id).toBe('empresarial');
    expect(planoAtendeLibera('avaliacao', 'dashboard')).toBe(true);
    expect(planoAtendeLibera('essencial', 'triagem-ia')).toBe(false);
    expect(planoAtendeLibera('profissional', 'triagem-ia')).toBe(true);
    expect(planoAtendeLibera('profissional', 'dashboard')).toBe(false);
  });

  it('limites: o Essencial cabe 3 pessoas; ilimitado é nulo', () => {
    expect(cabeMaisUmNoAtende('essencial', 'atendentes', 2)).toBe(true);
    expect(cabeMaisUmNoAtende('essencial', 'atendentes', 3)).toBe(false);
    expect(cabeMaisUmNoAtende('empresarial', 'atendentes', 500)).toBe(true);
    expect(cabeMaisUmNoAtende('avaliacao', 'times', 50)).toBe(true);
  });

  it('as frases do 402 apontam o plano mínimo', () => {
    expect(planoAtendeMinimoPara('triagem-ia')).toBe('profissional');
    expect(mensagemDeRecursoAtende('dashboard')).toBe('Dashboard está disponível a partir do plano Empresarial.');
    expect(mensagemDeLimiteAtende('essencial', 'atendentes')).toBe('O plano Essencial inclui até 3 pessoas na equipe. Para mais, o plano Profissional.');
    expect(mensagemDeLimiteAtende('essencial', 'numeros')).toBe('O plano Essencial inclui 1 número de WhatsApp. Para mais, fale com a gente.');
  });

  it('preço anual = 10 meses em 12, por mês', () => {
    expect(precoAtende('essencial', 'mensal')).toBe(99.9);
    expect(precoAtende('essencial', 'anual')).toBe(83.25);
  });
});

describe('Atende Aí — a conta da empresa', () => {
  it('empresa nova: avaliação com os dias restantes', async () => {
    banco.empresas[EMPRESA] = { plano: null, plano_ate: null, avaliacao_ate: iso(agora + 5 * DIA), cobranca: null };
    const c = await contaDaEmpresa(EMPRESA, agora);
    expect(c).toMatchObject({ situacao: 'avaliacao', plano: 'avaliacao', dias_restantes: 5 });
  });

  it('avaliação vencida: bloqueada, sem plano', async () => {
    banco.empresas[EMPRESA] = { plano: null, plano_ate: null, avaliacao_ate: iso(agora - DIA), cobranca: null };
    const c = await contaDaEmpresa(EMPRESA, agora);
    expect(c).toMatchObject({ situacao: 'bloqueada', plano: 'avaliacao', dias_restantes: 0 });
  });

  it('plano assinado vale até a data; vencido entra em carência de 2 dias; depois bloqueia', async () => {
    banco.empresas[EMPRESA] = { plano: 'profissional', plano_ate: iso(agora + 10 * DIA), avaliacao_ate: null, cobranca: 'cartao' };
    expect(await contaDaEmpresa(EMPRESA, agora)).toMatchObject({ situacao: 'assinada', plano: 'profissional', renovacao: 'automatica' });
    limparCacheDeContasAtende();
    banco.empresas[EMPRESA].plano_ate = iso(agora - DIA);
    expect(await contaDaEmpresa(EMPRESA, agora)).toMatchObject({ situacao: 'carencia', plano: 'profissional' });
    limparCacheDeContasAtende();
    banco.empresas[EMPRESA].plano_ate = iso(agora - 3 * DIA);
    expect(await contaDaEmpresa(EMPRESA, agora)).toMatchObject({ situacao: 'bloqueada', plano: 'avaliacao' });
  });

  it('sem a migração 037: avaliação sem prazo — nada trava', async () => {
    banco.semMigracao = true;
    const c = await contaDaEmpresa(EMPRESA, agora);
    expect(c).toEqual({ situacao: 'avaliacao', plano: 'avaliacao', ate: null, dias_restantes: null, renovacao: null });
    expect(await empresaTem(EMPRESA, 'triagem-ia')).toBe(true);
  });

  it('a triagem por IA só com plano que a inclua', async () => {
    banco.empresas[EMPRESA] = { plano: 'essencial', plano_ate: null, avaliacao_ate: null, cobranca: null };
    expect(await empresaTem(EMPRESA, 'triagem-ia')).toBe(false);
    expect(await empresaTem(EMPRESA, 'leads')).toBe(true);
  });

  it('a conta fica em cache por um minuto', async () => {
    banco.empresas[EMPRESA] = { plano: null, plano_ate: null, avaliacao_ate: iso(agora + 5 * DIA), cobranca: null };
    await contaDaEmpresa(EMPRESA, agora);
    banco.empresas[EMPRESA].avaliacao_ate = iso(agora - DIA);
    expect((await contaDaEmpresa(EMPRESA, agora + 30_000)).situacao).toBe('avaliacao');
    expect((await contaDaEmpresa(EMPRESA, agora + 61_000)).situacao).toBe('bloqueada');
  });
});

describe('Atende Aí — o gating', () => {
  const essencial = { situacao: 'assinada' as const, plano: 'essencial' as const, ate: null, dias_restantes: null, renovacao: null };
  const avaliacao = { situacao: 'avaliacao' as const, plano: 'avaliacao' as const, ate: null, dias_restantes: 3, renovacao: null };

  it('recurso fora do plano: 402 com o plano mínimo', () => {
    const n = negarRecursoAtende(essencial, 'supervisao');
    expect(n?.status).toBe(402);
    expect(n?.body).toEqual({ error: 'Supervisão em tempo real está disponível a partir do plano Profissional.', plano: 'essencial', plano_minimo: 'profissional' });
    expect(negarRecursoAtende(avaliacao, 'supervisao')).toBeNull();
  });

  it('limite batido: 402; abaixo dele, passa', () => {
    expect(negarLimiteAtende(essencial, 'atendentes', 2)).toBeNull();
    expect(negarLimiteAtende(essencial, 'atendentes', 3)?.body.error).toMatch(/até 3 pessoas na equipe/);
    expect(negarLimiteAtende(avaliacao, 'atendentes', 99)).toBeNull();
  });
});

describe('Atende Aí — o pedido de plano', () => {
  const sessao = { id: 1, nome: 'Ana', email: 'ana@empresa.com', papel: 'admin' as const, empresa_id: EMPRESA };

  function dbFalso(pendente: any[] = []) {
    const inseridos: any[] = [];
    const db: any = {
      inseridos,
      from: (tabela: string) => {
        const b: any = {
          _acao: 'select',
          select: () => b,
          neq: () => b,
          eq: () => b,
          is: () => b,
          order: () => b,
          limit: () => b,
          maybeSingle: async () => ({ data: pendente[0] ?? null, error: null }),
          delete: () => ((b._acao = 'delete'), b),
          insert: (linha: any) => ((b._acao = 'insert'), inseridos.push({ tabela, ...linha }), b),
          single: async () => ({ data: { ...inseridos[inseridos.length - 1], id: 'a1', created_at: 'agora' }, error: null }),
          then: (ok: any) => ok({ data: null, error: null }),
        };
        return b;
      },
    };
    return db;
  }

  it('exige plano e ciclo válidos', async () => {
    await expect(pedirAssinatura(dbFalso(), sessao, { plano: 'ouro' })).rejects.toBeInstanceOf(ErroDePlano);
    await expect(pedirAssinatura(dbFalso(), sessao, { plano: 'essencial', ciclo: 'semanal' })).rejects.toThrow('Ciclo inválido.');
  });

  it('registra a intenção com o preço do catálogo, sem cobrar', async () => {
    const db = dbFalso();
    const a = await pedirAssinatura(db, sessao, { plano: 'profissional', ciclo: 'anual' });
    expect(a).toMatchObject({ plano: 'profissional', ciclo: 'anual', valor: 166.58, status: 'pendente', payer_email: 'ana@empresa.com' });
    expect(db.inseridos[0]).toMatchObject({ tabela: 'atende_assinaturas', empresa_id: EMPRESA, pedido_por: 1 });
    expect(db.inseridos[0].mp_preapproval_id).toBeUndefined();
  });

  it('com assinatura em vigor, não aceita outro pedido por aqui', async () => {
    const db = dbFalso([{ id: 'x', plano: 'essencial', ciclo: 'mensal', valor: 99.9, status: 'autorizada', created_at: 'ontem' }]);
    await expect(pedirAssinatura(db, sessao, { plano: 'profissional' })).rejects.toThrow(/já tem uma assinatura em vigor/);
  });
});
