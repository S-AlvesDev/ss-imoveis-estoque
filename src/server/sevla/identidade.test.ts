import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

/**
 * SEVLA Identity — os dois passos, com um banco de mentira em memória.
 * O que se prova aqui: o token SEVLA não abre produto; o token DO produto
 * sai no formato que o produto já lê; sem participação, 403 decidido no
 * servidor; SEVLA sem migração cai em 503 (e a tela, no login antigo).
 */

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  process.env.JWT_SECRET = 'segredo-de-teste';
});

// Banco em memória: tabelas → linhas. Filtros eq/ilike, limit, maybeSingle, update.
const banco = vi.hoisted(() => ({ tabelas: {} as Record<string, any[] | undefined>, atualizacoes: [] as Array<{ tabela: string; valores: any; filtros: Array<[string, any]> }> }));

vi.mock('../../lib/supabaseServer', () => {
  function construtor(tabela: string) {
    const filtros: Array<[string, any]> = [];
    let limite = Infinity;
    let unico = false;
    let atualizacao: any = null;
    const executar = () => {
      const linhas = banco.tabelas[tabela];
      if (!linhas) return { data: null, error: { message: `relation "public.${tabela}" does not exist` } };
      if (atualizacao) {
        banco.atualizacoes.push({ tabela, valores: atualizacao, filtros });
        for (const l of linhas) if (filtros.every(([c, v]) => String(l[c]).toLowerCase() === String(v).toLowerCase())) Object.assign(l, atualizacao);
        return { data: null, error: null };
      }
      const achadas = linhas.filter((l) => filtros.every(([c, v]) => String(l[c]).toLowerCase() === String(v).toLowerCase())).slice(0, limite);
      return { data: unico ? (achadas[0] ?? null) : achadas, error: null };
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => (filtros.push([c, v]), b),
      ilike: (c: string, v: any) => (filtros.push([c, v]), b),
      limit: (n: number) => ((limite = n), b),
      maybeSingle: () => ((unico = true), b),
      update: (valores: any) => ((atualizacao = valores), b),
      then: (ok: (r: any) => any, falha?: (e: any) => any) => Promise.resolve(executar()).then(ok, falha),
    };
    return b;
  }
  return { supabaseServer: { from: construtor } };
});

import { assinarSevla, lerSevla, ehProdutoSevla, entrar, sessaoDoProduto, ErroDaSevla } from './identidade';
import { lerSessao as lerSessaoDoAtende } from '../../atende/server/auth';
import { ErroDaSevlaNoNavegador, deveCairNoLoginAntigo } from '../../shared/sevlaNavegador';

const CONTA = { id: '9e7e0000-0000-4000-8000-000000000001', email: 'ana@empresa.com', nome: 'Ana Souza' };
const ORG_A = '5e7e0000-0000-4000-8000-00000000000a';
const ORG_B = '5e7e0000-0000-4000-8000-00000000000b';
const EMPRESA = '7e7e0000-0000-4000-8000-000000000001';

const hashDe = (s: string) => bcrypt.hashSync(s, 4);

async function erroDe(p: Promise<unknown>): Promise<ErroDaSevla> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDaSevla) return e;
    throw e;
  }
  throw new Error('esperava ErroDaSevla');
}

beforeEach(() => {
  banco.atualizacoes = [];
  banco.tabelas = {
    sevla_contas: [{ ...CONTA, senha_hash: hashDe('senha-da-sevla') }],
    sevla_acessos: [],
    estoque_users: [{ id: 7, nome: 'Ana Souza', matricula: 'ana@empresa.com', role: 'ADMINISTRADOR', organization_id: ORG_A, ativo: true, sevla_conta_id: CONTA.id, senha: hashDe('senha-do-stok') }],
    atende_usuarios: [{ id: 3, nome: 'Ana Souza', email: 'ana@empresa.com', papel: 'admin', empresa_id: EMPRESA, ativo: true, sevla_conta_id: CONTA.id, senha: hashDe('senha-do-atende') }],
  };
});

describe('SEVLA Identity — o token SEVLA', () => {
  it('assina e lê; carimba o produto "sevla"', () => {
    const t = lerSevla(assinarSevla(CONTA));
    expect(t).toEqual({ produto: 'sevla', cid: CONTA.id, email: CONTA.email, nome: CONTA.nome });
  });

  it('não abre o Atende Aí: o autenticar dele recusa pelo carimbo', () => {
    expect(lerSessaoDoAtende(assinarSevla(CONTA))).toBeNull();
  });

  it('não lê token de produto como se fosse da SEVLA', () => {
    const doStok = jwt.sign({ id: 7, nome: 'Ana', matricula: 'A1', role: 'ADMINISTRADOR', organization_id: ORG_A }, 'segredo-de-teste');
    expect(lerSevla(doStok)).toBeNull();
    expect(lerSevla('lixo')).toBeNull();
  });

  it('só conhece os produtos do ecossistema', () => {
    expect(ehProdutoSevla('stok')).toBe(true);
    expect(ehProdutoSevla('atende')).toBe(true);
    expect(ehProdutoSevla('sevla')).toBe(false);
    expect(ehProdutoSevla(undefined)).toBe(false);
  });
});

