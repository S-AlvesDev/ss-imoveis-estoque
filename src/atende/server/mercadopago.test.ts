import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * O Atende Aí no Mercado Pago: o carimbo `atende:<empresa>` separa os eventos
 * dos do Stok; a assinatura autorizada vira plano na empresa; cancelada não
 * mexe no plano; evento que não é nosso devolve nulo (segue para o Stok).
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
  process.env.SITE_URL = 'https://stokai.app';
});

// Banco em memória: tabelas → linhas; filtros eq/neq/is; update/insert devolvem as linhas.
const banco = vi.hoisted(() => ({ tabelas: {} as Record<string, any[]> }));

vi.mock('../../lib/supabaseServer', () => {
  let seq = 0;
  function construtor(tabela: string) {
    const filtros: Array<(l: any) => boolean> = [];
    let acao: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select';
    let valores: any = null;
    let unico = false;
    const linhas = () => (banco.tabelas[tabela] ??= []);
    const casa = (l: any) => filtros.every((f) => f(l));
    const executar = () => {
      if (acao === 'insert') {
        const nova = { id: `l${++seq}`, created_at: 'agora', ...valores };
        linhas().push(nova);
        return { data: unico ? nova : [nova], error: null };
      }
      if (acao === 'upsert') {
        const chave = 'mp_authorized_payment_id';
        const existente = linhas().find((l) => l[chave] && l[chave] === valores[chave]);
        if (existente) Object.assign(existente, valores);
        const linha = existente ?? { id: `l${++seq}`, created_at: 'agora', ...valores };
        if (!existente) linhas().push(linha);
        return { data: unico ? linha : [linha], error: null };
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
      const achadas = linhas().filter(casa);
      return { data: unico ? (achadas[0] ?? null) : achadas, error: null };
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), b),
      neq: (c: string, v: any) => (filtros.push((l) => l[c] !== v), b),
      is: (c: string, v: any) => (filtros.push((l) => (l[c] ?? null) === v), b),
      order: () => b,
      limit: () => b,
      maybeSingle: () => ((unico = true), b),
      single: () => ((unico = true), b),
      update: (v: any) => ((acao = 'update'), (valores = v), b),
      insert: (v: any) => ((acao = 'insert'), (valores = v), b),
      upsert: (v: any) => ((acao = 'upsert'), (valores = v), b),
      or: () => b,
      gt: () => b,
      not: () => b,
      delete: () => ((acao = 'delete'), b),
      then: (ok: (r: any) => any, falha?: (e: any) => any) => Promise.resolve(executar()).then(ok, falha),
    };
    return b;
  }
  return { supabaseServer: { from: construtor } };
});

const mp = vi.hoisted(() => ({ preapprovals: {} as Record<string, any>, autorizados: {} as Record<string, any>, cancelados: [] as string[], criados: [] as any[] }));

vi.mock('../../server/mercadopago', () => ({
  mpConfigurado: () => true,
  siteUrlDoMp: () => 'https://stokai.app',
  criarPreapproval: async (corpo: any) => {
    mp.criados.push(corpo);
    return { id: 'pre-novo', status: 'pending', init_point: 'https://mp.test/checkout/pre-novo', ...corpo };
  },
  buscarAssinatura: async (id: string) => {
    if (!mp.preapprovals[id]) throw new Error(`preapproval ${id} não existe`);
    return mp.preapprovals[id];
  },
  cancelarAssinatura: async (id: string) => {
    mp.cancelados.push(id);
    return { ...mp.preapprovals[id], status: 'cancelled' };
  },
  buscarPagamentoAutorizado: async (id: string) => mp.autorizados[id],
  procurarAssinaturasRecentes: async () => Object.values(mp.preapprovals),
}));

import { referenciaDe, empresaDaReferencia, motivoAtende, planoDoMotivo, corpoDaAssinaturaAtende, traduzirStatus, planoAteDe, aplicarPreapprovalAtende, tratarEventoDoAtende, iniciarAssinaturaAtende, sincronizarAtende } from './mercadopago';
import { limparCacheDeContasAtende, contaDaEmpresa } from './plano';
import { supabaseServer } from '../../lib/supabaseServer';

