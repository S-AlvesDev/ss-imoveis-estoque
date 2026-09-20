import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Combos da SEVLA, do pedido ao acerto, com um banco em memória e um
 * Mercado Pago de mentira. O que se prova: no cartão nascem DUAS assinaturas
 * pela API, cada uma com o próprio valor descontado e o carimbo do combo;
 * no Pix nasce UM pagamento com o total e dois pedidos (um por produto) com
 * o mesmo id — e, quando cai, os dois planos entram; cancelado um lado, o
 * outro volta ao preço cheio no MP e aqui.
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
  process.env.SITE_URL = 'https://stokai.app';
});

const banco = vi.hoisted(() => ({ tabelas: {} as Record<string, any[]> }));

vi.mock('../../lib/supabaseServer', () => {
  let seq = 0;
  function construtor(tabela: string) {
    const filtros: Array<(l: any) => boolean> = [];
    let acao: 'select' | 'update' | 'insert' | 'delete' = 'select';
    let valores: any = null;
    let unico = false;
    let ordem: { coluna: string; asc: boolean } | null = null;
    const linhas = () => (banco.tabelas[tabela] ??= []);
    const casa = (l: any) => filtros.every((f) => f(l));
    const executar = () => {
      if (acao === 'insert') {
        const nova = { id: `${tabela}-${++seq}`, created_at: new Date().toISOString(), ...valores };
        linhas().push(nova);
        return { data: unico ? nova : [nova], error: null };
      }
      if (acao === 'update') {
        const alvo = linhas().filter(casa);
        for (const l of alvo) Object.assign(l, valores);
        return { data: unico ? (alvo[0] ?? null) : alvo, error: null };
      }
      if (acao === 'delete') {
        banco.tabelas[tabela] = linhas().filter((l) => !casa(l));
        return { data: null, error: null };
      }
      let achadas = linhas().filter(casa);
      if (ordem) achadas = [...achadas].sort((a, b) => (a[ordem!.coluna] < b[ordem!.coluna] ? -1 : 1) * (ordem!.asc ? 1 : -1));
      return { data: unico ? (achadas[0] ?? null) : achadas, error: null };
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), b),
      neq: (c: string, v: any) => (filtros.push((l) => l[c] !== v), b),
      is: (c: string, v: any) => (filtros.push((l) => (l[c] ?? null) === v), b),
      in: (c: string, vs: any[]) => (filtros.push((l) => vs.includes(l[c])), b),
      not: (c: string, op: string, v: any) => (filtros.push((l) => !(op === 'is' && (l[c] ?? null) === v)), b),
      gte: () => b,
      order: (c: string, o: any) => ((ordem = { coluna: c, asc: o?.ascending !== false }), b),
      limit: () => b,
      maybeSingle: () => ((unico = true), b),
      single: () => ((unico = true), b),
      update: (v: any) => ((acao = 'update'), (valores = v), b),
      insert: (v: any) => ((acao = 'insert'), (valores = v), b),
      delete: () => ((acao = 'delete'), b),
      then: (ok: (r: any) => any, falha?: (e: any) => any) => Promise.resolve(executar()).then(ok, falha),
    };
    return b;
  }
  return { supabaseServer: { from: construtor } };
});

const mp = vi.hoisted(() => ({ preapprovals: {} as Record<string, any>, pagamentos: {} as Record<string, any>, cancelados: [] as string[], valores: [] as Array<{ id: string; valor: number; reason: string }> }));

