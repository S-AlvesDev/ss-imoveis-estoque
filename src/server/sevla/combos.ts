import { supabaseServer } from '../../lib/supabaseServer';
import { mpConfigurado, criarPagamentoAvulso, buscarPagamento, dadosParaPagar, atualizarValor, cancelarAssinatura as cancelarNoMp, motivo as motivoDoStok, type PagamentoMp, type PagadorAvulso } from '../mercadopago';
import { validarPagador } from '../pagador';
import { iniciarAssinatura, aplicarPagamentoAvulso, traduzirStatusDePagamento, type Assinatura, type Pagamento, type ResultadoDeAplicacao } from '../assinaturas';
import { esquecerPlano } from '../planos';
import { precoDo, CICLOS, PIX_VALIDADE_HORAS, BOLETO_VALIDADE_DIAS, NOME_DO_CICLO, type Ciclo, type Plano } from '../../shared/planos';
import { iniciarAssinaturaAtende, aplicarPagamentoAvulsoAtende, motivoAtende, type PagamentoAvulsoAtende } from '../../atende/server/mercadopago';
import { esquecerContaAtende } from '../../atende/server/plano';
import { dbDaEmpresa } from '../../atende/server/tenant';
import { precoAtende, precoDoPeriodoAtende, type PlanoAtende, type CicloAtende } from '../../atende/shared/planos';
import { COMBO_DESCONTO, NOME_DO_COMBO, comDescontoDoCombo, type ContaSevla, type ProdutoSevla } from '../../shared/sevla';
import { ErroDaSevla } from './identidade';
import { acessoEm, traduzir } from './comum';

/**
 * Combos: Stok Aí + Atende Aí no mesmo plano, com 5% de desconto em cada
 * produto.
 *
 * Nada aqui inventa um terceiro caixa. Cada produto continua cobrando no
 * próprio (assinaturas/pagamentos no Stok; atende_assinaturas/
 * atende_pagamentos no Atende), com o próprio recibo e a própria nota — a
 * única diferença é o valor, já com o desconto, e o carimbo `combo` na
 * linha.
 *
 *  - Cartão: duas assinaturas no Mercado Pago (uma por produto, cada uma
 *    já com o desconto), as duas criadas pela API — o plano do painel tem
 *    preço fixo, e não serviria. O desconto vale enquanto as duas estão em
 *    vigor: cancelada ou trocada uma, a outra volta ao preço cheio na
 *    renovação seguinte (`acertarCombo`, chamado pelo webhook, pelo cancelar
 *    e pela rotina diária). Um checkout começado e nunca concluído conta
 *    como desistência depois de 48 h.
 *  - Pix/boleto: UM pagamento só, com o total; cada produto guarda a própria
 *    parte como pedido, os dois com o mesmo id de pagamento do MP. Quando
 *    cai, cada um aplica o próprio período.
 */

export const COMBOS = [
  { id: 'essencial', nome: 'Combo Essencial', stok: 'essencial', atende: 'essencial' },
  { id: 'profissional', nome: 'Combo Profissional', stok: 'profissional', atende: 'profissional' },
  { id: 'empresarial', nome: 'Combo Empresarial', stok: 'empresarial', atende: 'empresarial' },
] as const satisfies ReadonlyArray<{ id: string; nome: string; stok: Plano; atende: PlanoAtende }>;

export type Combo = (typeof COMBOS)[number];
export type ComboId = Combo['id'];
export type MetodoDoCombo = 'cartao' | 'pix' | 'boleto';

/** A referência que vai no pagamento único do Pix/boleto: `sevla-combo:<pedido do Stok>:<pedido do Atende>`. */
export const REF_COMBO = 'sevla-combo:';

/** Quanto tempo um checkout de cartão começado e não concluído ainda segura o desconto do outro produto. */
export const ESPERA_DO_CHECKOUT_MS = 48 * 3600_000;

export function comboDe(id: unknown): Combo | null {
  return COMBOS.find((c) => c.id === id) ?? null;
}

const centavos = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface PrecosDoCombo {
  /** A parte de cada produto, já com o desconto. */
  stok: number;
  atende: number;
  /** As duas partes somadas. */
  total: number;
  /** A soma sem desconto (a tabela de cada produto). */
  cheio: number;
  economia: number;
}

