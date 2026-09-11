import type { Material, MaterialMovement, StaffUser } from '@/shared/types';

/**
 * Onde o saldo está sendo avaliado. 'empresa' = Central + Obra da unidade
 * somados (o nome vem de quando só existia uma unidade; o significado é "a
 * unidade inteira").
 */
export type StockScope = 'central' | 'obra' | 'empresa';

/**
 * Situação de um material. Cada status implica uma ação diferente:
 *
 * - RUPTURA     não existe em lugar nenhum          -> comprar
 * - TRANSFERIR  zerado aqui, mas existe no outro local -> remessa (NÃO é falta)
 * - ABAIXO      total abaixo do mínimo da empresa   -> comprar
 * - ATENCAO     total perto do mínimo               -> monitorar
 * - OK          nada a fazer
 */
export type StockStatus = 'RUPTURA' | 'TRANSFERIR' | 'ABAIXO' | 'ATENCAO' | 'OK';

/**
 * O que a regra de saldo precisa saber de um material: o saldo nos dois
 * almoxarifados DA UNIDADE que está sendo olhada, e o mínimo.
 */
type StockFields = Pick<Material, 'saldo_central' | 'saldo_obra' | 'estoque_minimo'>;

/** Margem acima do mínimo que ainda merece atenção (1.5x = 50% de folga). */
const ATTENTION_FACTOR = 1.5;

/**
 * Saldo da UNIDADE: Central + Obra dela.
 *
 * É contra isso que o estoque mínimo é comparado. Cada unidade é um estoque
 * próprio, com os próprios almoxarifados: faltar em Natal enquanto sobra em
 * Nova Cruz é compra em Natal, não pedido a Nova Cruz. Só o que está dentro
 * da mesma unidade se resolve com remessa.
 */
export function stockTotal(m: StockFields): number {
  return Number(m.saldo_central) + Number(m.saldo_obra);
}

/**
 * `estoque_minimo` é o ponto de recompra da EMPRESA (Central + Obra), não de
 * cada local. Faltar só em um almoxarifado é problema de remessa, não de compra.
 * Mínimo 0 significa "sem controle de mínimo": só alerta se zerar em tudo.
 */
export function stockStatus(m: StockFields, scope: StockScope = 'empresa'): StockStatus {
  const total = stockTotal(m);
  const minimo = Number(m.estoque_minimo);

  // Zerado nos dois almoxarifados: falta de verdade.
  if (total <= 0) return 'RUPTURA';

  // Visto de um almoxarifado: vazio aqui mas disponível no outro almoxarifado
  // da MESMA unidade -> basta transferir. Outra unidade não conta: é outro
  // estoque, e o que falta aqui se resolve comprando aqui.
  if (scope !== 'empresa') {
    const aqui = scope === 'central' ? Number(m.saldo_central) : Number(m.saldo_obra);
    const outro = scope === 'central' ? Number(m.saldo_obra) : Number(m.saldo_central);
    if (aqui <= 0 && outro > 0) return 'TRANSFERIR';
  }

  if (minimo > 0) {
    if (total < minimo) return 'ABAIXO';
    if (total < minimo * ATTENTION_FACTOR) return 'ATENCAO';
  }

  return 'OK';
}

/** Precisa de compra: ou não existe, ou o total caiu abaixo do mínimo da empresa. */
export function needsPurchase(m: StockFields): boolean {
  const s = stockStatus(m, 'empresa');
  return s === 'RUPTURA' || s === 'ABAIXO';
}

/** Falta neste almoxarifado, mas existe no outro — resolve-se com remessa. */
export function needsTransfer(m: StockFields, scope: 'central' | 'obra'): boolean {
  return stockStatus(m, scope) === 'TRANSFERIR';
}

/** Quanto do mínimo o saldo total cobre. `null` quando não há mínimo definido. */
export function percentOfMinimum(m: StockFields): number | null {
  const minimo = Number(m.estoque_minimo);
  if (minimo <= 0) return null;
  return (stockTotal(m) / minimo) * 100;
}

export const STATUS_LABELS: Record<StockStatus, string> = {
  RUPTURA: 'Sem estoque',
  TRANSFERIR: 'Requer remessa',
  ABAIXO: 'Abaixo do mínimo',
  ATENCAO: 'Atenção',
  OK: 'OK',
};

/** O rótulo de TRANSFERIR depende de quem olha: a Obra repõe da Central, e vice-versa. */
export function statusLabel(status: StockStatus, scope: StockScope = 'empresa'): string {
  if (status !== 'TRANSFERIR') return STATUS_LABELS[status];
  if (scope === 'obra') return 'Tem na Central';
  if (scope === 'central') return 'Tem na Obra';
  return STATUS_LABELS.TRANSFERIR;
}

/**
 * Se a operação soma, subtrai ou apenas move estoque. Remessa e devolução
 * transferem entre almoxarifados, então não alteram o total da empresa.
 */
export type MovementDirection = 'in' | 'out' | 'transfer' | 'neutral';

export function movementDirection(tipo: string): MovementDirection {
  if (tipo.includes('REMESSA') || tipo.includes('DEVOLUCAO')) return 'transfer';
  if (tipo.includes('ENTRADA')) return 'in';
  if (tipo.includes('SAIDA') || tipo.includes('CONSUMO') || tipo === 'EXCLUSÃO') return 'out';
  return 'neutral';
}

/** Quantidade com sinal, na convenção do total da empresa. */
export function signedQuantity(mov: Pick<MaterialMovement, 'tipo_operacao' | 'quantidade'>): string {
  const dir = movementDirection(mov.tipo_operacao);
  const q = Math.abs(Number(mov.quantidade));
  if (dir === 'in') return `+${formatNumber(q)}`;
  if (dir === 'out') return `−${formatNumber(q)}`;
  return formatNumber(q);
}

export function movementMaterialName(mov: MaterialMovement, materials: Material[]): string {
  if (mov.materials?.nome) return mov.materials.nome;
  const found = materials.find((m) => m.id === mov.material_id);
  if (found) return found.nome;
  const bracketMatch = mov.justificativa?.match(/^\[(.*?)\]/);
  if (bracketMatch) return bracketMatch[1];
  const quoteMatch = mov.justificativa?.match(/material '(.*?)'/);
  if (quoteMatch) return quoteMatch[1];
  return 'Material removido';
}

export function staffName(matricula: string, staff: StaffUser[]): string {
  if (matricula === 'ADMIN') return 'Administrador';
  const found = staff.find((s) => s.matricula === matricula);
  return found?.nome || matricula;
}

const PERIODS = ['24H', '7D', '14D', '30D', '6M', '1Y', 'TODOS'] as const;
export type Period = (typeof PERIODS)[number];
export { PERIODS };

export function withinPeriod(dateStr: string, period: Period): boolean {
  if (period === 'TODOS') return true;
  const date = new Date(dateStr).getTime();
  const now = Date.now();
  const diffMs = now - date;
  const day = 24 * 60 * 60 * 1000;
  const map: Record<Exclude<Period, 'TODOS'>, number> = {
    '24H': 1 * day,
    '7D': 7 * day,
    '14D': 14 * day,
    '30D': 30 * day,
    '6M': 182 * day,
    '1Y': 365 * day,
  };
  return diffMs <= map[period as Exclude<Period, 'TODOS'>];
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
