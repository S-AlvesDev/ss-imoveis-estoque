import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

// Modo RLS: chave anônima + segredo do JWT. O módulo lê o ambiente na carga,
// então tudo isto vem antes do import.
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
process.env.SUPABASE_ANON_KEY = 'chave-anonima';
process.env.SUPABASE_JWT_SECRET = 'segredo-do-postgrest';

// Um id só deste arquivo: o cache de clientes é do módulo, e outro teste com o mesmo id (em outro modo) poderia deixar uma entrada para trás.
const ORG = '5e7e0000-0000-4000-8000-000000000aa1';

let tenant: typeof import('./tenant');
beforeAll(async () => {
  tenant = await import('./tenant');
});

/** O token que a consulta vai mandar ao PostgREST. */
function tokenDe(db: ReturnType<typeof tenant.scopedDb>): { exp: number; iat: number; organization_id: string } {
  const headers = (db.raw as any).headers ?? (db.raw as any).rest?.headers ?? {};
  const auth: string = headers.Authorization ?? headers.authorization ?? (db.raw as any).rest?.headers?.get?.('Authorization');
  return jwt.verify(String(auth).replace(/^Bearer /, ''), 'segredo-do-postgrest') as any;
}

describe('modo RLS — o token do PostgREST vence, o cliente não pode ficar para sempre', () => {
  it('assina um token de 1 hora para a organização', () => {
    expect(tenant.RLS_ATIVO).toBe(true);
    const agora = Date.now();
    const t = tokenDe(tenant.scopedDb(ORG, agora));
    expect(t.organization_id).toBe(ORG);
    // iat dois minutos no passado; exp uma hora depois do iat.
    expect(t.iat).toBe(Math.floor(agora / 1000) - 120);
    expect(t.exp - t.iat).toBe(tenant.TOKEN_VALIDADE_S);
  });

  it('reaproveita o cliente dentro do prazo e refaz antes de vencer', () => {
    // Aconteceu em produção: instância quente há mais de uma hora mandando
    // token vencido — "JWT expired" em todas as consultas, /api/data em 500.
    const t0 = Date.now();
    const primeiro = tenant.scopedDb(ORG, t0).raw;
    expect(tenant.scopedDb(ORG, t0 + 30 * 60_000).raw).toBe(primeiro); // 30 min: o mesmo
    const renovarEm = tenant.renovacaoDoCliente(ORG)!;
    expect(renovarEm).toBe((Math.floor(t0 / 1000) - 120 + tenant.TOKEN_VALIDADE_S - tenant.TOKEN_FOLGA_S) * 1000);
    expect(renovarEm).toBeLessThan(t0 + 60 * 60_000); // sempre antes de uma hora
    const depois = tenant.scopedDb(ORG, renovarEm + 1).raw;
    expect(depois).not.toBe(primeiro);
    // O novo token vale a partir de agora, não do início da instância.
    const t = tokenDe(tenant.scopedDb(ORG, renovarEm + 1));
    expect(t.exp * 1000).toBeGreaterThan(renovarEm + 50 * 60_000);
  });
});