/** Os preços de um combo num ciclo — nulo quando um dos produtos ainda não tem preço. */
export function precosDoCombo(combo: Combo, ciclo: Ciclo): PrecosDoCombo | null {
  const cheioStok = precoDo(combo.stok, ciclo);
  const cheioAtende = precoDoPeriodoAtende(combo.atende, ciclo);
  if (cheioAtende === null) return null;
  const stok = comDescontoDoCombo(cheioStok);
  const atende = comDescontoDoCombo(cheioAtende);
  return { stok, atende, total: centavos(stok + atende), cheio: centavos(cheioStok + cheioAtende), economia: centavos(cheioStok + cheioAtende - stok - atende) };
}

/** "Stok Aí — Profissional (mensal) · combo SEVLA": a fatura do cartão e o painel do MP, por produto. */
export function motivoDoCombo(produto: ProdutoSevla, combo: Combo, ciclo: Ciclo): string {
  return `${produto === 'stok' ? motivoDoStok(combo.stok, ciclo) : motivoAtende(combo.atende, ciclo)} · ${NOME_DO_COMBO}`;
}

/** "SEVLA — Combo Profissional: Stok Aí + Atende Aí (mensal)": o Pix/boleto único. */
export function descricaoDoCombo(combo: Combo, ciclo: Ciclo): string {
  return `SEVLA — ${combo.nome}: Stok Aí + Atende Aí (${NOME_DO_CICLO[ciclo].toLowerCase()})`;
}

export interface ComboNoCatalogo {
  id: ComboId;
  nome: string;
  stok: Plano;
  atende: PlanoAtende;
  desconto: number;
  precos: Record<Ciclo, PrecosDoCombo | null>;
}

/** Os combos com preço, para a tela. */
export function catalogoDeCombos(): ComboNoCatalogo[] {
  return COMBOS.map((c) => ({ id: c.id, nome: c.nome, stok: c.stok, atende: c.atende, desconto: COMBO_DESCONTO, precos: { mensal: precosDoCombo(c, 'mensal'), anual: precosDoCombo(c, 'anual') } }));
}

// ---------------------------------------------------------------------------
//  Assinar o combo
// ---------------------------------------------------------------------------

export interface PagamentoCombo {
  /** O id do pagamento no Mercado Pago — um só para os dois produtos; a tela consulta por ele. */
  id: string;
  combo: ComboId;
  metodo: 'pix' | 'boleto';
  status: Pagamento['status'];
  /** O total do Pix/boleto (as duas partes). */
  valor: number;
  ciclo: Ciclo;
  vence_em: string | null;
  dados: Record<string, string | null> | null;
  stok: Pagamento;
  atende: PagamentoAvulsoAtende;
}

export type ResultadoDoCombo = { metodo: 'cartao'; combo: ComboId; checkouts: Array<{ produto: ProdutoSevla; url: string }> } | { metodo: 'pix' | 'boleto'; combo: ComboId; pagamento: PagamentoCombo };

/**
 * Assina o combo para uma empresa. Quem pede precisa mandar na cobrança dos
 * dois produtos nela (CEO no Stok, administrador no Atende). Com cartão
 * devolve os dois checkouts do Mercado Pago; com Pix/boleto, o pagamento
 * único com o QR Code / linha digitável.
 */