describe('SEVLA Identity — entrar', () => {
  it('exige e-mail e senha', async () => {
    const e = await erroDe(entrar('ana', 'x'));
    expect(e.status).toBe(400);
    expect(e.motivo).toBe('invalido');
  });

  it('sem a migração 035, avisa que está indisponível (503) — e a tela cai no login antigo', async () => {
    delete banco.tabelas.sevla_contas;
    const e = await erroDe(entrar(CONTA.email, 'senha-da-sevla'));
    expect(e.status).toBe(503);
    expect(e.motivo).toBe('indisponivel');
    expect(deveCairNoLoginAntigo(new ErroDaSevlaNoNavegador(e.message, e.status, e.motivo))).toBe(true);
  });

  it('e-mail desconhecido e senha errada dão a mesma resposta', async () => {
    const a = await erroDe(entrar('ninguem@empresa.com', 'x'));
    const b = await erroDe(entrar(CONTA.email, 'errada'));
    expect([a.status, a.motivo, a.message]).toEqual([401, 'credenciais', b.message]);
  });

  it('entra com a senha da conta, com e-mail em qualquer caixa, e devolve os acessos', async () => {
    banco.tabelas.sevla_acessos = [{ conta_id: CONTA.id, produto: 'stok', organization_id: ORG_A, organizacao: 'Empresa A', usuario_id: 7, papel: 'ADMINISTRADOR', ativo: true, nome: 'Ana Souza', matricula: 'ana@empresa.com', empresa_id: null }];
    const r = await entrar('  ANA@Empresa.com ', 'senha-da-sevla');
    expect(r.conta).toEqual(CONTA);
    expect(lerSevla(r.token)?.cid).toBe(CONTA.id);
    expect(r.acessos).toHaveLength(1);
    expect(r.acessos[0]).toMatchObject({ produto: 'stok', organization_id: ORG_A, papel: 'ADMINISTRADOR' });
  });

  it('aceita a senha de um produto quando a da conta não bate — e converge o hash', async () => {
    const r = await entrar(CONTA.email, 'senha-do-atende');
    expect(r.conta.id).toBe(CONTA.id);
    const convergiu = banco.atualizacoes.find((a) => a.tabela === 'sevla_contas' && a.valores.senha_hash);
    expect(convergiu).toBeTruthy();
    expect(bcrypt.compareSync('senha-do-atende', convergiu!.valores.senha_hash)).toBe(true);
    // Da próxima vez, a senha do Atende já é a da conta.
    await expect(entrar(CONTA.email, 'senha-do-atende')).resolves.toBeTruthy();
  });
});

describe('SEVLA Identity — a sessão do produto', () => {
  const acessoStok = (org: string, nome = 'Empresa') => ({ conta_id: CONTA.id, produto: 'stok', organization_id: org, organizacao: nome, usuario_id: 7, papel: 'ADMINISTRADOR', ativo: true, nome: 'Ana Souza', matricula: 'ana@empresa.com', empresa_id: null });
  const acessoAtende = { conta_id: CONTA.id, produto: 'atende', organization_id: ORG_A, organizacao: 'Empresa A', usuario_id: 3, papel: 'admin', ativo: true, nome: 'Ana Souza', matricula: null, empresa_id: EMPRESA };

  it('sem participação no produto: 403 sem_produto — e a tela NÃO cai no login antigo', async () => {
    banco.tabelas.sevla_acessos = [acessoAtende];
    const e = await erroDe(sessaoDoProduto(CONTA.id, 'stok', null));
    expect(e.status).toBe(403);
    expect(e.motivo).toBe('sem_produto');
    expect(deveCairNoLoginAntigo(new ErroDaSevlaNoNavegador(e.message, e.status, e.motivo))).toBe(false);
  });

  it('em outra empresa que não a minha: 403 sem_acesso', async () => {
    banco.tabelas.sevla_acessos = [acessoStok(ORG_A)];
    const e = await erroDe(sessaoDoProduto(CONTA.id, 'stok', ORG_B));
    expect([e.status, e.motivo]).toEqual([403, 'sem_acesso']);
  });

  it('em mais de uma empresa sem escolher: pede a empresa', async () => {
    banco.tabelas.sevla_acessos = [acessoStok(ORG_A, 'A'), acessoStok(ORG_B, 'B')];
    const e = await erroDe(sessaoDoProduto(CONTA.id, 'stok', null));
    expect([e.status, e.motivo]).toEqual([400, 'invalido']);
  });

  it('Stok Aí: o token sai no formato que o authenticate do Stok já lê', async () => {
    banco.tabelas.sevla_acessos = [acessoStok(ORG_A)];
    const r = await sessaoDoProduto(CONTA.id, 'stok', null);
    expect(r.produto).toBe('stok');
    if (r.produto !== 'stok') return;
    expect(r.user).toEqual({ id: 7, nome: 'Ana Souza', matricula: 'ana@empresa.com', role: 'ADMINISTRADOR', organization_id: ORG_A });
    const lido = jwt.verify(r.token, 'segredo-de-teste') as any;
    expect(lido).toMatchObject(r.user);
    expect(lido.produto).toBeUndefined();
    expect(lerSevla(r.token)).toBeNull();
  });

  it('Stok Aí: usuário desativado não entra, mesmo com participação na view', async () => {
    banco.tabelas.sevla_acessos = [acessoStok(ORG_A)];
    banco.tabelas.estoque_users![0].ativo = false;
    const e = await erroDe(sessaoDoProduto(CONTA.id, 'stok', ORG_A));
    expect([e.status, e.motivo]).toEqual([403, 'sem_acesso']);
  });

  it('Atende Aí: a sessão sai no formato que o autenticar do Atende já lê', async () => {
    banco.tabelas.sevla_acessos = [acessoAtende];
    const r = await sessaoDoProduto(CONTA.id, 'atende', null);
    expect(r.produto).toBe('atende');
    if (r.produto !== 'atende') return;
    expect(r.sessao).toEqual({ id: 3, nome: 'Ana Souza', email: 'ana@empresa.com', papel: 'admin', empresa_id: EMPRESA });
    expect(lerSessaoDoAtende(r.token)).toMatchObject(r.sessao);
  });
});
