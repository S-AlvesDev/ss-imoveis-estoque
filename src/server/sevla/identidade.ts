import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { supabaseServer } from '../../lib/supabaseServer';
import { ALL_INVENTORY_ROLES } from '../../shared/constants';
import { contaDaOrg } from '../planos';
import { assinarSessao as assinarSessaoDoAtende } from '../../atende/server/auth';
import { entrarPelaPonte, podeAtivar, ErroDaPonte } from '../../atende/server/ponte';
import type { Papel } from '../../atende/shared/papeis';
import type { SessaoAtende } from '../../atende/shared/tipos';
import { PRODUTOS_SEVLA, type ProdutoSevla, type AcessoSevla, type ContaSevla, type MinhaSevla, type ProdutoNaMinhaSevla } from '../../shared/sevla';

/**
 * SEVLA Identity — a identidade central, em dois passos.
 *
 * 1. `entrar(email, senha)` confere a pessoa (sevla_contas) e devolve um
 *    token SEVLA: `{ produto: 'sevla', cid, email, nome }`. Ele não abre
 *    produto nenhum — o `authenticate` do Stok Aí até aceita a assinatura,
 *    mas o `withTenant` recusa por não ter organização; o `autenticar` do
 *    Atende recusa pelo carimbo do produto.
 * 2. `sessaoDoProduto(conta, produto, organização)` emite o token do
 *    produto no formato que ele já usa hoje (AuthedUser do Stok, SessaoAtende
 *    do Atende) — só se a conta tem participação ativa naquela empresa e
 *    naquele produto. Sem acesso: 403, decidido aqui, nunca na tela.
 *
 * Senhas: o hash da conta SEVLA veio de um dos produtos (bcrypt nos dois).
 * Quem tinha senhas diferentes entra com qualquer uma; na primeira entrada
 * válida o hash da conta passa a ser o que funcionou.
 *
 * Quando os produtos tiverem domínios próprios, só o transporte muda
 * (redirect + código de uso único); estes dois passos continuam iguais.
 */

export const PRODUTO_SEVLA = 'sevla' as const;
export const SESSAO_SEVLA_HORAS = 12;

export interface TokenSevla {
  produto: typeof PRODUTO_SEVLA;
  cid: string;
  email: string;
  nome: string;
}

function segredo(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET não definido.');
  return s;
}

export function assinarSevla(conta: ContaSevla): string {
  const payload: TokenSevla = { produto: PRODUTO_SEVLA, cid: conta.id, email: conta.email, nome: conta.nome };
  return jwt.sign(payload, segredo(), { expiresIn: `${SESSAO_SEVLA_HORAS}h` });
}

export function lerSevla(token: string): TokenSevla | null {
  try {
    const t = jwt.verify(token, segredo()) as Partial<TokenSevla>;
    if (t.produto !== PRODUTO_SEVLA || typeof t.cid !== 'string' || typeof t.email !== 'string') return null;
    return { produto: PRODUTO_SEVLA, cid: t.cid, email: t.email, nome: String(t.nome ?? '') };
  } catch {
    return null;
  }
}

export class ErroDaSevla extends Error {
  constructor(
    message: string,
    public status = 400,
    public motivo: 'credenciais' | 'sem_produto' | 'sem_acesso' | 'invalido' | 'indisponivel' = 'invalido',
  ) {
    super(message);
  }
}

/** E-mail vira padrão de ilike sem curingas. */
const padraoDeEmail = (email: string) => email.replace(/[\\%_]/g, '\\$&');

export function ehProdutoSevla(p: unknown): p is ProdutoSevla {
  return typeof p === 'string' && (PRODUTOS_SEVLA as readonly string[]).includes(p);
}

// ---------------------------------------------------------------------------
//  A conta
// ---------------------------------------------------------------------------

interface LinhaDaConta {
  id: string;
  email: string;
  nome: string;
  senha_hash: string | null;
}

async function contaPorEmail(email: string): Promise<LinhaDaConta | null> {
  const { data, error } = await supabaseServer.from('sevla_contas').select('id, email, nome, senha_hash').ilike('email', padraoDeEmail(email)).limit(1).maybeSingle();
  if (error) {
    // Migração 035 ainda não rodou: a SEVLA não existe neste banco. A tela cai no login do produto.
    if (/sevla_contas/.test(error.message)) throw new ErroDaSevla('A conta SEVLA ainda não está disponível neste servidor.', 503, 'indisponivel');
    throw error;
  }
  return (data as LinhaDaConta | null) ?? null;
}