export async function assinarCombo(conta: ContaSevla, corpo: unknown): Promise<ResultadoDoCombo> {
  const b = (corpo ?? {}) as Record<string, unknown>;
  const organizationId = String(b.organization_id ?? '');
  const combo = comboDe(b.combo);
  const ciclo = String(b.ciclo ?? 'mensal') as Ciclo;
  const metodo = (b.metodo ?? 'cartao') as MetodoDoCombo;
  const trocar = b.trocar === true;
  if (!combo) throw new ErroDaSevla('Escolha o combo: Essencial, Profissional ou Empresarial.', 400, 'invalido');
  if (!CICLOS.includes(ciclo)) throw new ErroDaSevla('Escolha o ciclo: mensal ou anual.', 400, 'invalido');
  if (!['cartao', 'pix', 'boleto'].includes(metodo)) throw new ErroDaSevla('Meio de pagamento inválido.', 400, 'invalido');
  const [, atendeAcesso] = await Promise.all([acessoEm(conta, organizationId, 'stok'), acessoEm(conta, organizationId, 'atende')]);
  if (!mpConfigurado()) throw new ErroDaSevla('Pagamento online não configurado neste servidor.', 503, 'indisponivel');
  const precos = precosDoCombo(combo, ciclo);
  if (!precos) throw new ErroDaSevla('Este combo ainda não tem preço definido.', 409, 'invalido');
  const empresaId = atendeAcesso.empresa_id!;
  const pagador = metodo === 'cartao' ? null : validarPagador(b.pagador, metodo);
  if (pagador && !pagador.ok) throw new ErroDaSevla(pagador.erro, 400, 'invalido');

  try {
    if (metodo === 'cartao') {
      const stok = await iniciarAssinatura({ organizationId, plano: combo.stok, ciclo, payerEmail: conta.email, trocar, combo: { id: combo.id, valor: precos.stok, motivo: motivoDoCombo('stok', combo, ciclo) } });
      let atende: Awaited<ReturnType<typeof iniciarAssinaturaAtende>>;
      try {
        const sessao = { id: atendeAcesso.usuario_id, nome: atendeAcesso.nome, email: conta.email, papel: 'admin' as const, empresa_id: empresaId };
        atende = await iniciarAssinaturaAtende(dbDaEmpresa(empresaId), sessao, { plano: combo.atende, ciclo, trocar }, { combo: { id: combo.id, valor: precos.atende, motivo: motivoDoCombo('atende', combo, ciclo) } });
      } catch (e) {
        await desistirDaIntencaoDoStok(stok.assinatura);
        throw e;
      }
      return {
        metodo,
        combo: combo.id,
        checkouts: [
          { produto: 'stok', url: stok.url },
          { produto: 'atende', url: atende.url },
        ],
      };
    }
    const pagamento = await criarAvulsoCombo({ organizationId, empresaId, combo, ciclo, metodo, pagador: pagador!.ok ? pagador!.pagador : (null as never), precos });
    return { metodo, combo: combo.id, pagamento };
  } catch (e) {
    throw traduzir(e);
  }
}

/** O Atende não conseguiu: a intenção do Stok (pendente no MP, com desconto) não pode ficar — sai do MP e daqui. */
async function desistirDaIntencaoDoStok(a: Assinatura): Promise<void> {
  try {
    if (a.mp_preapproval_id) await cancelarNoMp(a.mp_preapproval_id);
    await supabaseServer.from('assinaturas').delete().eq('id', a.id).eq('status', 'pendente');
  } catch (e: any) {
    console.error('[sevla combo] não desfez a intenção do Stok Aí:', e.message);
  }
}

function montarCombo(stok: Pagamento, atende: PagamentoAvulsoAtende): PagamentoCombo {
  return {
    id: String(stok.mp_payment_id),
    combo: stok.combo as ComboId,
    metodo: stok.metodo as 'pix' | 'boleto',
    status: stok.status,
    valor: centavos(Number(stok.valor) + Number(atende.valor)),
    ciclo: (stok.ciclo ?? 'mensal') as Ciclo,
    vence_em: stok.vence_em,
    dados: stok.dados,
    stok,
    atende,
  };
}

/**
 * Um Pix/boleto para os dois produtos: cada um guarda a própria parte como
 * pedido pendente; o pagamento no MP é um só, com o total, e o id dele vai
 * nos dois pedidos — é por ele que cada produto acha o seu quando cai.
 */
