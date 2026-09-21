/**
 * Os números do painel, sem React: cada função recebe listas e devolve o
 * que a tela mostra. Assim dá para testar o "vs. mês anterior" sem montar
 * componente nenhum.
 *
 * Vocabulário das operações (ver server/estoque.ts):
 *   ENTRADA / ENTRADA_CENTRAL      chega de fora                → entrada na empresa
 *   SAIDA / CONSUMO / CONSUMO_OBRA sai para fora ou é usado      → saída da empresa
 *   TRANSFERENCIA / REMESSA_OBRA / DEVOLUCAO_CENTRAL  entre estoques → interna
 *   EMPRESTIMO / DEVOLUCAO_EMPRESTIMO  vai e volta               → interna (saldo em circulação)
 *   AJUSTE / AJUSTE_*              delta com sinal num estoque   → nem uma coisa nem outra
 */
import type { Deposito, Material, MaterialMovement } from '@/shared/types';

export type Periodo = 7 | 30 | 90;

const DIA_MS = 24 * 60 * 60 * 1000;

const ENTRADAS = new Set(['ENTRADA_CENTRAL', 'ENTRADA']);
const SAIDAS = new Set(['SAIDA', 'CONSUMO_OBRA', 'CONSUMO']);

type MovComDepositos = MaterialMovement & { warehouse_origem_id?: string | null; warehouse_destino_id?: string | null };

/**
 * Quanto a operação muda no saldo de um estoque (sinal já aplicado).
 *
 * Movimentação com depósito gravado: sai da origem, entra no destino; ajuste
 * é um delta com sinal no destino. As de antes das unidades (sem depósito)
 * ainda dizem "Central"/"Obra" no nome — para elas, o chamador informa quais
 * estoques eram o Central e a Obra.
 */
export function efeitoEm(m: MovComDepositos, depositoId: string, legado: { central?: string; obra?: string } = {}): number {
  const q = Number(m.quantidade) || 0;
  const abs = Math.abs(q);
  const origem = m.warehouse_origem_id ?? null;
  const destino = m.warehouse_destino_id ?? null;

  if (origem || destino) {
    const ajuste = m.tipo_operacao.startsWith('AJUSTE');
    let delta = 0;
    if (destino === depositoId) delta += ajuste ? q : abs;
    if (origem === depositoId) delta -= abs;
    return delta;
  }

  // Legado: sem depósito gravado, o nome da operação diz o lado.
  const ehCentral = legado.central === depositoId;
  const ehObra = legado.obra === depositoId;
  switch (m.tipo_operacao) {
    case 'ENTRADA_CENTRAL':
    case 'ENTRADA':
      return ehCentral ? abs : 0;
    case 'SAIDA':
      return ehCentral ? -abs : 0;
    case 'REMESSA_OBRA':
      return ehCentral ? -abs : ehObra ? abs : 0;
    case 'DEVOLUCAO_CENTRAL':
    case 'DEVOLUCAO':
      return ehCentral ? abs : ehObra ? -abs : 0;
    case 'CONSUMO_OBRA':
      return ehObra ? -abs : 0;
    case 'AJUSTE_CENTRAL':
      return ehCentral ? q : 0;
    case 'AJUSTE_OBRA':
      return ehObra ? q : 0;
    default:
      return 0;
  }
}

/** Entrada na empresa, saída da empresa, ou movimento interno/neutro. */
export function direcao(m: MovComDepositos): 'entrada' | 'saida' | 'outro' {
  if (ENTRADAS.has(m.tipo_operacao)) return 'entrada';
  if (SAIDAS.has(m.tipo_operacao)) return 'saida';
  return 'outro';
}

/**
 * As movimentações da unidade em uso. As de antes das unidades existirem
 * não têm depósito gravado: só contam quando a organização tem uma unidade
 * só — a única a que poderiam pertencer.
 */
export function filtrarPorUnidade(movs: MaterialMovement[], depositosDaUnidade: Deposito[], unidadeUnica: boolean): MaterialMovement[] {
  const ids = new Set(depositosDaUnidade.map((d) => d.id));
  return movs.filter((m) => {
    const origem = (m as MaterialMovement & { warehouse_origem_id?: string | null }).warehouse_origem_id;
    const destino = (m as MaterialMovement & { warehouse_destino_id?: string | null }).warehouse_destino_id;
    if (!origem && !destino) return unidadeUnica;
    return (origem != null && ids.has(origem)) || (destino != null && ids.has(destino));
  });
}