export async function contaPorId(id: string): Promise<ContaSevla | null> {
  const { data } = await supabaseServer.from('sevla_contas').select('id, email, nome').eq('id', id).maybeSingle();
  return (data as ContaSevla | null) ?? null;
}

/** Os acessos (produto × empresa × papel) de uma conta, só os ativos. */
export async function acessosDaConta(contaId: string): Promise<AcessoSevla[]> {
  const { data, error } = await supabaseServer.from('sevla_acessos').select('produto, organization_id, organizacao, usuario_id, papel, ativo, nome, matricula, empresa_id').eq('conta_id', contaId).eq('ativo', true);
  if (error) throw error;
  return ((data || []) as any[]).map((a) => ({ produto: a.produto as ProdutoSevla, organization_id: a.organization_id, organizacao: a.organizacao, usuario_id: Number(a.usuario_id), papel: a.papel, nome: a.nome, matricula: a.matricula ?? null, empresa_id: a.empresa_id ?? null }));
}

/**
 * Confere e-mail + senha. Primeiro o hash da conta; se não bate, os hashes
 * dos produtos (senhas diferentes de antes da SEVLA) — e o que bater vira o
 * hash da conta. Mesma resposta exista ou não a conta.
 */
export async function entrar(emailBruto: unknown, senhaBruta: unknown): Promise<{ conta: ContaSevla; token: string; acessos: AcessoSevla[] }> {
  const email = String(emailBruto ?? '').trim().toLowerCase();
  const senha = String(senhaBruta ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120 || !senha) throw new ErroDaSevla('Informe e-mail e senha.', 400, 'invalido');

  const conta = await contaPorEmail(email);
  const recusa = () => new ErroDaSevla('E-mail ou senha incorretos.', 401, 'credenciais');
  if (!conta) throw recusa();

  let valida = Boolean(conta.senha_hash && /^\$2[aby]\$/.test(conta.senha_hash) && (await bcrypt.compare(senha, conta.senha_hash)));
  if (!valida) {
    // Os hashes dos produtos, para quem tinha senhas diferentes.
    const [{ data: estoque }, { data: atende }] = await Promise.all([
      supabaseServer.from('estoque_users').select('senha').eq('sevla_conta_id', conta.id).eq('ativo', true).limit(5),
      supabaseServer.from('atende_usuarios').select('senha').eq('sevla_conta_id', conta.id).eq('ativo', true).limit(5),
    ]);
    for (const linha of [...((estoque || []) as any[]), ...((atende || []) as any[])]) {
      const hash = String(linha.senha ?? '');
      if (/^\$2[aby]\$/.test(hash) && (await bcrypt.compare(senha, hash))) {
        valida = true;
        // Converge: a senha que a pessoa usa passa a ser a da conta.
        await supabaseServer.from('sevla_contas').update({ senha_hash: hash }).eq('id', conta.id);
        break;
      }
    }
  }
  if (!valida) throw recusa();

  await supabaseServer.from('sevla_contas').update({ ultimo_acesso: new Date().toISOString() }).eq('id', conta.id);
  const c: ContaSevla = { id: conta.id, email: conta.email, nome: conta.nome };
  return { conta: c, token: assinarSevla(c), acessos: await acessosDaConta(conta.id) };
}

// ---------------------------------------------------------------------------
//  A sessão de um produto, a partir da conta
// ---------------------------------------------------------------------------

/** O que o Stok Aí põe no token (ver AuthedUser em src/server/app.ts). */
export interface SessaoDoStok {
  id: number;
  nome: string;
  matricula: string;
  role: string;
  organization_id: string;
}

export type SessaoEmitida = { produto: 'stok'; user: SessaoDoStok; token: string } | { produto: 'atende'; sessao: SessaoAtende; token: string };

/**
 * Emite o token do produto para a empresa escolhida (ou a única). Sem
 * participação ativa: 403 com `motivo: 'sem_produto'` — a tela então mostra
 * "conhecer planos", não um formulário quebrado.
 */