async function criarAvulsoCombo(args: { organizationId: string; empresaId: string; combo: Combo; ciclo: Ciclo; metodo: 'pix' | 'boleto'; pagador: PagadorAvulso; precos: PrecosDoCombo }): Promise<PagamentoCombo> {
  const { combo, ciclo, metodo, pagador, precos } = args;
  const agora = new Date();
  const venceEm = metodo === 'pix' ? new Date(agora.getTime() + PIX_VALIDADE_HORAS * 3600_000) : new Date(agora.getTime() + BOLETO_VALIDADE_DIAS * 24 * 3600_000);

  // Um pedido pendente por vez em cada produto (como cada um faz sozinho): os anteriores sem id do MP saem.
  await supabaseServer.from('pagamentos').delete().eq('organization_id', args.organizationId).eq('status', 'pendente').neq('metodo', 'cartao').is('mp_payment_id', null);
  await supabaseServer.from('atende_pagamentos').delete().eq('empresa_id', args.empresaId).eq('status', 'pendente').neq('metodo', 'cartao').is('mp_payment_id', null);

  // A descrição de cada parte explica o valor menor e o pagamento único — é o que a tela de cada produto mostra.
  const nota = `${NOME_DO_COMBO} (${COMBO_DESCONTO}% de desconto) — o ${metodo === 'pix' ? 'Pix' : 'boleto'} é um só, de ${brl(precos.total)}, junto com o`;
  const comum = { metodo, ciclo, status: 'pendente', vence_em: venceEm.toISOString(), pagador, data: agora.toISOString(), combo: combo.id };
  const { data: doStok, error: e1 } = await supabaseServer
    .from('pagamentos')
    .insert({ ...comum, organization_id: args.organizationId, plano: combo.stok, valor: precos.stok, descricao: `${motivoDoStok(combo.stok, ciclo)} · ${nota} Atende Aí` })
    .select('*')
    .single();
  if (e1) throw e1;
  const { data: doAtende, error: e2 } = await supabaseServer
    .from('atende_pagamentos')
    .insert({ ...comum, empresa_id: args.empresaId, plano: combo.atende, valor: precos.atende, descricao: `${motivoAtende(combo.atende, ciclo)} · ${nota} Stok Aí` })
    .select('*')
    .single();
  if (e2) {
    await supabaseServer.from('pagamentos').delete().eq('id', doStok.id);
    throw e2;
  }

  let pay: PagamentoMp;
  try {
    pay = await criarPagamentoAvulso({ metodo, valor: precos.total, descricao: descricaoDoCombo(combo, ciclo), referencia: `${REF_COMBO}${doStok.id}:${doAtende.id}`, pagador, venceEm, idempotencia: doStok.id });
  } catch (e) {
    await supabaseServer.from('pagamentos').delete().eq('id', doStok.id);
    await supabaseServer.from('atende_pagamentos').delete().eq('id', doAtende.id);
    throw e;
  }
  const patch = { mp_payment_id: String(pay.id), status: traduzirStatusDePagamento(pay.status), detalhe: pay.status_detail ?? null, dados: dadosParaPagar(pay), vence_em: pay.date_of_expiration ?? venceEm.toISOString(), updated_at: new Date().toISOString() };
  const [{ data: s, error: e3 }, { data: a, error: e4 }] = await Promise.all([supabaseServer.from('pagamentos').update(patch).eq('id', doStok.id).select('*').single(), supabaseServer.from('atende_pagamentos').update(patch).eq('id', doAtende.id).select('*').single()]);
  if (e3) throw e3;
  if (e4) throw e4;
  return montarCombo(s as Pagamento, a as PagamentoAvulsoAtende);
}

// ---------------------------------------------------------------------------
//  O pagamento único: consultar e aplicar
// ---------------------------------------------------------------------------

async function lerCombo(organizationId: string, empresaId: string, mpPaymentId: string): Promise<PagamentoCombo | null> {
  const [{ data: s }, { data: a }] = await Promise.all([
    supabaseServer.from('pagamentos').select('*').eq('organization_id', organizationId).eq('mp_payment_id', mpPaymentId).not('combo', 'is', null).maybeSingle(),
    supabaseServer.from('atende_pagamentos').select('*').eq('empresa_id', empresaId).eq('mp_payment_id', mpPaymentId).maybeSingle(),
  ]);
  if (!s || !a) return null;
  return montarCombo(s as Pagamento, a as PagamentoAvulsoAtende);
}

/** O Pix/boleto do combo ainda pendente (o pedido do Stok que a tela já achou, mais a parte do Atende). */
export async function comboPendente(pendenteDoStok: Pagamento | null, empresaId: string): Promise<PagamentoCombo | null> {
  if (!pendenteDoStok?.combo || !pendenteDoStok.mp_payment_id) return null;
  return lerCombo(pendenteDoStok.organization_id, empresaId, pendenteDoStok.mp_payment_id);
}

