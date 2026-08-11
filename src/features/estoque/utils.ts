import type { Material, MaterialMovement, StaffUser } from '@/shared/types';

export function isCritical(material: Pick<Material, 'saldo_central' | 'saldo_obra' | 'estoque_minimo'>, scope: 'central' | 'obra' | 'either' = 'either') {
  if (scope === 'central') return material.saldo_central <= material.estoque_minimo;
  if (scope === 'obra') return material.saldo_obra <= material.estoque_minimo;
  return material.saldo_central <= material.estoque_minimo || material.saldo_obra <= material.estoque_minimo;
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