/** Meia-noite local do dia, como chave "AAAA-MM-DD". */
export function chaveDoDia(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export interface PontoDoDia {
  chave: string;
  data: Date;
  entradas: number;
  saidas: number;
}

/**
 * Entradas e saídas da empresa por dia, nos últimos `dias` dias (hoje
 * incluso), com os dias sem nada preenchidos com zero — o gráfico precisa
 * do eixo inteiro. Para 90 dias, agrupa por semana (13 barras, não 90).
 */
export function serieDiaria(movs: MaterialMovement[], dias: Periodo, agora: Date = new Date()): PontoDoDia[] {
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicio = new Date(fim.getTime() - (dias - 1) * DIA_MS);
  const porDia = new Map<string, PontoDoDia>();
  for (let i = 0; i < dias; i++) {
    const d = new Date(inicio.getTime() + i * DIA_MS);
    porDia.set(chaveDoDia(d), { chave: chaveDoDia(d), data: d, entradas: 0, saidas: 0 });
  }
  for (const m of movs) {
    const d = new Date(m.created_at);
    if (Number.isNaN(d.getTime()) || d < inicio) continue;
    const p = porDia.get(chaveDoDia(d));
    if (!p) continue;
    const q = Math.abs(Number(m.quantidade) || 0);
    if (ENTRADAS.has(m.tipo_operacao)) p.entradas += q;
    else if (SAIDAS.has(m.tipo_operacao)) p.saidas += q;
  }
  const pontos = [...porDia.values()];
  if (dias < 90) return pontos;

  // Semanas de 7 dias contadas a partir do fim, para a última barra ser "esta semana".
  const semanas: PontoDoDia[] = [];
  for (let i = pontos.length; i > 0; i -= 7) {
    const fatia = pontos.slice(Math.max(0, i - 7), i);
    semanas.unshift({
      chave: fatia[0].chave,
      data: fatia[0].data,
      entradas: fatia.reduce((s, p) => s + p.entradas, 0),
      saidas: fatia.reduce((s, p) => s + p.saidas, 0),
    });
  }
  return semanas;
}

/** Variação percentual de `atual` sobre `anterior`; nula quando não há base. */
export function variacao(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export interface SaldoComHistorico {
  atual: number;
  /** Variação contra 30 dias atrás, reconstruída a partir das movimentações. Nula sem base para calcular %
   * (30 dias atrás era 0) — nesse caso, `mudancaEm30Dias` ainda diz se houve movimentação real. */
  tendencia: number | null;
  /** A mudança em unidades nos últimos 30 dias (não %). BUG-02: um depósito novo (base zero) tinha
   * `tendencia` nula mesmo com movimentação — o card dizia "sem movimentação recente" com entrada no dia. */
  mudancaEm30Dias: number;
  /** O saldo ao fim de cada um dos últimos 14 dias, para a sparkline. */
  serie: number[];
}

/**
 * Saldo de um depósito hoje e como ele chegou aqui. O histórico não existe
 * no banco; a gente anda para trás: o saldo de ontem é o de hoje menos o
 * que hoje mudou. Sem movimentação nenhuma, a linha é reta e a tendência é nula.
 */
export function saldoComHistorico(
  atual: number,
  movs: MaterialMovement[],
  depositoId: string,
  agora: Date = new Date(),
  legado: { central?: string; obra?: string } = {},
): SaldoComHistorico {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const mudancaPorDia = new Map<string, number>();
  let mudancaEm30Dias = 0;
  const limite30 = new Date(hoje.getTime() - 29 * DIA_MS);
  for (const m of movs) {
    const d = new Date(m.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const delta = efeitoEm(m, depositoId, legado);
    if (delta === 0) continue;
    const chave = chaveDoDia(d);
    mudancaPorDia.set(chave, (mudancaPorDia.get(chave) ?? 0) + delta);
    if (d >= limite30) mudancaEm30Dias += delta;
  }

  const serie: number[] = [];
  let saldo = atual;
  for (let i = 0; i < 14; i++) {
    const d = new Date(hoje.getTime() - i * DIA_MS);
    serie.unshift(saldo);
    saldo -= mudancaPorDia.get(chaveDoDia(d)) ?? 0;
  }

  const ha30Dias = atual - mudancaEm30Dias;
  const tendencia = mudancaEm30Dias === 0 ? null : variacao(atual, ha30Dias);
  return { atual, tendencia, mudancaEm30Dias, serie };
}

export interface CatalogoComHistorico {
  total: number;
  tendencia: number | null;
  /** Quantos entraram no catálogo nos últimos 30 dias — usado quando `tendencia` é nula (catálogo novo). */
  criadosEm30: number;
  serie: number[];
}

/** Quantos materiais existem e quantos entraram no catálogo nos últimos 30 dias. */
export function catalogoComHistorico(materials: Material[], agora: Date = new Date()): CatalogoComHistorico {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const criadosPorDia = new Map<string, number>();
  let criadosEm30 = 0;
  const limite30 = new Date(hoje.getTime() - 29 * DIA_MS);
  for (const m of materials) {
    const d = new Date(m.created_at);
    if (Number.isNaN(d.getTime())) continue;
    criadosPorDia.set(chaveDoDia(d), (criadosPorDia.get(chaveDoDia(d)) ?? 0) + 1);
    if (d >= limite30) criadosEm30++;
  }
  const serie: number[] = [];
  let total = materials.length;
  for (let i = 0; i < 14; i++) {
    const d = new Date(hoje.getTime() - i * DIA_MS);
    serie.unshift(total);
    total -= criadosPorDia.get(chaveDoDia(d)) ?? 0;
  }
  return { total: materials.length, tendencia: criadosEm30 === 0 ? null : variacao(materials.length, materials.length - criadosEm30), criadosEm30, serie };
}

export interface TopMaterial {
  material: Material;
  total: number;
  /** Movimentado nos últimos 30 dias contra os 30 anteriores. */
  tendencia: number | null;
}

/** Os materiais que mais se movimentaram, por quantidade, com a variação recente. */
export function topMateriais(materials: Material[], movs: MaterialMovement[], quantos = 5, agora: Date = new Date()): TopMaterial[] {
  const limite30 = new Date(agora.getTime() - 30 * DIA_MS);
  const limite60 = new Date(agora.getTime() - 60 * DIA_MS);
  const total = new Map<number, number>();
  const ult30 = new Map<number, number>();
  const ant30 = new Map<number, number>();
  for (const m of movs) {
    if (!m.material_id) continue;
    const q = Math.abs(Number(m.quantidade) || 0);
    total.set(m.material_id, (total.get(m.material_id) ?? 0) + q);
    const d = new Date(m.created_at);
    if (d >= limite30) ult30.set(m.material_id, (ult30.get(m.material_id) ?? 0) + q);
    else if (d >= limite60) ant30.set(m.material_id, (ant30.get(m.material_id) ?? 0) + q);
  }
  const porId = new Map(materials.map((m) => [m.id, m]));
  return [...total.entries()]
    .map(([id, t]) => ({ material: porId.get(id), total: t, tendencia: variacao(ult30.get(id) ?? 0, ant30.get(id) ?? 0) }))
    .filter((x): x is TopMaterial => Boolean(x.material))
    .sort((a, b) => b.total - a.total)
    .slice(0, quantos);
}

export interface Fatia {
  nome: string;
  valor: number;
  pct: number;
}

/** Materiais por categoria, maior primeiro, com o percentual já calculado. */
export function porCategoria(materials: Material[], categorias: readonly string[]): Fatia[] {
  const total = materials.length || 1;
  const contagem = new Map<string, number>();
  for (const m of materials) {
    const c = categorias.includes(m.categoria) ? m.categoria : 'Outros';
    contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([nome, valor]) => ({ nome, valor, pct: Math.round((valor / total) * 100) }))
    .sort((a, b) => b.valor - a.valor);
}

export interface Atividade {
  id: number;
  tipo: string;
  material: string;
  quantidade: number;
  quando: Date;
  quem: string;
}

/** As últimas movimentações, com o nome do material resolvido. */
export function atividadesRecentes(movs: MaterialMovement[], materials: Material[], quantas = 6): Atividade[] {
  const porId = new Map(materials.map((m) => [m.id, m.nome]));
  return [...movs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, quantas)
    .map((m) => ({
      id: m.id,
      tipo: m.tipo_operacao,
      material: m.materials?.nome ?? (m.material_id != null ? porId.get(m.material_id) : undefined) ?? 'Material removido',
      quantidade: Number(m.quantidade) || 0,
      quando: new Date(m.created_at),
      quem: m.funcionario_matricula,
    }));
}