/** As duas partes acham o próprio pedido pelo id do pagamento e aplicam o próprio período; cada uma cuida do próprio recibo. */
async function aplicarPagamentoDoCombo(pay: PagamentoMp): Promise<ResultadoDeAplicacao> {
  const stok = await aplicarPagamentoAvulso(pay);
  const atende = await aplicarPagamentoAvulsoAtende(pay);
  const casou = stok.casou && Boolean(atende?.casou);
  return {
    casou,
    organizationId: stok.organizationId ?? atende?.organizationId ?? null,
    assinatura: null,
    pagamento: stok.pagamento,
    motivo: casou ? undefined : `combo: Stok ${stok.casou ? 'ok' : (stok.motivo ?? 'não casou')}; Atende ${atende?.casou ? 'ok' : (atende?.motivo ?? 'não casou')}`,
  };
}

/** Confere no MP e aplica — para a tela que espera o Pix cair, sem depender do webhook. */
export async function conferirCombo(conta: ContaSevla, organizationId: string, mpPaymentId: string): Promise<PagamentoCombo | null> {
  if (!/^\d{1,24}$/.test(mpPaymentId)) throw new ErroDaSevla('Pagamento inválido.', 400, 'invalido');
  const [, atendeAcesso] = await Promise.all([acessoEm(conta, organizationId, 'stok'), acessoEm(conta, organizationId, 'atende')]);
  const empresaId = atendeAcesso.empresa_id!;
  try {
    const lido = await lerCombo(organizationId, empresaId, mpPaymentId);
    if (!lido) return null;
    if ((lido.stok.status === 'pendente' || lido.atende.status === 'pendente') && mpConfigurado()) {
      await aplicarPagamentoDoCombo(await buscarPagamento(mpPaymentId));
      return (await lerCombo(organizationId, empresaId, mpPaymentId)) ?? lido;
    }
    return lido;
  } catch (e) {
    throw traduzir(e);
  }
}

/** O webhook pergunta primeiro aqui: um pagamento com a nossa referência é o Pix/boleto de um combo. Nulo = não é nosso. */
export async function tratarEventoDoCombo(tipo: string, id: string): Promise<ResultadoDeAplicacao | null> {
  if (tipo !== 'payment') return null;
  const pay = await buscarPagamento(id);
  if (!String(pay.external_reference ?? '').startsWith(REF_COMBO)) return null;
  return aplicarPagamentoDoCombo(pay);
}

// ---------------------------------------------------------------------------
//  O desconto só vale com os dois: acertar o combo
// ---------------------------------------------------------------------------

export interface LinhaDoCombo {
  id: string;
  status: string;
  combo: string | null;
  created_at: string;
  mp_preapproval_id: string | null;
  plano: string;
  ciclo: string;
}

const LINHA_DO_COMBO = 'id, status, combo, created_at, mp_preapproval_id, plano, ciclo';

/**
 * O que fazer com o combo de uma empresa, olhando as assinaturas dos dois
 * produtos (as mais recentes primeiro). Devolve, por produto, a assinatura
 * de combo em vigor que precisa voltar ao preço cheio — porque o outro
 * produto não tem combo em vigor nem um checkout de combo recém-começado.
 * Puro, para o teste.
 */
export function decisaoDoCombo(stok: LinhaDoCombo[], atende: LinhaDoCombo[], agora: Date = new Date()): { stok: LinhaDoCombo | null; atende: LinhaDoCombo | null } {
  const emVigor = (l: LinhaDoCombo[]) => l.find((a) => a.status === 'autorizada') ?? l.find((a) => a.status === 'pausada') ?? null;
  const aguardando = (l: LinhaDoCombo[]) => l.some((a) => a.status === 'pendente' && a.combo && a.mp_preapproval_id && agora.getTime() - new Date(a.created_at).getTime() < ESPERA_DO_CHECKOUT_MS);
  const parceiroOk = (l: LinhaDoCombo[]) => Boolean(emVigor(l)?.combo) || aguardando(l);
  const s = emVigor(stok);
  const a = emVigor(atende);
  return { stok: s?.combo && !parceiroOk(atende) ? s : null, atende: a?.combo && !parceiroOk(stok) ? a : null };
}

