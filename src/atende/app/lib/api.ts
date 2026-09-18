import { useSessaoAtende } from '../store/sessao';

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

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const { token } = useSessaoAtende.getState();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opcoes.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${caminho}`, { ...opcoes, headers });
  if (res.status === 401) {
    useSessaoAtende.getState().sair();
    throw new ErroDaApi('Sessão expirada. Entre novamente.', 401);
  }
  const ehJson = res.headers.get('content-type')?.includes('application/json');
  const body = ehJson ? await res.json().catch(() => null) : null;
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
