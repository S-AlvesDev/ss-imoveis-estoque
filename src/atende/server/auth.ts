import type express from 'express';
import jwt from 'jsonwebtoken';
import { supabaseServer } from '../../lib/supabaseServer';
import { dbDaEmpresa } from './tenant';
import { pode, type Papel, type Permissao } from '../shared/papeis';
import type { SessaoAtende } from '../shared/tipos';
import type { ScopedDb } from '../../server/tenant';

/**
 * A sessão do Atende Aí.
 *
 * Mesmo segredo do Stok Aí (JWT_SECRET), token diferente: leva `produto:
 * 'atende'` e `empresa_id` em vez de `organization_id`. O middleware daqui
 * recusa qualquer token sem o carimbo do produto; o `authenticate` do Stok Aí
 * aceita a assinatura mas o `withTenant` dele recusa a falta de organização.
 * Um token nunca serve nos dois lugares.
 *
 * Diferente do Stok Aí, a sessão é conferida no banco a cada requisição
 * (com cache de um minuto): desativar alguém ou mudar o papel dele vale em
 * até 60 s, não em 12 h. Numa central de atendimento, quem saiu da equipe
 * não pode continuar lendo conversas de cliente.
 */

export const PRODUTO = 'atende' as const;
export const SESSAO_HORAS = 12;

interface TokenAtende extends SessaoAtende {
  produto: typeof PRODUTO;
}

export interface RequisicaoAtende extends express.Request {
  sessao?: SessaoAtende;
  dbAtende?: ScopedDb;
}

function segredo(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET não definido.');
  return s;
}

export function assinarSessao(sessao: SessaoAtende): string {
  const payload: TokenAtende = { ...sessao, produto: PRODUTO };
  return jwt.sign(payload, segredo(), { expiresIn: `${SESSAO_HORAS}h` });
}

/** Lê e confere o token. Nulo para token inválido, vencido ou de outro produto. */
export function lerSessao(token: string): SessaoAtende | null {
  try {
    const t = jwt.verify(token, segredo()) as Partial<TokenAtende>;
    if (t.produto !== PRODUTO || typeof t.id !== 'number' || typeof t.empresa_id !== 'string' || !t.papel) return null;
    return { id: t.id, nome: String(t.nome ?? ''), email: String(t.email ?? ''), papel: t.papel as Papel, empresa_id: t.empresa_id };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
//  A pessoa ainda existe, está ativa e tem o mesmo papel? (cache de 60 s)
// ---------------------------------------------------------------------------

interface EstadoDoUsuario {
  ativo: boolean;
  papel: Papel;
  nome: string;
  email: string;
  empresa_id: string;
}

const estados = new Map<number, { estado: EstadoDoUsuario | null; ate: number }>();
const CACHE_MS = 60_000;

export async function estadoDoUsuario(id: number, agora = Date.now()): Promise<EstadoDoUsuario | null> {
  const guardado = estados.get(id);
  if (guardado && guardado.ate > agora) return guardado.estado;
  const { data } = await supabaseServer.from('atende_usuarios').select('ativo, papel, nome, email, empresa_id').eq('id', id).maybeSingle();
  const estado = data ? { ativo: Boolean(data.ativo), papel: data.papel as Papel, nome: data.nome, email: data.email, empresa_id: data.empresa_id } : null;
  estados.set(id, { estado, ate: agora + CACHE_MS });
  return estado;
}

/** Depois de editar alguém, o cache dele não pode valer mais. */
export function esquecerUsuario(id: number): void {
  estados.delete(id);
}

// ---------------------------------------------------------------------------
//  Middlewares
// ---------------------------------------------------------------------------

export async function autenticar(req: RequisicaoAtende, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token de acesso ausente.' });
  const sessao = lerSessao(token);
  if (!sessao) return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
  try {
    const estado = await estadoDoUsuario(sessao.id);
    if (!estado || !estado.ativo || estado.empresa_id !== sessao.empresa_id) return res.status(401).json({ error: 'Esta conta não está mais ativa. Entre novamente.' });
    // O papel e o nome valem os do banco, não os do token: quem foi rebaixado perde na hora.
    req.sessao = { ...sessao, papel: estado.papel, nome: estado.nome, email: estado.email };
    req.dbAtende = dbDaEmpresa(sessao.empresa_id);
    next();
  } catch (err: any) {
    console.error('[atende autenticar]', err.message);
    res.status(500).json({ error: 'Erro ao conferir a sessão.' });
  }
}

export function exigir(permissao: Permissao) {
  return (req: RequisicaoAtende, res: express.Response, next: express.NextFunction) => {
    if (!req.sessao || !pode(req.sessao.papel, permissao)) return res.status(403).json({ error: 'Você não tem permissão para isso.' });
    next();
  };
}
