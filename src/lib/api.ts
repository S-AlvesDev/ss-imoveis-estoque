import { useAuth } from '@/store/auth';

export class ApiError extends Error {
  constructor(
    message: string,
    /** O código HTTP, para a tela distinguir "não pode" (402/403) de "quebrou" (500). */
    public status = 0,
    /** O corpo que o servidor devolveu, quando houver — ex.: `{ bloqueada: true, conta }`. */
    public body: any = null,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { token } = useAuth.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    useAuth.getState().logout();
    throw new ApiError('Sessão expirada. Faça login novamente.', 401);
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(body?.error || `Erro ${res.status} ao comunicar com o servidor.`, res.status, body);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string, data?: unknown) => request<T>(path, { method: 'DELETE', body: data ? JSON.stringify(data) : undefined }),
};
