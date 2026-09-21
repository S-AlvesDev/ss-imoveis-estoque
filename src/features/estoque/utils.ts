import type { Deposito, Emprestimo, Lote, Material, MaterialMovement, StaffUser } from '@/shared/types';

/**
 * Onde o saldo está sendo avaliado: a unidade inteira ('empresa' — o nome
 * vem de quando só existia uma), ou um estoque dela, pelo id.
 */
export type StockScope = 'empresa' | string;

/**
 * Situação de um material. Cada status implica uma ação diferente:
 *
 * - RUPTURA     não existe em lugar nenhum da unidade   -> comprar
 * - TRANSFERIR  zerado aqui, mas existe em outro estoque -> transferir (NÃO é falta)
 * - ABAIXO      total abaixo do mínimo                  -> comprar
 * - ATENCAO     total perto do mínimo                   -> monitorar
 * - OK          nada a fazer
 */
export type StockStatus = 'RUPTURA' | 'TRANSFERIR' | 'ABAIXO' | 'ATENCAO' | 'OK';

/**
 * O que a regra de saldo precisa saber de um material: o saldo somado da
 * unidade que está sendo olhada, o saldo em cada estoque dela, e o mínimo.
 */
export type StockFields = Pick<Material, 'saldo_unidade' | 'saldos_unidade' | 'estoque_minimo'>;

/** Margem acima do mínimo que ainda merece atenção (1.5x = 50% de folga). */
const ATTENTION_FACTOR = 1.5;

/**
 * Saldo da UNIDADE: todos os estoques dela somados.
 *
 * É contra isso que o estoque mínimo é comparado. Cada unidade é um estoque
 * próprio: faltar em Natal enquanto sobra em Nova Cruz é compra em Natal,
 * não pedido a Nova Cruz. Só o que está dentro da mesma unidade se resolve
 * com transferência.
 */
export function stockTotal(m: StockFields): number {
  return Number(m.saldo_unidade);
}

/** Saldo num estoque específico da unidade. Sem linha = zero. */
export function saldoEm(m: StockFields, depositoId: string): number {
  return Number(m.saldos_unidade?.[depositoId] ?? 0);
}

/**
 * `estoque_minimo` é o ponto de recompra da UNIDADE, não de cada estoque.
 * Faltar só em um estoque é problema de transferência, não de compra.
 * Mínimo 0 significa "sem controle de mínimo": só alerta se zerar em tudo.
 */
export function stockStatus(m: StockFields, scope: StockScope = 'empresa'): StockStatus {
  const total = stockTotal(m);
  const minimo = Number(m.estoque_minimo);

  // Zerado em todos os estoques da unidade: falta de verdade.
  if (total <= 0) return 'RUPTURA';

  // Visto de um estoque: vazio aqui mas disponível em outro estoque da MESMA
  // unidade -> basta transferir. Outra unidade não conta: é outro estoque,
  // e o que falta aqui se resolve comprando aqui. Só conta quando o material
  // é esperado aqui (tem linha de saldo neste estoque) — senão todo material
  // que só existe num depósito da unidade "precisaria transferir" para os
  // outros, mesmo os que nunca trabalham com ele.
  if (scope !== 'empresa' && scope in m.saldos_unidade) {
    const aqui = saldoEm(m, scope);
    if (aqui <= 0 && total - aqui > 0) return 'TRANSFERIR';
  }

  if (minimo > 0) {
    if (total < minimo) return 'ABAIXO';
    if (total < minimo * ATTENTION_FACTOR) return 'ATENCAO';
  }

  return 'OK';
}

/** Precisa de compra: ou não existe, ou o total caiu abaixo do mínimo da unidade. */
export function needsPurchase(m: StockFields): boolean {
  const s = stockStatus(m, 'empresa');
  return s === 'RUPTURA' || s === 'ABAIXO';
}

/** Falta neste estoque, mas existe em outro — resolve-se com transferência. */
export function needsTransfer(m: StockFields, depositoId: string): boolean {
  return stockStatus(m, depositoId) === 'TRANSFERIR';
}

/** Quanto do mínimo o saldo total cobre. `null` quando não há mínimo definido. */
export function percentOfMinimum(m: StockFields): number | null {
  const minimo = Number(m.estoque_minimo);
  if (minimo <= 0) return null;
  return (stockTotal(m) / minimo) * 100;
}

export const STATUS_LABELS: Record<StockStatus, string> = {
  RUPTURA: 'Sem estoque',
  TRANSFERIR: 'Tem em outro estoque',
  ABAIXO: 'Abaixo do mínimo',
  ATENCAO: 'Atenção',
  OK: 'OK',
};

/**
 * Onde o material existe, fora do estoque `excetoId`: "Almoxarifado Central",
 * "A e B", "A, B e C". Vazio se não existe em mais nenhum.
 */
export function ondeTem(m: StockFields, depositos: Array<{ id: string; nome: string }>, excetoId?: string): string {
  const nomes = depositos.filter((d) => d.id !== excetoId && saldoEm(m, d.id) > 0).map((d) => d.nome);
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** O rótulo de TRANSFERIR pode dizer onde tem, quando quem chama sabe. */
export function statusLabel(status: StockStatus, _scope: StockScope = 'empresa', ondeTemNome?: string): string {
  if (status === 'TRANSFERIR' && ondeTemNome) return `Tem em ${ondeTemNome}`;
  return STATUS_LABELS[status];
}

/**
 * Se a operação soma, subtrai ou apenas move estoque. Remessa e devolução
 * transferem entre almoxarifados, então não alteram o total da empresa.
 */
export type MovementDirection = 'in' | 'out' | 'transfer' | 'neutral';

export function movementDirection(tipo: string): MovementDirection {
  if (tipo === 'EMPRESTIMO') return 'out';
  if (tipo === 'DEVOLUCAO_EMPRESTIMO') return 'in';
  if (tipo.includes('REMESSA') || tipo.includes('DEVOLUCAO') || tipo === 'TRANSFERENCIA') return 'transfer';
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

/**
 * O mesmo total que a tela de Alertas mostra, usado pelo sino do topo — os dois
 * precisam contar a mesma coisa, senão o sino diz "sem alertas" com a tela
 * cheia de pendências. Materiais entram uma vez só, mesmo cabendo em mais de
 * um grupo (falta + precisa transferir).
 */
export function contarPendencias(materials: Material[], depositos: Deposito[], emprestimos: Emprestimo[], lotes: Lote[]): number {
  const materiaisComAlerta = new Set<number>();
  for (const m of materials) {
    const empresa = stockStatus(m, 'empresa');
    if (empresa === 'RUPTURA' || empresa === 'ABAIXO') materiaisComAlerta.add(m.id);
    else if (depositos.some((d) => stockStatus(m, d.id) === 'TRANSFERIR')) materiaisComAlerta.add(m.id);
  }

  const agora = Date.now();
  const atrasados = emprestimos.filter((e) => (e.tipo === 'emprestimo' || e.tipo === 'entrega') && e.prazo_em && new Date(e.prazo_em).getTime() < agora).length;

  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const lotesComAlerta = lotes.filter((l) => {
    if (!l.validade) return false;
    const dep = depositos.find((d) => d.id === l.warehouse_id);
    if (!dep) return false;
    const fim = new Date(`${l.validade}T00:00:00`).getTime();
    return fim < inicioHoje || fim <= inicioHoje + (dep.dias_aviso_validade ?? 30) * 24 * 60 * 60 * 1000;
  }).length;

  return materiaisComAlerta.size + atrasados + lotesComAlerta;
}
