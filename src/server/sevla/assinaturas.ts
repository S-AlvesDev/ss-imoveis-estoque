import { supabaseServer } from '../../lib/supabaseServer';
import { CEO } from '../../shared/constants';
import { mpConfigurado, mpPlanId, ErroDoMercadoPago, mensagemParaOPagador } from '../mercadopago';
import { validarPagador } from '../pagador';
import { contaDe, assinaturaAtual, pagamentosDe, avulsoPendente, atualizarAvulso, iniciarAssinatura, criarAvulso, cancelarAssinatura, ErroDeAssinatura, type Assinatura, type Pagamento } from '../assinaturas';
import { ehPlano, CICLOS, precoDo, type Ciclo, type Plano } from '../../shared/planos';
import { contaDaEmpresa, assinaturaDaEmpresa, ErroDePlano } from '../../atende/server/plano';
import { iniciarAssinaturaAtende, cancelarAssinaturaAtende, criarAvulsoAtende, avulsoPendenteAtende, atualizarAvulsoAtende, type PagamentoAvulsoAtende } from '../../atende/server/mercadopago';
import { pagamentosDaEmpresa } from '../../atende/server/cobrancas';
import { dbDaEmpresa } from '../../atende/server/tenant';
import { ehPlanoAtende, ehCicloAtende, precoDoPeriodoAtende, type PlanoAtende, type CicloAtende } from '../../atende/shared/planos';
import { acessosDaConta, ErroDaSevla } from './identidade';
import type { ContaSevla, ProdutoSevla } from '../../shared/sevla';

/**
 * As assinaturas dos dois produtos, vistas e geridas pela Minha SEVLA.
 *
 * Nada aqui inventa um terceiro caixa: o Stok Aí continua cobrando em
 * `assinaturas`/`pagamentos` e o Atende Aí em `atende_assinaturas`/
 * `atende_pagamentos`, com as mesmas funções que as telas de cada produto
 * usam. A SEVLA só junta as portas — e confere, em cada produto, se a
 * pessoa pode mexer na cobrança (CEO no Stok; administrador no Atende).
 *
 * Combo = os dois produtos no mesmo plano. Como a tabela de preços é a soma
 * (sem desconto), o combo é uma conveniência: um pedido dispara os dois —
 * dois checkouts (cartão) ou dois Pix/boletos, um por produto, cada um com
 * o próprio recibo e nota.
 */

export const COMBOS = [
  { id: 'essencial', nome: 'Combo Essencial', stok: 'essencial' as Plano, atende: 'essencial' as PlanoAtende },
  { id: 'profissional', nome: 'Combo Profissional', stok: 'profissional' as Plano, atende: 'profissional' as PlanoAtende },
  { id: 'empresarial', nome: 'Combo Empresarial', stok: 'empresarial' as Plano, atende: 'empresarial' as PlanoAtende },
] as const;

export type Metodo = 'cartao' | 'pix' | 'boleto';

export interface LadoDoProduto<A, P> {
  /** A pessoa participa deste produto nesta empresa. */
  acesso: boolean;
  /** …e pode mexer na cobrança (CEO no Stok, administrador no Atende). */
  gerencia: boolean;
  papel: string | null;
  conta: unknown | null;
  assinatura: A | null;
  pagamentos: P[];
  pendente_avulso: P | null;
}

export interface EmpresaNasAssinaturas {
  organization_id: string;
  organizacao: string;
  stok: LadoDoProduto<Assinatura, Pagamento> | null;
  atende: (LadoDoProduto<Awaited<ReturnType<typeof assinaturaDaEmpresa>>, PagamentoAvulsoAtende> & { empresa_id: string }) | null;
}

export interface AssinaturasDaSevla {
  empresas: EmpresaNasAssinaturas[];
  pagamento_online: boolean;
  /** Por produto e ciclo, se dá para assinar com cartão agora. */
  cartao: { stok: Record<Ciclo, boolean>; atende: Record<CicloAtende, boolean> };
  combos: Array<{ id: string; nome: string; stok: Plano; atende: PlanoAtende; mensal: number | null; anual: number | null }>;
}

