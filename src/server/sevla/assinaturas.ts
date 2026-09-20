import { supabaseServer } from '../../lib/supabaseServer';
import { CEO } from '../../shared/constants';
import { mpConfigurado, mpPlanId } from '../mercadopago';
import { validarPagador } from '../pagador';
import { contaDe, assinaturaAtual, pagamentosDe, avulsoPendente, atualizarAvulso, iniciarAssinatura, criarAvulso, cancelarAssinatura, type Assinatura, type Pagamento } from '../assinaturas';
import { ehPlano, CICLOS, precoDo, type Ciclo, type Plano } from '../../shared/planos';
import { contaDaEmpresa, assinaturaDaEmpresa } from '../../atende/server/plano';
import { iniciarAssinaturaAtende, cancelarAssinaturaAtende, criarAvulsoAtende, avulsoPendenteAtende, atualizarAvulsoAtende, type PagamentoAvulsoAtende } from '../../atende/server/mercadopago';
import { pagamentosDaEmpresa } from '../../atende/server/cobrancas';
import { dbDaEmpresa } from '../../atende/server/tenant';
import { ehPlanoAtende, ehCicloAtende, type CicloAtende } from '../../atende/shared/planos';
import { acessosDaConta, ErroDaSevla } from './identidade';
import { acessoEm, traduzir } from './comum';
import { catalogoDeCombos, comboPendente, acertarCombo, type ComboNoCatalogo, type PagamentoCombo } from './combos';
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
 * Os combos (os dois produtos com desconto) ficam em `combos.ts`.
 */

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
  /** O Pix/boleto único de um combo ainda aguardando pagamento. */
  combo_pendente: PagamentoCombo | null;
}

export interface AssinaturasDaSevla {
  empresas: EmpresaNasAssinaturas[];
  pagamento_online: boolean;
  /** Por produto e ciclo, se dá para assinar com cartão agora. */
  cartao: { stok: Record<Ciclo, boolean>; atende: Record<CicloAtende, boolean> };
  combos: ComboNoCatalogo[];
}

/** O que a conta vê: cada empresa em que participa de algum produto, com o lado de cada produto. */
export async function assinaturasDaSevla(conta: ContaSevla): Promise<AssinaturasDaSevla> {
  const acessos = await acessosDaConta(conta.id);
  const porOrg = new Map<string, EmpresaNasAssinaturas>();
  for (const a of acessos) {
    const e = porOrg.get(a.organization_id) ?? { organization_id: a.organization_id, organizacao: a.organizacao, stok: null, atende: null, combo_pendente: null };
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
  for (const e of porOrg.values()) {
    if (!e.stok || !e.atende) continue;
    // O Pix/boleto único de um combo aparece uma vez só, no alto da empresa — não como dois pedidos soltos.
    e.combo_pendente = await comboPendente(e.stok.pendente_avulso, e.atende.empresa_id).catch(() => null);
    // Um dos dois foi cancelado ou trocado por fora? O outro volta ao preço cheio. Nunca derruba a tela.
    if (e.stok.gerencia && e.atende.gerencia) await acertarCombo(e.organization_id).catch((err) => console.warn('[sevla combo] acertar ao carregar:', err.message));
  }
  return {
    empresas: [...porOrg.values()],
    pagamento_online: mpConfigurado(),
    cartao: {
      stok: Object.fromEntries(CICLOS.map((c) => [c, mpConfigurado() || (['essencial', 'profissional', 'empresarial'] as Plano[]).some((p) => mpPlanId(p, c))])) as Record<Ciclo, boolean>,
      atende: { mensal: mpConfigurado(), anual: mpConfigurado() },
    },
    combos: catalogoDeCombos(),
  };
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
  // Era metade de um combo? O outro produto volta ao preço cheio na renovação seguinte.
  await acertarCombo(organizationId).catch((err) => console.warn('[sevla combo] acertar ao cancelar:', err.message));
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

