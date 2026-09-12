/**
 * O plano de cada organização, do lado do servidor.
 *
 * O catálogo (o que cada plano libera) mora em src/shared/planos.ts e é o
 * mesmo que a Home e as telas usam. Aqui fica só o que o servidor precisa
 * além dele: descobrir o plano da organização da sessão sem ler o banco a
 * cada requisição, e montar a resposta padrão quando o plano não cobre.
 */
import { supabaseServer } from '../lib/supabaseServer';
import { planoEfetivo, planoLibera, cabeMaisUm, mensagemDeRecurso, mensagemDeLimite, planoMinimoPara, type PlanoEfetivo, type Recurso, type Limite } from '../shared/planos';

const CACHE_MS = 60_000;
const cache = new Map<string, { plano: PlanoEfetivo; ate: number }>();

/** Lê o plano da organização — do cache por um minuto, depois do banco. */
export async function planoDaOrg(organizationId: string, agora: number = Date.now()): Promise<PlanoEfetivo> {
  const c = cache.get(organizationId);
  if (c && c.ate > agora) return c.plano;
  const { data, error } = await supabaseServer.from('organizations').select('plano, plano_ate').eq('id', organizationId).maybeSingle();
  if (error) throw error;
  // Plano vencido conta como sem plano — a avaliação. Quando o pagamento
  // existir, é aqui que "vencido" vira "bloqueado".
  const vencido = data?.plano_ate && new Date(data.plano_ate).getTime() < agora;
  const plano = planoEfetivo(vencido ? null : data?.plano);
  cache.set(organizationId, { plano, ate: agora + CACHE_MS });
  return plano;
}

/** Depois de mudar o plano de uma organização, para a próxima leitura ver o novo. */
export function esquecerPlano(organizationId: string) {
  cache.delete(organizationId);
}

/** Para os testes. */
export function limparCacheDePlanos() {
  cache.clear();
}

export interface Negativa {
  status: 402;
  body: { error: string; plano: PlanoEfetivo; plano_minimo: string | null };
}

/** `null` quando o plano libera; senão a resposta pronta (402 Payment Required). */
export function negarRecurso(plano: PlanoEfetivo, recurso: Recurso): Negativa | null {
  if (planoLibera(plano, recurso)) return null;
  return { status: 402, body: { error: mensagemDeRecurso(recurso), plano, plano_minimo: planoMinimoPara(recurso) } };
}

/** `null` quando ainda cabe mais um; senão a resposta pronta. `atual` é quantos já existem. */
export function negarLimite(plano: PlanoEfetivo, limite: Limite, atual: number): Negativa | null {
  if (cabeMaisUm(plano, limite, atual)) return null;
  return { status: 402, body: { error: mensagemDeLimite(plano, limite), plano, plano_minimo: null } };
}
