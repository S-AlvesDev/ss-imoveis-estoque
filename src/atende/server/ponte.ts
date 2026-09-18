import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { supabaseServer } from '../../lib/supabaseServer';
import { ADMIN_ROLES, CEO } from '../../shared/constants';
import { assinarSessao } from './auth';
import type { Papel } from '../shared/papeis';
import type { SessaoAtende } from '../shared/tipos';

/**
 * A ponte com o Stok Aí.
 *
 * Os dois produtos vivem na mesma origem, então quem está logado no Stok Aí
 * carrega no navegador um token dele. Este módulo aceita esse token — e só
 * ele, nas duas rotas de ponte — para: dizer em que pé a empresa está
 * (ativou o Atende? esta pessoa já existe lá?), ativar o Atende para a
 * organização (quem administra o estoque), e entrar.
 *
 * O que atravessa a ponte: nome da empresa, nome/e-mail/cargo da pessoa, e
 * as duas chaves de ligação (`organization_id`, `estoque_user_id`). Nada de
 * estoque. A sessão que sai daqui é a do Atende, igual à do login por senha.
 */

/** O que o token do Stok Aí carrega (ver AuthedUser em src/server/app.ts). */
export interface SessaoDoStokAi {
  id: number;
  nome: string;
  role: string;
  organization_id: string;
}

export function lerSessaoDoStokAi(token: string): SessaoDoStokAi | null {
  try {
    const t = jwt.verify(token, process.env.JWT_SECRET as string) as Record<string, unknown>;
    // Token do próprio Atende não passa por aqui — a ponte é de mão única.
    if (t.produto || typeof t.id !== 'number' || typeof t.organization_id !== 'string' || typeof t.role !== 'string') return null;
    return { id: t.id, nome: String(t.nome ?? ''), role: t.role, organization_id: t.organization_id };
  } catch {
    return null;
  }
}

/** O cargo do estoque vira papel do atendimento — só na criação; depois o admin do Atende manda. */
export function papelPara(role: string): Papel {
  if (role === CEO || role === 'ADMINISTRADOR') return 'admin';
  if (role === 'ADMINISTRATIVO') return 'supervisor';
  return 'atendente';
}

