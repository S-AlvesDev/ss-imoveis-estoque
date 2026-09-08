import { ArrowDownRight, ArrowUpRight, ArrowLeftRight, Minus } from 'lucide-react';
import type { Material, MaterialMovement, StaffUser } from '@/shared/types';
import { OPERATION_LABELS } from '@/shared/constants';
import { formatDateTime, movementDirection, movementMaterialName, signedQuantity, staffName } from './utils';

const DIRECTION_STYLES = {
  in: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25', value: 'text-emerald-500', icon: <ArrowUpRight size={12} /> },
  out: { pill: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25', value: 'text-rose-500', icon: <ArrowDownRight size={12} /> },
  transfer: { pill: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25', value: 'text-sky-500', icon: <ArrowLeftRight size={12} /> },
  neutral: { pill: 'bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15', value: 'text-[var(--text)]', icon: <Minus size={12} /> },
} as const;

interface MovementsTableProps {
  movements: MaterialMovement[];
  materials: Material[];
  staff: StaffUser[];
  /** Oculta a coluna de material quando a tabela já é de um material só. */
  hideMaterial?: boolean;
}

export function MovementsTable({ movements, materials, staff, hideMaterial }: MovementsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--surface)]">
          <tr className="border-b border-[var(--border)] text-left">
            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Data/Hora</th>
            {!hideMaterial && (
              <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Material</th>
            )}
            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tipo</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Quantidade
            </th>
            <th className="hidden px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] md:table-cell">
              Responsável
            </th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => {
            const dir = movementDirection(m.tipo_operacao);
            const style = DIRECTION_STYLES[dir];
            return (
              <tr key={m.id} className="border-b border-[var(--border)] transition-colors hover:bg-[var(--brand)]/5">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-[var(--text-muted)]">
                  {formatDateTime(m.created_at)}
                </td>
                {!hideMaterial && (
                  // Sem largura máxima, uma justificativa longa estica a coluna e
                  // empurra Tipo e Quantidade para fora da área visível.
                  <td className="max-w-[240px] px-3 py-2.5">
                    <p className="truncate font-semibold text-[var(--text)]" title={movementMaterialName(m, materials)}>
                      {movementMaterialName(m, materials)}
                    </p>
                    {m.justificativa && (
                      <p className="truncate text-[11px] text-[var(--text-muted)]" title={m.justificativa}>
                        {m.justificativa}
                      </p>
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${style.pill}`}
                  >
                    {style.icon}
                    {OPERATION_LABELS[m.tipo_operacao] || m.tipo_operacao}
                  </span>
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums ${style.value}`}>
                  {signedQuantity(m)}
                </td>
                <td className="hidden px-3 py-2.5 text-[11px] text-[var(--text-muted)] md:table-cell">
                  {staffName(m.funcionario_matricula, staff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
