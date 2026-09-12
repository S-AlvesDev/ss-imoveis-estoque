/**
 * O plano de cada organização, do lado do servidor.
 *
 * O catálogo (o que cada plano libera) mora em src/shared/planos.ts e é o
 * mesmo que a Home e as telas usam. Aqui fica só o que o servidor precisa
 * além dele: descobrir o plano da organização da sessão sem ler o banco a
 * cada requisição, e montar a resposta padrão quando o plano não cobre.
 */
import { supabaseServer } from '../lib/supabaseServer';
import { planoLibera, cabeMaisUm, mensagemDeRecurso, mensagemDeLimite, planoMinimoPara, situacaoDaConta, type Conta, type PlanoEfetivo, type Recurso, type Limite } from '../shared/planos';

const CACHE_MS = 60_000;
const cache = new Map<string, { conta: Conta; ate: number }>();

/**
 * A situação da conta — assinada, em avaliação, em carência ou bloqueada —
 * e o plano que vale. Do cache por um minuto, depois do banco. A regra em
 * si (avaliação de 7 dias, carência de 2) mora em shared/planos.ts.
 */
export async function contaDaOrg(organizationId: string, agora: number = Date.now()): Promise<Conta> {
  const c = cache.get(organizationId);
  if (c && c.ate > agora) return c.conta;
  const { data, error } = await supabaseServer.from('organizations').select('plano, plano_ate, avaliacao_ate').eq('id', organizationId).maybeSingle();
  if (error) throw error;
  const conta = situacaoDaConta({ plano: data?.plano ?? null, plano_ate: data?.plano_ate ?? null, avaliacao_ate: data?.avaliacao_ate ?? null }, new Date(agora));
  cache.set(organizationId, { conta, ate: agora + CACHE_MS });
  return conta;
}

/** Só o plano que vale. */
export async function planoDaOrg(organizationId: string, agora: number = Date.now()): Promise<PlanoEfetivo> {
  return (await contaDaOrg(organizationId, agora)).plano;
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