/** O que a conta vê: cada empresa em que participa de algum produto, com o lado de cada produto. */
export async function assinaturasDaSevla(conta: ContaSevla): Promise<AssinaturasDaSevla> {
  const acessos = await acessosDaConta(conta.id);
  const porOrg = new Map<string, EmpresaNasAssinaturas>();
  for (const a of acessos) {
    const e = porOrg.get(a.organization_id) ?? { organization_id: a.organization_id, organizacao: a.organizacao, stok: null, atende: null };
    if (a.produto === 'stok') {
      const org = await contaDe(a.organization_id);
      const [assinatura, pagamentos, pendente] = await Promise.all([assinaturaAtual(a.organization_id), pagamentosDe(a.organization_id, 6), avulsoPendente(a.organization_id)]);
      e.stok = { acesso: true, gerencia: a.papel === CEO, papel: a.papel, conta: org?.conta ?? null, assinatura, pagamentos, pendente_avulso: pendente };
    } else if (a.empresa_id) {
      const db = dbDaEmpresa(a.empresa_id);
      const [c, assinatura, pagamentos, pendente] = await Promise.all([contaDaEmpresa(a.empresa_id), assinaturaDaEmpresa(db), pagamentosDaEmpresa(db, 6), avulsoPendenteAtende(a.empresa_id)]);
      e.atende = { acesso: true, gerencia: a.papel === 'admin', papel: a.papel, conta: c, assinatura, pagamentos: pagamentos as PagamentoAvulsoAtende[], pendente_avulso: pendente, empresa_id: a.empresa_id };
    }
    porOrg.set(a.organization_id, e);
  }
  return {
    empresas: [...porOrg.values()],
    pagamento_online: mpConfigurado(),
    cartao: {
      stok: Object.fromEntries(CICLOS.map((c) => [c, mpConfigurado() || (['essencial', 'profissional', 'empresarial'] as Plano[]).some((p) => mpPlanId(p, c))])) as Record<Ciclo, boolean>,
      atende: { mensal: mpConfigurado(), anual: mpConfigurado() },
    },
    combos: COMBOS.map((c) => ({
      id: c.id,
      nome: c.nome,
      stok: c.stok,
      atende: c.atende,
      mensal: somar(precoDo(c.stok, 'mensal'), precoDoPeriodoAtende(c.atende, 'mensal')),
      anual: somar(precoDo(c.stok, 'anual'), precoDoPeriodoAtende(c.atende, 'anual')),
    })),
  };
}

const somar = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round((a + b) * 100) / 100);

async function acessoEm(conta: ContaSevla, organizationId: string, produto: ProdutoSevla) {
  const acesso = (await acessosDaConta(conta.id)).find((a) => a.produto === produto && a.organization_id === organizationId);
  if (!acesso) throw new ErroDaSevla(`Você não participa desta empresa no ${produto === 'stok' ? 'Stok Aí' : 'Atende Aí'}.`, 403, 'sem_acesso');
  if (produto === 'stok' && acesso.papel !== CEO) throw new ErroDaSevla('No Stok Aí, só o titular (CEO) mexe na assinatura.', 403, 'sem_acesso');
  if (produto === 'atende' && acesso.papel !== 'admin') throw new ErroDaSevla('No Atende Aí, só o administrador mexe na assinatura.', 403, 'sem_acesso');
  return acesso;
}

export type ResultadoDeAssinar = { produto: ProdutoSevla; metodo: 'cartao'; url: string } | { produto: ProdutoSevla; metodo: 'pix' | 'boleto'; pagamento: Pagamento | PagamentoAvulsoAtende };

/**
 * Assina (ou troca) um produto para uma empresa: com cartão devolve a URL
 * do checkout do Mercado Pago; com Pix/boleto devolve o pedido com o QR
 * Code / linha digitável. Cada produto usa o próprio caminho.
 */