export async function sessaoDoProduto(contaId: string, produto: ProdutoSevla, organizationId: string | null): Promise<SessaoEmitida> {
  const acessos = (await acessosDaConta(contaId)).filter((a) => a.produto === produto);
  if (!acessos.length) throw new ErroDaSevla(produto === 'stok' ? 'Sua conta SEVLA ainda não tem acesso ao Stok Aí.' : 'Sua conta SEVLA ainda não tem acesso ao Atende Aí.', 403, 'sem_produto');
  const acesso = organizationId ? acessos.find((a) => a.organization_id === organizationId) : acessos.length === 1 ? acessos[0] : null;
  if (!acesso) throw new ErroDaSevla(organizationId ? 'Você não participa desta empresa neste produto.' : 'Escolha a empresa.', organizationId ? 403 : 400, organizationId ? 'sem_acesso' : 'invalido');

  if (produto === 'stok') {
    const { data: u } = await supabaseServer.from('estoque_users').select('id, nome, matricula, role, organization_id, ativo').eq('id', acesso.usuario_id).maybeSingle();
    if (!u || u.ativo === false) throw new ErroDaSevla('Esta conta do Stok Aí está desativada.', 403, 'sem_acesso');
    const role = u.role || (String(u.matricula || '').startsWith('E') ? 'OPERADOR' : null);
    if (!role || !ALL_INVENTORY_ROLES.includes(role)) throw new ErroDaSevla('Este usuário não tem acesso ao sistema de estoque.', 403, 'sem_acesso');
    await supabaseServer.from('estoque_users').update({ ultimo_acesso: new Date().toISOString() }).eq('id', u.id);
    const user: SessaoDoStok = { id: Number(u.id), nome: u.nome, matricula: u.matricula, role, organization_id: u.organization_id };
    return { produto: 'stok', user, token: jwt.sign(user, segredo(), { expiresIn: '12h' }) };
  }

  const { data: a } = await supabaseServer.from('atende_usuarios').select('id, nome, email, papel, empresa_id, ativo').eq('id', acesso.usuario_id).maybeSingle();
  if (!a || a.ativo === false) throw new ErroDaSevla('Esta conta do Atende Aí está desativada.', 403, 'sem_acesso');
  await supabaseServer.from('atende_usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', a.id);
  const sessao: SessaoAtende = { id: Number(a.id), nome: a.nome, email: a.email, papel: a.papel as Papel, empresa_id: a.empresa_id };
  return { produto: 'atende', sessao, token: assinarSessaoDoAtende(sessao) };
}

/**
 * Ativa o Atende Aí para uma organização em que a conta administra o
 * estoque (a antiga "ponte", agora pela SEVLA). Devolve a sessão do Atende.
 */
export async function ativarAtende(contaId: string, organizationId: string): Promise<{ sessao: SessaoAtende; token: string; ativou: boolean }> {
  const stok = (await acessosDaConta(contaId)).find((a) => a.produto === 'stok' && a.organization_id === organizationId);
  if (!stok) throw new ErroDaSevla('Você não participa desta empresa no Stok Aí.', 403, 'sem_acesso');
  if (!podeAtivar(stok.papel)) throw new ErroDaSevla('Só quem administra o Stok Aí da empresa pode ativar o Atende Aí.', 403, 'sem_acesso');
  try {
    return await entrarPelaPonte({ id: stok.usuario_id, nome: stok.nome, role: stok.papel, organization_id: organizationId });
  } catch (e) {
    if (e instanceof ErroDaPonte) throw new ErroDaSevla(e.message, e.status, 'sem_acesso');
    throw e;
  }
}

// ---------------------------------------------------------------------------
//  Minha SEVLA: os produtos, o que a pessoa tem em cada um
// ---------------------------------------------------------------------------

export async function minhaSevla(conta: ContaSevla): Promise<MinhaSevla> {
  const acessos = await acessosDaConta(conta.id);
  const produtos: ProdutoNaMinhaSevla[] = [];

  for (const produto of PRODUTOS_SEVLA) {
    const meus = acessos.filter((a) => a.produto === produto);
    const empresas = [];
    for (const a of meus) {
      let situacao: string | null = null;
      let plano: string | null = null;
      if (produto === 'stok') {
        // A situação da conta do Stok Aí vem da mesma regra que o painel usa.
        try {
          const c = await contaDaOrg(a.organization_id);
          situacao = c.situacao;
          plano = c.plano;
        } catch {
          /* sem leitura, sem inventar */
        }
      } else {
        // O Atende Aí ainda não tem plano (Fase 3): ativo, sem plano.
        situacao = 'ativa';
        plano = null;
      }
      empresas.push({ organization_id: a.organization_id, organizacao: a.organizacao, papel: a.papel, situacao, plano, empresa_id: a.empresa_id });
    }
    // Empresas em que a pessoa administra o Stok Aí mas o Atende ainda não foi ativado: pode ativar daqui.
    const podeAtivarEm = produto === 'atende' ? acessos.filter((s) => s.produto === 'stok' && podeAtivar(s.papel) && !meus.some((m) => m.organization_id === s.organization_id)).map((s) => ({ organization_id: s.organization_id, organizacao: s.organizacao })) : [];
    produtos.push({ produto, empresas, podeAtivarEm });
  }
  return { conta, produtos };
}