export function podeAtivar(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

interface PessoaDoEstoque {
  id: number;
  nome: string;
  email: string | null;
  role: string;
  organization_id: string;
  ativo: boolean;
}

async function pessoaDoEstoque(sessao: SessaoDoStokAi): Promise<PessoaDoEstoque | null> {
  const { data } = await supabaseServer.from('estoque_users').select('id, nome, email, role, organization_id, ativo').eq('id', sessao.id).maybeSingle();
  if (!data || data.ativo === false || data.organization_id !== sessao.organization_id) return null;
  return { ...data, id: Number(data.id) } as PessoaDoEstoque;
}

export interface Situacao {
  pessoa: { nome: string; email: string | null; papel: Papel };
  empresa: { nome: string };
  /** A organização já ativou o Atende Aí. */
  vinculada: boolean;
  /** Esta pessoa pode ativar (administra o estoque). */
  podeAtivar: boolean;
  /** Esta pessoa já tem usuário no Atende. */
  usuarioExiste: boolean;
}

export async function situacaoDaPonte(sessao: SessaoDoStokAi): Promise<Situacao | null> {
  const pessoa = await pessoaDoEstoque(sessao);
  if (!pessoa) return null;
  const [{ data: org }, { data: empresa }] = await Promise.all([
    supabaseServer.from('organizations').select('nome').eq('id', sessao.organization_id).maybeSingle(),
    supabaseServer.from('atende_empresas').select('id').eq('organization_id', sessao.organization_id).maybeSingle(),
  ]);
  if (!org) return null;
  let usuarioExiste = false;
  if (empresa) {
    const { data: u } = await supabaseServer.from('atende_usuarios').select('id').eq('empresa_id', empresa.id).eq('estoque_user_id', pessoa.id).maybeSingle();
    usuarioExiste = Boolean(u);
  }
  return { pessoa: { nome: pessoa.nome, email: pessoa.email, papel: papelPara(pessoa.role) }, empresa: { nome: org.nome }, vinculada: Boolean(empresa), podeAtivar: podeAtivar(pessoa.role), usuarioExiste };
}

export class ErroDaPonte extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Slug a partir do nome, sem acento, único entre as empresas do Atende. */
async function slugLivre(nome: string): Promise<string> {
  const base =
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'empresa';
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const { data } = await supabaseServer.from('atende_empresas').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Entra no Atende com a sessão do Stok Aí. Se a organização ainda não
 * ativou o Atende, ativa — desde que a pessoa administre o estoque. Se a
 * pessoa ainda não existe no Atende, é criada com o papel mapeado e uma
 * senha aleatória (ela entra pela ponte; pode criar senha em "Esqueci").
 */
export async function entrarPelaPonte(sessao: SessaoDoStokAi): Promise<{ sessao: SessaoAtende; token: string; ativou: boolean }> {
  const pessoa = await pessoaDoEstoque(sessao);
  if (!pessoa) throw new ErroDaPonte('Sua sessão do Stok Aí não vale mais. Entre de novo por lá.', 401);
  if (!pessoa.email) throw new ErroDaPonte('Sua conta do Stok Aí não tem e-mail — o Atende Aí entra por e-mail. Peça ao administrador para colocar um em Usuários.', 400);

  let { data: empresa } = await supabaseServer.from('atende_empresas').select('id, nome').eq('organization_id', sessao.organization_id).maybeSingle();
  let ativou = false;

  if (!empresa) {
    if (!podeAtivar(pessoa.role)) throw new ErroDaPonte('Sua empresa ainda não ativou o Atende Aí. Peça a um administrador do Stok Aí para ativar.', 403);
    const { data: org } = await supabaseServer.from('organizations').select('nome').eq('id', sessao.organization_id).maybeSingle();
    if (!org) throw new ErroDaPonte('Organização não encontrada.', 404);
    const { data: nova, error } = await supabaseServer.from('atende_empresas').insert({ nome: org.nome, slug: await slugLivre(org.nome), organization_id: sessao.organization_id }).select('id, nome').single();
    if (error || !nova) {
      // Duas abas ativando ao mesmo tempo: a segunda acha a primeira.
      const { data: existente } = await supabaseServer.from('atende_empresas').select('id, nome').eq('organization_id', sessao.organization_id).maybeSingle();
      if (!existente) throw error ?? new Error('não criou a empresa');
      empresa = existente;
    } else {
      empresa = nova;
      ativou = true;
      console.info('[atende ponte] Atende Aí ativado para a organização', { organization_id: sessao.organization_id, por: pessoa.id });
    }
  }

  let { data: usuario } = await supabaseServer.from('atende_usuarios').select('id, nome, email, papel, ativo').eq('empresa_id', empresa.id).eq('estoque_user_id', pessoa.id).maybeSingle();
  if (usuario && !usuario.ativo) throw new ErroDaPonte('Sua conta no Atende Aí está desativada. Fale com o administrador.', 403);

  if (!usuario) {
    // E-mail já usado por alguém no Atende (outra empresa, ou cadastro à mão): não dá para ter dois.
    const { data: mesmoEmail } = await supabaseServer.from('atende_usuarios').select('id, empresa_id, estoque_user_id').ilike('email', pessoa.email.replace(/[\\%_]/g, '\\$&')).maybeSingle();
    if (mesmoEmail && mesmoEmail.empresa_id !== empresa.id) throw new ErroDaPonte('Este e-mail já está em outra empresa do Atende Aí.', 409);
    if (mesmoEmail && !mesmoEmail.estoque_user_id) {
      // Foi cadastrado à mão nesta empresa com o mesmo e-mail: adota a ligação.
      const { data: adotado, error } = await supabaseServer.from('atende_usuarios').update({ estoque_user_id: pessoa.id }).eq('id', mesmoEmail.id).select('id, nome, email, papel, ativo').single();
      if (error || !adotado) throw error ?? new Error('não ligou o usuário');
      usuario = adotado;
    } else {
      const senhaAleatoria = await bcrypt.hash(randomBytes(24).toString('base64url'), 10);
      const { data: criado, error } = await supabaseServer
        .from('atende_usuarios')
        .insert({ empresa_id: empresa.id, nome: pessoa.nome, email: pessoa.email.toLowerCase(), senha: senhaAleatoria, papel: papelPara(pessoa.role), estoque_user_id: pessoa.id })
        .select('id, nome, email, papel, ativo')
        .single();
      if (error || !criado) throw error ?? new Error('não criou o usuário');
      usuario = criado;
    }
  }

  await supabaseServer.from('atende_usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', usuario.id);
  const s: SessaoAtende = { id: Number(usuario.id), nome: usuario.nome, email: usuario.email, papel: usuario.papel as Papel, empresa_id: empresa.id };
  return { sessao: s, token: assinarSessao(s), ativou };
}