const EMPRESA = '7e7e0000-0000-4000-8000-000000000001';
const ORG = '5e7e0000-0000-4000-8000-000000000001';
const sessao = { id: 1, nome: 'Ana', email: 'ana@empresa.com', papel: 'admin' as const, empresa_id: EMPRESA };

/** Um db "preso à empresa" de mentira: o mesmo banco, com o filtro da empresa aplicado nas tabelas do Atende. */
function dbDaEmpresa() {
  return {
    from: (tabela: string) => {
      const b = supabaseServer.from(tabela) as any;
      if (tabela !== 'atende_empresas') b.eq('empresa_id', EMPRESA);
      const insert = b.insert;
      b.insert = (v: any) => insert({ empresa_id: EMPRESA, ...v });
      return b;
    },
  } as any;
}

beforeEach(() => {
  limparCacheDeContasAtende();
  banco.tabelas = {
    atende_empresas: [{ id: EMPRESA, organization_id: ORG, plano: null, plano_desde: null, plano_ate: null, avaliacao_ate: '2026-09-26T00:00:00.000Z', cobranca: null }],
    atende_assinaturas: [],
    atende_pagamentos: [],
    atende_usuarios: [],
  };
  mp.preapprovals = {};
  mp.autorizados = {};
  mp.cancelados = [];
  mp.criados = [];
});

describe('Atende Aí no Mercado Pago — o carimbo e o corpo', () => {
  it('a referência é "atende:<empresa>" e só ela é reconhecida', () => {
    expect(referenciaDe(EMPRESA)).toBe(`atende:${EMPRESA}`);
    expect(empresaDaReferencia(`atende:${EMPRESA}`)).toBe(EMPRESA);
    expect(empresaDaReferencia(EMPRESA)).toBeNull();
    expect(empresaDaReferencia('atende:lixo')).toBeNull();
  });

  it('motivo ida e volta', () => {
    expect(motivoAtende('profissional', 'anual')).toBe('Atende Aí — Profissional (anual)');
    expect(planoDoMotivo('Atende Aí — Profissional (anual)')).toEqual({ plano: 'profissional', ciclo: 'anual' });
    expect(planoDoMotivo('Stok Aí — Profissional (anual)')).toBeNull();
  });

  it('o corpo: mensal cobra o preço por mês; anual cobra 10 meses de uma vez, uma vez por ano', () => {
    const mensal = corpoDaAssinaturaAtende({ plano: 'essencial', ciclo: 'mensal', empresaId: EMPRESA, payerEmail: 'ana@empresa.com' });
    expect(mensal.auto_recurring).toEqual({ frequency: 1, frequency_type: 'months', transaction_amount: 299.9, currency_id: 'BRL' });
    expect(mensal.back_url).toBe('https://stokai.app/atende/plano?retorno=1');
    expect(mensal.external_reference).toBe(`atende:${EMPRESA}`);
    const anual = corpoDaAssinaturaAtende({ plano: 'essencial', ciclo: 'anual', empresaId: EMPRESA, payerEmail: 'ana@empresa.com' });
    expect(anual.auto_recurring.frequency).toBe(12);
    expect(anual.auto_recurring.transaction_amount).toBe(2999);
  });

  it('status e validade', () => {
    expect(traduzirStatus('authorized')).toBe('autorizada');
    expect(traduzirStatus('cancelled')).toBe('cancelada');
    expect(traduzirStatus(undefined)).toBe('pendente');
    expect(planoAteDe({ next_payment_date: '2026-10-19T12:00:00.000Z' }, 'mensal')).toBe('2026-10-19T12:00:00.000Z');
    expect(planoAteDe({ next_payment_date: null }, 'anual', new Date('2026-09-19T12:00:00.000Z'))).toBe('2027-09-19T12:00:00.000Z');
  });
});