vi.mock('../mercadopago', () => ({
  mpConfigurado: () => true,
  mpPlanId: () => null,
  planoDeTeste: () => null,
  modoTeste: () => false,
  siteUrlDoMp: () => 'https://stokai.app',
  urlDoCheckoutDoPlano: (id: string) => `https://mp.test/plano/${id}`,
  motivo: (plano: string, ciclo: string) => `Stok Aí — ${plano[0].toUpperCase()}${plano.slice(1)} (${ciclo})`,
  criarAssinaturaSemPlano: async (args: any) => {
    const id = `pre-stok-${Object.keys(mp.preapprovals).length}`;
    mp.preapprovals[id] = { id, status: 'pending', init_point: `https://mp.test/checkout/${id}`, reason: args.motivo, external_reference: args.organizationId, auto_recurring: { transaction_amount: args.valor, frequency: 1 } };
    return mp.preapprovals[id];
  },
  criarPreapproval: async (corpo: any) => {
    const id = `pre-atende-${Object.keys(mp.preapprovals).length}`;
    mp.preapprovals[id] = { id, status: 'pending', init_point: `https://mp.test/checkout/${id}`, ...corpo };
    return mp.preapprovals[id];
  },
  buscarAssinatura: async (id: string) => mp.preapprovals[id],
  cancelarAssinatura: async (id: string) => {
    mp.cancelados.push(id);
    return { ...mp.preapprovals[id], status: 'cancelled' };
  },
  atualizarValor: async (id: string, valor: number, reason: string) => {
    mp.valores.push({ id, valor, reason });
    return { ...mp.preapprovals[id], auto_recurring: { transaction_amount: valor } };
  },
  buscarPagamento: async (id: string) => mp.pagamentos[id],
  criarPagamentoAvulso: async (args: any) => {
    const pay = { id: String(1000 + Object.keys(mp.pagamentos).length), status: 'pending', external_reference: args.referencia, transaction_amount: args.valor, description: args.descricao, date_of_expiration: args.venceEm.toISOString(), point_of_interaction: { transaction_data: { qr_code: 'PIXCOPIA', qr_code_base64: 'QUJD', ticket_url: 'https://mp.test/pix' } } };
    mp.pagamentos[pay.id] = pay;
    return pay;
  },
  dadosParaPagar: (p: any) => ({ qr_code: p.point_of_interaction?.transaction_data?.qr_code ?? null, qr_code_base64: p.point_of_interaction?.transaction_data?.qr_code_base64 ?? null, ticket_url: p.point_of_interaction?.transaction_data?.ticket_url ?? null, linha_digitavel: null }),
  ErroDoMercadoPago: class extends Error {},
  mensagemParaOPagador: (e: any) => e.message,
}));

const ORG = '5e7e0000-0000-4000-8000-000000000001';
const EMPRESA = '7e7e0000-0000-4000-8000-000000000001';

vi.mock('../../atende/server/tenant', async (orig) => {
  const real: any = await orig();
  const { supabaseServer } = await import('../../lib/supabaseServer');
  return {
    ...real,
    dbDaEmpresa: () => ({
      from: (tabela: string) => {
        const b = supabaseServer.from(tabela) as any;
        if (tabela !== 'atende_empresas') b.eq('empresa_id', EMPRESA);
        const insert = b.insert;
        b.insert = (v: any) => insert({ empresa_id: EMPRESA, ...v });
        return b;
      },
    }),
  };
});

vi.mock('./identidade', async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    acessosDaConta: async () => [
      { produto: 'stok', organization_id: ORG, organizacao: 'Empresa', usuario_id: 1, papel: 'CEO', nome: 'Ana', matricula: null, empresa_id: null },
      { produto: 'atende', organization_id: ORG, organizacao: 'Empresa', usuario_id: 7, papel: 'admin', nome: 'Ana', matricula: null, empresa_id: EMPRESA },
    ],
  };
});

import { assinarCombo, tratarEventoDoCombo, acertarCombo, conferirCombo, comboPendente } from './combos';
import { limparCacheDeContasAtende } from '../../atende/server/plano';
import { avulsoPendente } from '../assinaturas';

const conta = { id: 'c1', email: 'ana@empresa.com', nome: 'Ana' };
const pagador = { nome: 'Ana Souza', doc: '529.982.247-25', email: 'ana@empresa.com' };

beforeEach(() => {
  limparCacheDeContasAtende();
  banco.tabelas = {
    organizations: [{ id: ORG, nome: 'Empresa', plano: null, plano_desde: null, plano_ate: null, avaliacao_ate: '2026-09-26T00:00:00.000Z' }],
    assinaturas: [],
    pagamentos: [],
    atende_empresas: [{ id: EMPRESA, organization_id: ORG, nome: 'Empresa', plano: null, plano_desde: null, plano_ate: null, avaliacao_ate: '2026-09-26T00:00:00.000Z', cobranca: null }],
    atende_assinaturas: [],
    atende_pagamentos: [],
    atende_usuarios: [],
  };
  mp.preapprovals = {};
  mp.pagamentos = {};
  mp.cancelados = [];
  mp.valores = [];
});