export async function assinarPelaSevla(conta: ContaSevla, corpo: unknown): Promise<ResultadoDeAssinar> {
  const b = (corpo ?? {}) as Record<string, unknown>;
  const organizationId = String(b.organization_id ?? '');
  const produto = b.produto;
  const metodo = (b.metodo ?? 'cartao') as Metodo;
  const ciclo = String(b.ciclo ?? 'mensal');
  if (produto !== 'stok' && produto !== 'atende') throw new ErroDaSevla('Produto desconhecido.', 400, 'invalido');
  if (!['cartao', 'pix', 'boleto'].includes(metodo)) throw new ErroDaSevla('Meio de pagamento inválido.', 400, 'invalido');
  const acesso = await acessoEm(conta, organizationId, produto);
  const pagador = metodo === 'cartao' ? null : validarPagador(b.pagador, metodo);
  if (pagador && !pagador.ok) throw new ErroDaSevla(pagador.erro, 400, 'invalido');

  try {
    if (produto === 'stok') {
      const plano = b.plano;
      if (!ehPlano(plano) || !CICLOS.includes(ciclo as Ciclo)) throw new ErroDaSevla('Escolha o plano e o ciclo.', 400, 'invalido');
      if (metodo === 'cartao') {
        if (!mpPlanId(plano, ciclo as Ciclo) && !mpConfigurado()) throw new ErroDaSevla('Pagamento com cartão não configurado para este ciclo.', 503, 'indisponivel');
        const r = await iniciarAssinatura({ organizationId, plano, ciclo: ciclo as Ciclo, payerEmail: conta.email, trocar: b.trocar === true });
        return { produto, metodo, url: r.url };
      }
      if (!mpConfigurado()) throw new ErroDaSevla('Pix e boleto não configurados neste servidor.', 503, 'indisponivel');
      const pedido = await criarAvulso({ organizationId, plano, ciclo: ciclo as Ciclo, metodo, pagador: pagador!.ok ? pagador!.pagador : (null as never), valor: precoDo(plano, ciclo as Ciclo) });
      return { produto, metodo, pagamento: pedido };
    }
    const plano = b.plano;
    if (!ehPlanoAtende(plano) || !ehCicloAtende(ciclo)) throw new ErroDaSevla('Escolha o plano e o ciclo.', 400, 'invalido');
    const empresaId = acesso.empresa_id!;
    const db = dbDaEmpresa(empresaId);
    const sessao = { id: acesso.usuario_id, nome: acesso.nome, email: conta.email, papel: 'admin' as const, empresa_id: empresaId };
    if (metodo === 'cartao') {
      const r = await iniciarAssinaturaAtende(db, sessao, { plano, ciclo, trocar: b.trocar === true });
      return { produto, metodo, url: r.url };
    }
    const pedido = await criarAvulsoAtende({ empresaId, plano, ciclo, metodo, pagador: pagador!.ok ? pagador!.pagador : (null as never), pedidoPor: acesso.usuario_id });
    return { produto, metodo, pagamento: pedido };
  } catch (e) {
    throw traduzir(e);
  }
}

export async function cancelarPelaSevla(conta: ContaSevla, corpo: unknown): Promise<void> {
  const b = (corpo ?? {}) as Record<string, unknown>;
  const organizationId = String(b.organization_id ?? '');
  const produto = b.produto;
  if (produto !== 'stok' && produto !== 'atende') throw new ErroDaSevla('Produto desconhecido.', 400, 'invalido');
  const acesso = await acessoEm(conta, organizationId, produto);
  try {
    if (produto === 'stok') await cancelarAssinatura(organizationId);
    else await cancelarAssinaturaAtende(dbDaEmpresa(acesso.empresa_id!), acesso.empresa_id!);
  } catch (e) {
    throw traduzir(e);
  }
}

/** Um Pix/boleto pendente: confere no MP e devolve como está — para a tela que espera o pagamento cair. */
export async function conferirAvulsoPelaSevla(conta: ContaSevla, produto: unknown, organizationId: string, pagamentoId: string): Promise<Pagamento | PagamentoAvulsoAtende | null> {
  if (produto !== 'stok' && produto !== 'atende') throw new ErroDaSevla('Produto desconhecido.', 400, 'invalido');
  const acesso = (await acessosDaConta(conta.id)).find((a) => a.produto === produto && a.organization_id === organizationId);
  if (!acesso) throw new ErroDaSevla('Você não participa desta empresa neste produto.', 403, 'sem_acesso');
  try {
    if (produto === 'stok') {
      const { data } = await supabaseServer.from('pagamentos').select('*').eq('id', pagamentoId).eq('organization_id', organizationId).maybeSingle();
      if (!data) return null;
      const p = data as Pagamento;
      return p.status === 'pendente' && p.mp_payment_id && mpConfigurado() ? atualizarAvulso(p) : p;
    }
    const { data } = await supabaseServer.from('atende_pagamentos').select('id, status, valor, moeda, detalhe, data, metodo, plano, ciclo, periodo_de, periodo_ate, mp_payment_id, nf_status, nf_numero, nf_url, recibo_enviado_em, vence_em, dados').eq('id', pagamentoId).eq('empresa_id', acesso.empresa_id!).maybeSingle();
    if (!data) return null;
    const p = data as PagamentoAvulsoAtende;
    return p.status === 'pendente' && p.mp_payment_id ? atualizarAvulsoAtende(p) : p;
  } catch (e) {
    throw traduzir(e);
  }
}

/** Os erros dos produtos e do MP viram erros da SEVLA, com a frase certa para a tela. */
function traduzir(e: unknown): unknown {
  if (e instanceof ErroDaSevla) return e;
  if (e instanceof ErroDeAssinatura) return new ErroDaSevla(e.message, e.status, 'invalido');
  if (e instanceof ErroDePlano) return new ErroDaSevla(e.message, e.status, 'invalido');
  if (e instanceof ErroDoMercadoPago) return new ErroDaSevla(mensagemParaOPagador(e), 402, 'invalido');
  return e;
}