/** Confere o combo de uma empresa e devolve ao preço cheio o produto que ficou sozinho. Idempotente. */
export async function acertarCombo(organizationId: string): Promise<{ desfeitos: ProdutoSevla[] }> {
  const { data: empresa } = await supabaseServer.from('atende_empresas').select('id').eq('organization_id', organizationId).limit(1).maybeSingle();
  const [{ data: doStok, error: e1 }, { data: doAtende, error: e2 }] = await Promise.all([
    supabaseServer.from('assinaturas').select(LINHA_DO_COMBO).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(20),
    empresa ? supabaseServer.from('atende_assinaturas').select(LINHA_DO_COMBO).eq('empresa_id', empresa.id).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] as LinhaDoCombo[], error: null }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const d = decisaoDoCombo((doStok || []) as LinhaDoCombo[], (doAtende || []) as LinhaDoCombo[]);
  const desfeitos: ProdutoSevla[] = [];
  if (d.stok) {
    await desfazerNoStok(d.stok, organizationId);
    desfeitos.push('stok');
  }
  if (d.atende && empresa) {
    await desfazerNoAtende(d.atende, empresa.id);
    desfeitos.push('atende');
  }
  return { desfeitos };
}

/** Primeiro no MP (é quem cobra); se falhar, a linha fica como está e a próxima passada tenta de novo. */
async function desfazerNoStok(a: LinhaDoCombo, organizationId: string): Promise<void> {
  const plano = a.plano as Plano;
  const ciclo = a.ciclo as Ciclo;
  const cheio = precoDo(plano, ciclo);
  if (a.mp_preapproval_id && mpConfigurado()) await atualizarValor(a.mp_preapproval_id, cheio, motivoDoStok(plano, ciclo));
  await supabaseServer.from('assinaturas').update({ valor: cheio, combo: null, updated_at: new Date().toISOString() }).eq('id', a.id);
  esquecerPlano(organizationId);
  console.info('[sevla combo] Stok Aí de volta ao preço cheio', { organizationId, assinatura: a.id, valor: cheio });
}

async function desfazerNoAtende(a: LinhaDoCombo, empresaId: string): Promise<void> {
  const plano = a.plano as PlanoAtende;
  const ciclo = a.ciclo as CicloAtende;
  const periodo = precoDoPeriodoAtende(plano, ciclo);
  const porMes = precoAtende(plano, ciclo);
  if (periodo === null || porMes === null) return;
  if (a.mp_preapproval_id && mpConfigurado()) await atualizarValor(a.mp_preapproval_id, periodo, motivoAtende(plano, ciclo));
  await supabaseServer.from('atende_assinaturas').update({ valor: porMes, combo: null, updated_at: new Date().toISOString() }).eq('id', a.id);
  esquecerContaAtende(empresaId);
  console.info('[sevla combo] Atende Aí de volta ao preço cheio', { empresaId, assinatura: a.id, valor: periodo });
}

/** A rotina diária: toda empresa com combo em vigor em algum produto passa pelo `acertarCombo`. */
export async function acertarCombos(): Promise<{ empresas: number; desfeitos: number }> {
  const [{ data: s, error: e1 }, { data: a, error: e2 }] = await Promise.all([
    supabaseServer.from('assinaturas').select('organization_id').not('combo', 'is', null).in('status', ['autorizada', 'pausada']).limit(500),
    supabaseServer.from('atende_assinaturas').select('empresa_id').not('combo', 'is', null).in('status', ['autorizada', 'pausada']).limit(500),
  ]);
  // Sem a migração 041 ainda não há combos — nada a acertar.
  if ((e1 && /combo/.test(e1.message)) || (e2 && /combo/.test(e2.message))) return { empresas: 0, desfeitos: 0 };
  if (e1) throw e1;
  if (e2) throw e2;
  const orgs = new Set<string>((s || []).map((x: any) => x.organization_id as string));
  const empresas = (a || []).map((x: any) => x.empresa_id as string);
  if (empresas.length) {
    const { data: e } = await supabaseServer.from('atende_empresas').select('organization_id').in('id', empresas);
    for (const x of (e || []) as Array<{ organization_id: string | null }>) if (x.organization_id) orgs.add(x.organization_id);
  }
  let desfeitos = 0;
  for (const org of orgs) {
    try {
      desfeitos += (await acertarCombo(org)).desfeitos.length;
    } catch (e: any) {
      console.warn(`[sevla combo] acertar ${org}:`, e.message);
    }
  }
  return { empresas: orgs.size, desfeitos };
}