describe('assinar o combo com cartão', () => {
  it('cria duas assinaturas pela API, cada uma com o valor descontado e o carimbo do combo', async () => {
    const r = await assinarCombo(conta, { organization_id: ORG, combo: 'profissional', ciclo: 'mensal', metodo: 'cartao' });
    expect(r.metodo).toBe('cartao');
    if (r.metodo !== 'cartao') return;
    expect(r.checkouts.map((c) => c.produto)).toEqual(['stok', 'atende']);
    expect(r.checkouts[0].url).toMatch(/pre-stok/);
    expect(r.checkouts[1].url).toMatch(/pre-atende/);

    const doStok = mp.preapprovals['pre-stok-0'];
    expect(doStok.auto_recurring.transaction_amount).toBe(379.9);
    expect(doStok.reason).toBe('Stok Aí — Profissional (mensal) · combo SEVLA');
    const doAtende = mp.preapprovals['pre-atende-1'];
    expect(doAtende.auto_recurring.transaction_amount).toBe(569.9);
    expect(doAtende.reason).toBe('Atende Aí — Profissional (mensal) · combo SEVLA');
    expect(doAtende.external_reference).toBe(`atende:${EMPRESA}`);

    expect(banco.tabelas.assinaturas).toHaveLength(1);
    expect(banco.tabelas.assinaturas[0]).toMatchObject({ plano: 'profissional', valor: 379.9, combo: 'profissional', status: 'pendente', mp_preapproval_id: 'pre-stok-0' });
    expect(banco.tabelas.atende_assinaturas).toHaveLength(1);
    expect(banco.tabelas.atende_assinaturas[0]).toMatchObject({ plano: 'profissional', valor: 569.9, combo: 'profissional', status: 'pendente', mp_preapproval_id: 'pre-atende-1' });
  });

  it('recusa quem não manda nos dois produtos, combo inválido e ciclo inválido', async () => {
    await expect(assinarCombo(conta, { organization_id: ORG, combo: 'misto', metodo: 'cartao' })).rejects.toMatchObject({ status: 400 });
    await expect(assinarCombo(conta, { organization_id: ORG, combo: 'essencial', ciclo: 'semanal', metodo: 'cartao' })).rejects.toMatchObject({ status: 400 });
    await expect(assinarCombo(conta, { organization_id: 'outra-org', combo: 'essencial', metodo: 'cartao' })).rejects.toMatchObject({ status: 403 });
  });
});

describe('assinar o combo com Pix', () => {
  it('é um pagamento só com o total; cada produto guarda a própria parte com o mesmo id', async () => {
    const r = await assinarCombo(conta, { organization_id: ORG, combo: 'profissional', ciclo: 'mensal', metodo: 'pix', pagador });
    if (r.metodo !== 'pix') throw new Error('esperava pix');
    expect(r.pagamento.valor).toBe(949.8);
    expect(r.pagamento.id).toBe('1000');
    expect(r.pagamento.dados?.qr_code).toBe('PIXCOPIA');
    expect(r.pagamento.stok.valor).toBe(379.9);
    expect(r.pagamento.atende.valor).toBe(569.9);

    const pay = mp.pagamentos['1000'];
    expect(pay.transaction_amount).toBe(949.8);
    expect(pay.description).toBe('SEVLA — Combo Profissional: Stok Aí + Atende Aí (mensal)');
    expect(pay.external_reference).toMatch(/^sevla-combo:pagamentos-\d+:atende_pagamentos-\d+$/);

    expect(banco.tabelas.pagamentos[0]).toMatchObject({ mp_payment_id: '1000', valor: 379.9, combo: 'profissional', status: 'pendente', plano: 'profissional' });
    expect(banco.tabelas.pagamentos[0].descricao).toContain('o Pix é um só');
    expect(banco.tabelas.atende_pagamentos[0]).toMatchObject({ mp_payment_id: '1000', valor: 569.9, combo: 'profissional', status: 'pendente', empresa_id: EMPRESA });

    // A tela da SEVLA acha o pendente pelo pedido do Stok e junta a parte do Atende.
    const pendente = await comboPendente(await avulsoPendente(ORG), EMPRESA);
    expect(pendente?.id).toBe('1000');
    expect(pendente?.valor).toBe(949.8);
  });

  it('quando o Pix cai (webhook), os dois planos entram e os dois pedidos ficam aprovados', async () => {
    await assinarCombo(conta, { organization_id: ORG, combo: 'essencial', ciclo: 'mensal', metodo: 'pix', pagador });
    mp.pagamentos['1000'].status = 'approved';
    mp.pagamentos['1000'].date_approved = '2026-09-20T12:00:00.000Z';

    // Um pagamento que não é de combo não é nosso.
    mp.pagamentos['outro'] = { id: 'outro', status: 'approved', external_reference: 'avulso:xyz' };
    expect(await tratarEventoDoCombo('payment', 'outro')).toBeNull();
    expect(await tratarEventoDoCombo('subscription_preapproval', '1000')).toBeNull();

    const r = await tratarEventoDoCombo('payment', '1000');
    expect(r?.casou).toBe(true);
    expect(r?.organizationId).toBe(ORG);
    expect(r?.pagamento?.status).toBe('aprovado');
    expect(banco.tabelas.organizations[0]).toMatchObject({ plano: 'essencial', cobranca: 'avulso' });
    expect(banco.tabelas.organizations[0].plano_ate).toBeTruthy();
    expect(banco.tabelas.atende_empresas[0]).toMatchObject({ plano: 'essencial', cobranca: 'avulso' });
    expect(banco.tabelas.pagamentos[0].status).toBe('aprovado');
    expect(banco.tabelas.atende_pagamentos[0].status).toBe('aprovado');
  });

  it('a tela consulta o combo pelo id do pagamento e aplica sem depender do webhook', async () => {
    await assinarCombo(conta, { organization_id: ORG, combo: 'profissional', ciclo: 'anual', metodo: 'pix', pagador });
    expect((await conferirCombo(conta, ORG, '1000'))?.status).toBe('pendente');
    mp.pagamentos['1000'].status = 'approved';
    const c = await conferirCombo(conta, ORG, '1000');
    expect(c?.status).toBe('aprovado');
    expect(c?.valor).toBe(9498.1);
    expect(banco.tabelas.organizations[0].plano).toBe('profissional');
    expect(banco.tabelas.atende_empresas[0].plano).toBe('profissional');
    expect(await conferirCombo(conta, ORG, '999')).toBeNull();
    await expect(conferirCombo(conta, ORG, 'abc')).rejects.toMatchObject({ status: 400 });
  });
});

