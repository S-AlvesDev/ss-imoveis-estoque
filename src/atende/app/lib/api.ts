import { useSessaoAtende } from '../store/sessao';
import { useDadosAtende } from '../store/dados';

/**
 * O cliente HTTP do Atende Aí. Igual ao do Stok Aí no formato, separado no
 * essencial: lê o token da sessão do Atende e fala com /api/atende. Um 401
 * derruba só esta sessão.
 */
export class ErroDaApi extends Error {
  constructor(
    message: string,
    public status = 0,
    public body: any = null,
  ) {
    super(message);
  }
}

const BASE = '/api/atende';

/**
 * Depois de um tempo sem ninguém usar, a primeira chamada costuma cair: a
 * função na Vercel está fria e o banco ainda acordando. Dava aquela tela de
 * "não consegui carregar" logo depois de entrar, que sumia ao recarregar —
 * porque a segunda chamada já pegava tudo de pé.
 *
 * Só o que dá para repetir sem risco: GET (não muda nada no servidor) que
 * falhou por rede ou por erro do próprio servidor (5xx). Um 4xx é resposta,
 * não tropeço — esse sobe na hora.
 */
const TENTATIVAS_DO_GET = 3;
const ESPERA_MS = [400, 1200];

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function buscarComRetentativa(url: string, opcoes: RequestInit, podeRepetir: boolean): Promise<Response> {
  let ultimoErro: unknown;
  for (let i = 0; i < (podeRepetir ? TENTATIVAS_DO_GET : 1); i++) {
    if (i > 0) await dormir(ESPERA_MS[i - 1] ?? 1200);
    try {
      const res = await fetch(url, opcoes);
      if (res.status >= 500 && podeRepetir && i < TENTATIVAS_DO_GET - 1) continue;
      return res;
    } catch (e) {
      // Falha de rede: sem resposta nenhuma. Repete enquanto houver tentativa.
      ultimoErro = e;
    }
  }
  throw ultimoErro ?? new Error('Falha de rede.');
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const { token } = useSessaoAtende.getState();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opcoes.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await buscarComRetentativa(`${BASE}${caminho}`, { ...opcoes, headers }, (opcoes.method ?? 'GET') === 'GET');
  const ehJson = res.headers.get('content-type')?.includes('application/json');
  const body = ehJson ? await res.json().catch(() => null) : null;
  if (res.status === 401) {
    // Com sessão, 401 é ela que venceu. Sem sessão (login, cadastro), é o que o servidor disse — "e-mail ou senha incorretos".
    if (token) {
      useSessaoAtende.getState().sair();
      // Sem isso, a próxima vez que a pessoa entrar de novo o app acha que "já carregou"
      // (com o erro desta sessão vencida) e nunca busca os dados de novo.
      useDadosAtende.getState().limpar();
      throw new ErroDaApi('Sessão expirada. Entre novamente.', 401);
    }
    throw new ErroDaApi(body?.error || 'Não foi possível entrar.', 401, body);
  }
  // 402 com `bloqueada`: a avaliação terminou enquanto a pessoa usava. O shell troca para a tela de plano.
  if (res.status === 402 && body?.bloqueada) useDadosAtende.getState().marcarBloqueada();
  if (!res.ok) throw new ErroDaApi(body?.error || `Erro ${res.status} ao comunicar com o servidor.`, res.status, body);
  return body as T;
}

export const api = {
  get: <T>(caminho: string) => pedir<T>(caminho, { method: 'GET' }),
  post: <T>(caminho: string, dados?: unknown) => pedir<T>(caminho, { method: 'POST', body: dados ? JSON.stringify(dados) : undefined }),
  patch: <T>(caminho: string, dados?: unknown) => pedir<T>(caminho, { method: 'PATCH', body: dados ? JSON.stringify(dados) : undefined }),
  put: <T>(caminho: string, dados?: unknown) => pedir<T>(caminho, { method: 'PUT', body: dados ? JSON.stringify(dados) : undefined }),
  delete: <T>(caminho: string, dados?: unknown) => pedir<T>(caminho, { method: 'DELETE', body: dados ? JSON.stringify(dados) : undefined }),
};
