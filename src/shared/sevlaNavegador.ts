import { CHAVE_DA_SESSAO_SEVLA, SESSAO_DO_PRODUTO, type ContaSevla, type MinhaSevla, type ProdutoSevla, type RespostaDeEntrada } from './sevla';

/**
 * A SEVLA Identity no navegador — usada pelas três entradas (Stok Aí,
 * Atende Aí e a página da SEVLA). Só fetch e localStorage: cada produto
 * continua com a própria store; aqui a gente só grava a sessão dele no
 * formato que a store persiste (zustand/persist) e manda para dentro.
 */
export class ErroDaSevlaNoNavegador extends Error {
  constructor(
    message: string,
    public status: number,
    public motivo: string | null,
  ) {
    super(message);
  }
}

async function pedir<T>(caminho: string, corpo?: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api/sevla${caminho}`, { method: corpo === undefined ? 'GET' : 'POST', headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  } catch {
    throw new ErroDaSevlaNoNavegador('Sem conexão com o servidor.', 0, 'rede');
  }
  const body = res.headers.get('content-type')?.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ErroDaSevlaNoNavegador(body?.error || `Erro ${res.status}.`, res.status, body?.motivo ?? null);
  return body as T;
}

export interface SessaoSevlaGuardada {
  conta: ContaSevla;
  token: string;
}

export function lerSessaoSevla(): SessaoSevlaGuardada | null {
  try {
    const bruto = localStorage.getItem(CHAVE_DA_SESSAO_SEVLA);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as SessaoSevlaGuardada;
    return s?.token && s?.conta?.id ? s : null;
  } catch {
    return null;
  }
}

export function guardarSessaoSevla(s: SessaoSevlaGuardada) {
  try {
    localStorage.setItem(CHAVE_DA_SESSAO_SEVLA, JSON.stringify(s));
  } catch {
    /* sem storage: a sessão dura a aba */
  }
}

export function sairDaSevla() {
  try {
    localStorage.removeItem(CHAVE_DA_SESSAO_SEVLA);
  } catch {
    /* nada */
  }
}

/** Passo 1: e-mail + senha → conta, token SEVLA e acessos. Já guarda a sessão. */
export async function entrarNaSevla(email: string, senha: string): Promise<RespostaDeEntrada> {
  const r = await pedir<RespostaDeEntrada>('/entrar', { email, senha });
  guardarSessaoSevla({ conta: r.conta, token: r.token });
  return r;
}

/** A conta e os produtos dela — o que a página Minha SEVLA mostra. */
export async function minhaSevla(tokenSevla: string): Promise<MinhaSevla> {
  return pedir<MinhaSevla>('/minha', undefined, tokenSevla);
}

export type SessaoDoProdutoEmitida = { produto: 'stok'; user: { id: number; nome: string; matricula: string; role: string; organization_id: string }; token: string } | { produto: 'atende'; sessao: { id: number; nome: string; email: string; papel: string; empresa_id: string }; token: string };

/** Passo 2: o token do produto, para a empresa escolhida (ou a única). */
export async function sessaoDoProduto(tokenSevla: string, produto: ProdutoSevla, organizationId?: string | null): Promise<SessaoDoProdutoEmitida> {
  return pedir<SessaoDoProdutoEmitida>(`/sessao/${produto}`, { organization_id: organizationId ?? null }, tokenSevla);
}

/** Ativa o Atende Aí para uma organização que a conta administra no Stok Aí; devolve a sessão do Atende. */
export async function ativarAtendePelaSevla(tokenSevla: string, organizationId: string): Promise<Extract<SessaoDoProdutoEmitida, { produto: 'atende' }> & { ativou: boolean }> {
  return pedir(`/ativar/atende`, { organization_id: organizationId }, tokenSevla);
}

/**
 * Grava a sessão do produto no formato que a store dele persiste
 * (zustand/persist: { state, version }). Serve para entrar num produto a
 * partir de OUTRA entrada (Minha SEVLA → Stok Aí); dentro do próprio
 * produto, use a store dele.
 */
export function guardarSessaoDoProduto(emitida: SessaoDoProdutoEmitida) {
  const { chave } = SESSAO_DO_PRODUTO[emitida.produto];
  const state = emitida.produto === 'stok' ? { user: emitida.user, token: emitida.token } : { sessao: emitida.sessao, token: emitida.token };
  try {
    localStorage.setItem(chave, JSON.stringify({ state, version: 0 }));
  } catch {
    /* nada */
  }
}

/** A falha da SEVLA que NÃO é "você não tem acesso": aí a tela cai no login antigo do produto. */
export function deveCairNoLoginAntigo(e: unknown): boolean {
  if (!(e instanceof ErroDaSevlaNoNavegador)) return true;
  return e.motivo !== 'sem_produto' && e.motivo !== 'sem_acesso';
}