describe('acertar o combo', () => {
  it('cancelado o Atende, o Stok volta ao preço cheio no MP e aqui; nada muda quando os dois estão em vigor', async () => {
    banco.tabelas.assinaturas = [{ id: 's1', organization_id: ORG, plano: 'profissional', ciclo: 'mensal', valor: 379.9, status: 'autorizada', combo: 'profissional', mp_preapproval_id: 'pre-s', created_at: '2026-09-01T00:00:00Z' }];
    banco.tabelas.atende_assinaturas = [{ id: 'a1', empresa_id: EMPRESA, plano: 'profissional', ciclo: 'mensal', valor: 569.9, status: 'autorizada', combo: 'profissional', mp_preapproval_id: 'pre-a', created_at: '2026-09-01T00:00:00Z' }];
    expect(await acertarCombo(ORG)).toEqual({ desfeitos: [] });
    expect(mp.valores).toEqual([]);

    banco.tabelas.atende_assinaturas[0].status = 'cancelada';
    expect(await acertarCombo(ORG)).toEqual({ desfeitos: ['stok'] });
    expect(mp.valores).toEqual([{ id: 'pre-s', valor: 399.9, reason: 'Stok Aí — Profissional (mensal)' }]);
    expect(banco.tabelas.assinaturas[0]).toMatchObject({ valor: 399.9, combo: null });
    // De novo: nada a fazer (idempotente).
    expect(await acertarCombo(ORG)).toEqual({ desfeitos: [] });
  });

  it('cancelado o Stok, o Atende volta ao preço cheio (o do período no MP, o por mês na linha)', async () => {
    banco.tabelas.assinaturas = [{ id: 's1', organization_id: ORG, plano: 'profissional', ciclo: 'anual', valor: 3799.05, status: 'cancelada', combo: 'profissional', mp_preapproval_id: 'pre-s', created_at: '2026-09-01T00:00:00Z' }];
    banco.tabelas.atende_assinaturas = [{ id: 'a1', empresa_id: EMPRESA, plano: 'profissional', ciclo: 'anual', valor: 474.92, status: 'autorizada', combo: 'profissional', mp_preapproval_id: 'pre-a', created_at: '2026-09-01T00:00:00Z' }];
    expect(await acertarCombo(ORG)).toEqual({ desfeitos: ['atende'] });
    expect(mp.valores).toEqual([{ id: 'pre-a', valor: 5999, reason: 'Atende Aí — Profissional (anual)' }]);
    expect(banco.tabelas.atende_assinaturas[0]).toMatchObject({ valor: 499.92, combo: null });
  });
});
