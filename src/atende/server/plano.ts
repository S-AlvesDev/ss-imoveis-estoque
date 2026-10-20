import type express from 'express';
import { supabaseServer } from '../../lib/supabaseServer';
import { situacaoDaConta } from '../../shared/planos';
import { cabeMaisUmNoAtende, ehCicloAtende, ehPlanoAtende, mensagemDeLimiteAtende, mensagemDeRecursoAtende, planoAtendeLibera, planoAtendeMinimoPara, precoAtende, type CicloAtende, type LimiteAtende, type PlanoAtende, type PlanoAtendeEfetivo, type RecursoAtende } from '../shared/planos';
import type { AssinaturaAtende, ContaAtende, SessaoAtende, SituacaoDaAssinatura } from '../shared/tipos';
import type { RequisicaoAtende } from './auth';
import type { ScopedDb } from '../../server/tenant';
import { mpConfigurado } from '../../server/mercadopago';
import { pagamentosDaEmpresa, avulsoPendenteDaEmpresa } from './cobrancas';

/**
 * O plano da empresa do Atende Aí, do lado do servidor — o espelho de
 * src/server/planos.ts (Stok Aí), com a MESMA regra pura (situacaoDaConta):
 * 7 dias de avaliação com tudo liberado, depois plano, carência de 2 dias.
 *
 * O que muda é só a tabela (`atende_empresas`) e o catálogo
 * (src/atende/shared/planos.ts). Sem a migração 037 no banco, a empresa é
 * tratada como em avaliação sem prazo: nada trava antes de a cobrança existir.
 */

const CACHE_MS = 60_000;
const cache = new Map<string, { conta: ContaAtende; ate: number }>();

const SEM_COBRANCA: ContaAtende = { situacao: 'avaliacao', plano: 'avaliacao', ate: null, dias_restantes: null, renovacao: null };

/** A migração 037 ainda não rodou neste banco? (O erro do PostgREST cita a coluna ou a tabela.) */
const semMigracao = (e: { message?: string } | null | undefined) => Boolean(e?.message && /atende_empresas\.(plano|plano_ate|plano_desde|avaliacao_ate|cobranca)|atende_assinaturas|does not exist|schema cache/.test(e.message));

export async function contaDaEmpresa(empresaId: string, agora: number = Date.now()): Promise<ContaAtende> {
  const c = cache.get(empresaId);
  if (c && c.ate > agora) return c.conta;
  const { data, error } = await supabaseServer.from('atende_empresas').select('plano, plano_ate, avaliacao_ate, cobranca').eq('id', empresaId).maybeSingle();
  if (error) {
    if (semMigracao(error)) return SEM_COBRANCA;
    throw error;
  }
  const s = situacaoDaConta({ plano: data?.plano ?? null, plano_ate: data?.plano_ate ?? null, avaliacao_ate: data?.avaliacao_ate ?? null, cobranca: data?.cobranca ?? null, encerrada_em: null }, new Date(agora));
  // `encerrada` não acontece (encerrada_em é sempre nulo aqui); o tipo do Atende não a tem.
  const conta: ContaAtende = { situacao: s.situacao === 'encerrada' ? 'bloqueada' : s.situacao, plano: s.plano as PlanoAtendeEfetivo, ate: s.ate, dias_restantes: s.dias_restantes, renovacao: s.renovacao };
  cache.set(empresaId, { conta, ate: agora + CACHE_MS });
  return conta;
}

/** Depois de mudar o plano da empresa, para a próxima leitura ver o novo. */
export function esquecerContaAtende(empresaId: string) {
  cache.delete(empresaId);
}

/** Para os testes. */
export function limparCacheDeContasAtende() {
  cache.clear();
}

/** A empresa tem este recurso hoje? (Lido pelo webhook: triagem por IA só com plano que a inclua.) */
export async function empresaTem(empresaId: string, recurso: RecursoAtende): Promise<boolean> {
  return planoAtendeLibera((await contaDaEmpresa(empresaId)).plano, recurso);
}

export interface NegativaAtende {
  status: 402;
  body: { error: string; plano: PlanoAtendeEfetivo; plano_minimo: PlanoAtende | null; bloqueada?: true };
}

/** `null` quando o plano libera; senão a resposta pronta (402 Payment Required). */
export function negarRecursoAtende(conta: ContaAtende, recurso: RecursoAtende): NegativaAtende | null {
  if (planoAtendeLibera(conta.plano, recurso)) return null;
  return { status: 402, body: { error: mensagemDeRecursoAtende(recurso), plano: conta.plano, plano_minimo: planoAtendeMinimoPara(recurso) } };
}

/** `null` quando ainda cabe mais um; senão a resposta pronta. `atual` é quantos já existem. */
export function negarLimiteAtende(conta: ContaAtende, limite: LimiteAtende, atual: number): NegativaAtende | null {
  if (cabeMaisUmNoAtende(conta.plano, limite, atual)) return null;
  return { status: 402, body: { error: mensagemDeLimiteAtende(conta.plano, limite), plano: conta.plano, plano_minimo: null } };
}

/** Rotas que funcionam com a empresa bloqueada: são o caminho de volta (ver o plano, pedir plano, a própria conta). */
const LIVRES_QUANDO_BLOQUEADA = ['/bootstrap', '/me', '/assinatura', '/minha-senha', '/presenca', '/push'];

export interface RequisicaoComPlano extends RequisicaoAtende {
  contaAtende?: ContaAtende;
}