describe('Atende Aí no Mercado Pago — começar', () => {
  it('cria a assinatura no MP, guarda a linha com o id e devolve o checkout', async () => {
    const r = await iniciarAssinaturaAtende(dbDaEmpresa(), sessao, { plano: 'profissional', ciclo: 'mensal' });
    expect(r.url).toBe('https://mp.test/checkout/pre-novo');
    expect(r.assinatura).toMatchObject({ plano: 'profissional', ciclo: 'mensal', valor: 599.9, status: 'pendente' });
    expect(mp.criados[0]).toMatchObject({ reason: 'Atende Aí — Profissional (mensal)', external_reference: `atende:${EMPRESA}`, payer_email: 'ana@empresa.com', status: 'pending' });
    expect(banco.tabelas.atende_assinaturas[0]).toMatchObject({ empresa_id: EMPRESA, mp_preapproval_id: 'pre-novo', pedido_por: 1 });
  });

  it('com assinatura em vigor, só com trocar — e a anterior é cancelada no MP', async () => {
    banco.tabelas.atende_assinaturas = [{ id: 'a1', empresa_id: EMPRESA, plano: 'essencial', ciclo: 'mensal', valor: 299.9, status: 'autorizada', mp_preapproval_id: 'pre-velho', created_at: 'ontem' }];
    await expect(iniciarAssinaturaAtende(dbDaEmpresa(), sessao, { plano: 'profissional' })).rejects.toThrow(/já tem uma assinatura em vigor/);
    const r = await iniciarAssinaturaAtende(dbDaEmpresa(), sessao, { plano: 'profissional', trocar: true });
    expect(r.url).toContain('pre-novo');
    expect(mp.cancelados).toEqual(['pre-velho']);
    expect(banco.tabelas.atende_assinaturas.find((a) => a.id === 'a1').status).toBe('cancelada');
  });
});