/**
 * Depois do `autenticar`: carrega a conta da empresa em `req.contaAtende` e,
 * bloqueada (avaliação terminou, ou plano vencido além da carência), fecha
 * tudo que não seja o caminho para assinar — como o withTenant do Stok Aí.
 */
export async function carregarConta(req: RequisicaoComPlano, res: express.Response, next: express.NextFunction) {
  try {
    const conta = await contaDaEmpresa(req.sessao!.empresa_id);
    req.contaAtende = conta;
    if (conta.situacao === 'bloqueada' && !LIVRES_QUANDO_BLOQUEADA.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
      return res.status(402).json({ error: 'A avaliação do Atende Aí terminou. Escolha um plano para continuar atendendo.', plano: conta.plano, plano_minimo: null, bloqueada: true });
    }
    next();
  } catch (err: any) {
    console.error('[atende plano] erro:', err.message);
    res.status(500).json({ error: 'Não foi possível conferir o plano da empresa.' });
  }
}

// ---------------------------------------------------------------------------
//  A intenção de contratar
// ---------------------------------------------------------------------------

export class ErroDePlano extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const ASSINATURA_COLUNAS = 'id, plano, ciclo, valor, status, payer_email, proxima_cobranca, created_at, autorizada_em, cancelada_em, combo';

function linhaParaAssinatura(a: any): AssinaturaAtende {
  return { id: a.id, plano: a.plano, ciclo: a.ciclo, valor: Number(a.valor), status: a.status, payer_email: a.payer_email ?? null, proxima_cobranca: a.proxima_cobranca ?? null, created_at: a.created_at, autorizada_em: a.autorizada_em ?? null, cancelada_em: a.cancelada_em ?? null, combo: a.combo ?? null };
}

/** O pedido pendente ou a assinatura em vigor da empresa (a mais recente que não foi cancelada). */
export async function assinaturaDaEmpresa(db: ScopedDb): Promise<AssinaturaAtende | null> {
  const { data, error } = await db.from('atende_assinaturas').select(ASSINATURA_COLUNAS).neq('status', 'cancelada').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    if (semMigracao(error)) return null;
    throw error;
  }
  return data ? linhaParaAssinatura(data) : null;
}

/** Quantas pessoas ativas e setores ativos existem — o uso frente aos limites. */
export async function usoDaEmpresa(db: ScopedDb): Promise<{ atendentes: number; times: number }> {
  const [{ count: atendentes, error: e1 }, { count: times, error: e2 }] = await Promise.all([
    db.from('atende_usuarios').select('id', { count: 'exact', head: true }).eq('ativo', true),
    db.from('atende_times').select('id', { count: 'exact', head: true }).eq('ativo', true),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { atendentes: atendentes ?? 0, times: times ?? 0 };
}

export async function situacaoDaAssinatura(db: ScopedDb, empresaId: string): Promise<SituacaoDaAssinatura> {
  const [conta, assinatura, uso, pagamentos, pendenteAvulso, { data: emp }] = await Promise.all([contaDaEmpresa(empresaId), assinaturaDaEmpresa(db), usoDaEmpresa(db), pagamentosDaEmpresa(db), avulsoPendenteDaEmpresa(db), db.from('atende_empresas').select('faturamento').eq('id', empresaId).maybeSingle()]);
  return { conta, assinatura, uso, pagamento_online: mpConfigurado(), pagamentos, faturamento: (emp?.faturamento as SituacaoDaAssinatura['faturamento']) ?? null, pendente_avulso: pendenteAvulso, avulso_disponivel: mpConfigurado() };
}

/**
 * Registra a intenção de contratar: plano + ciclo, com o preço que a pessoa
 * viu. NÃO cobra — o Atende Aí ainda não tem gateway ligado; a equipe da
 * SEVLA recebe o pedido por e-mail e combina o pagamento. Uma intenção
 * pendente por vez: a anterior (sem id do gateway) sai.
 */
export async function pedirAssinatura(db: ScopedDb, sessao: SessaoAtende, corpo: unknown): Promise<AssinaturaAtende> {
  const b = (corpo ?? {}) as { plano?: unknown; ciclo?: unknown };
  const plano = b.plano;
  const ciclo = b.ciclo ?? 'mensal';
  if (!ehPlanoAtende(plano)) throw new ErroDePlano('Escolha um plano: Essencial, Profissional ou Empresarial.');
  if (!ehCicloAtende(ciclo)) throw new ErroDePlano('Ciclo inválido.');
  const valor = precoAtende(plano, ciclo);
  if (valor === null) throw new ErroDePlano('Este plano ainda não tem preço definido. Fale com a gente.', 409);

  const atual = await assinaturaDaEmpresa(db);
  if (atual && atual.status !== 'pendente') throw new ErroDePlano('Esta empresa já tem uma assinatura em vigor. Para mudar de plano, fale com a gente.', 409);

  const { error: erroDel } = await db.from('atende_assinaturas').delete().eq('status', 'pendente').is('mp_preapproval_id', null);
  if (erroDel) {
    if (semMigracao(erroDel)) throw new ErroDePlano('A contratação ainda não está disponível neste servidor.', 503);
    throw erroDel;
  }
  const { data, error } = await db
    .from('atende_assinaturas')
    .insert({ empresa_id: sessao.empresa_id, plano, ciclo, valor, status: 'pendente', pedido_por: sessao.id, payer_email: sessao.email })
    .select(ASSINATURA_COLUNAS)
    .single();
  if (error) throw error;
  return linhaParaAssinatura(data);
}

export type { PlanoAtende, CicloAtende };