describe('Atende Aí no Mercado Pago — o que o MP conta', () => {
  const pre = (extra: any = {}) => ({ id: 'pre-1', status: 'authorized', reason: 'Atende Aí — Profissional (mensal)', external_reference: `atende:${EMPRESA}`, payer_email: 'ana@empresa.com', next_payment_date: '2026-10-19T12:00:00.000Z', auto_recurring: { frequency: 1, transaction_amount: 599.9 }, ...extra });

  it('assinatura que não é do Atende: nulo (segue para o Stok)', async () => {
    expect(await aplicarPreapprovalAtende(pre({ external_reference: ORG, reason: 'Stok Aí — Essencial (mensal)' }))).toBeNull();
    mp.preapprovals['pre-x'] = pre({ id: 'pre-x', external_reference: null, reason: 'Stok Aí — Essencial (mensal)' });
    expect(await tratarEventoDoAtende('subscription_preapproval', 'pre-x')).toBeNull();
    expect(await tratarEventoDoAtende('payment', '123')).toBeNull();
  });

  it('autorizada com a nossa intenção: a linha ganha o id e a empresa ganha o plano até a próxima cobrança', async () => {
    banco.tabelas.atende_assinaturas = [{ id: 'a1', empresa_id: EMPRESA, plano: 'profissional', ciclo: 'mensal', valor: 599.9, status: 'pendente', mp_preapproval_id: 'pre-1', payer_email: 'ana@empresa.com', created_at: 'agora' }];
    const r = await aplicarPreapprovalAtende(pre());
    expect(r).toMatchObject({ casou: true, empresaId: EMPRESA, organizationId: ORG });
    expect(r!.assinatura).toMatchObject({ status: 'autorizada', proxima_cobranca: '2026-10-19T12:00:00.000Z' });
    const emp = banco.tabelas.atende_empresas[0];
    expect(emp).toMatchObject({ plano: 'profissional', plano_ate: '2026-10-19T12:00:00.000Z', cobranca: 'cartao' });
    expect(emp.plano_desde).toBeTruthy();
    const conta = await contaDaEmpresa(EMPRESA, Date.parse('2026-09-20T00:00:00.000Z'));
    expect(conta).toMatchObject({ situacao: 'assinada', plano: 'profissional', renovacao: 'automatica' });
  });

  it('autorizada sem intenção nossa (pagou pelo link direto): o motivo diz o plano; a linha é criada', async () => {
    const r = await aplicarPreapprovalAtende(pre({ id: 'pre-2', reason: 'Atende Aí — Empresarial (anual)', auto_recurring: { frequency: 12 } }));
    expect(r!.casou).toBe(true);
    expect(banco.tabelas.atende_assinaturas[0]).toMatchObject({ empresa_id: EMPRESA, plano: 'empresarial', ciclo: 'anual', status: 'autorizada', mp_preapproval_id: 'pre-2' });
    expect(banco.tabelas.atende_empresas[0].plano).toBe('empresarial');
  });

  it('cancelada: a linha muda, o plano da empresa fica até plano_ate', async () => {
    banco.tabelas.atende_empresas[0] = { ...banco.tabelas.atende_empresas[0], plano: 'profissional', plano_ate: '2026-10-19T12:00:00.000Z', cobranca: 'cartao' };
    banco.tabelas.atende_assinaturas = [{ id: 'a1', empresa_id: EMPRESA, plano: 'profissional', ciclo: 'mensal', valor: 599.9, status: 'autorizada', mp_preapproval_id: 'pre-1', created_at: 'agora' }];
    const r = await aplicarPreapprovalAtende(pre({ status: 'cancelled' }));
    expect(r!.assinatura!.status).toBe('cancelada');
    expect(banco.tabelas.atende_assinaturas[0].cancelada_em).toBeTruthy();
    expect(banco.tabelas.atende_empresas[0]).toMatchObject({ plano: 'profissional', plano_ate: '2026-10-19T12:00:00.000Z' });
  });

  it('assinatura de outra empresa não é aplicada na minha', async () => {
    const r = await aplicarPreapprovalAtende(pre(), { empresaId: '7e7e0000-0000-4000-8000-000000000002' });
    expect(r).toMatchObject({ casou: false, motivo: 'a assinatura pertence a outra empresa' });
    expect(banco.tabelas.atende_empresas[0].plano).toBeNull();
  });

  it('cobrança aprovada estende o plano até a próxima; agendada não muda nada', async () => {
    banco.tabelas.atende_assinaturas = [{ id: 'a1', empresa_id: EMPRESA, plano: 'profissional', ciclo: 'mensal', valor: 599.9, status: 'autorizada', mp_preapproval_id: 'pre-1', payer_email: 'ana@empresa.com', created_at: 'agora' }];
    mp.preapprovals['pre-1'] = pre({ next_payment_date: '2026-11-19T12:00:00.000Z' });
    mp.autorizados['ap-1'] = { id: 'ap-1', preapproval_id: 'pre-1', status: 'scheduled', payment: null };
    const agendado = await tratarEventoDoAtende('subscription_authorized_payment', 'ap-1');
    expect(agendado!.casou).toBe(true);
    expect(banco.tabelas.atende_empresas[0].plano_ate).toBeNull();
    mp.autorizados['ap-2'] = { id: 'ap-2', preapproval_id: 'pre-1', status: 'processed', payment: { id: 9, status: 'approved' } };
    const pago = await tratarEventoDoAtende('subscription_authorized_payment', 'ap-2');
    expect(pago!.casou).toBe(true);
    expect(banco.tabelas.atende_empresas[0]).toMatchObject({ plano: 'profissional', plano_ate: '2026-11-19T12:00:00.000Z' });
    expect(banco.tabelas.atende_assinaturas[0].proxima_cobranca).toBe('2026-11-19T12:00:00.000Z');
    // As duas cobranças viraram histórico (a agendada e a aprovada), no shape do Stok, com o pagador de quem assinou.
    const pgs = banco.tabelas.atende_pagamentos;
    expect(pgs.map((p) => [p.mp_authorized_payment_id, p.status])).toEqual([
      ['ap-1', 'agendado'],
      ['ap-2', 'aprovado'],
    ]);
    expect(pgs[1]).toMatchObject({ plano: 'profissional', ciclo: 'mensal', metodo: 'cartao', nf_status: 'pendente', periodo_ate: '2026-11-19T12:00:00.000Z', pagador: { email: 'ana@empresa.com' } });
  });

  it('sincronizar sem id acha a assinatura recente com a referência da empresa', async () => {
    mp.preapprovals['pre-1'] = pre();
    mp.preapprovals['pre-stok'] = pre({ id: 'pre-stok', external_reference: ORG, reason: 'Stok Aí — Essencial (mensal)' });
    const r = await sincronizarAtende(EMPRESA, null);
    expect(r).toMatchObject({ casou: true, empresaId: EMPRESA });
    expect(banco.tabelas.atende_empresas[0].plano).toBe('profissional');
  });
});
