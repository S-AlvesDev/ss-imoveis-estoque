import { Fragment, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronDown, Clock, Pencil, Trash2 } from 'lucide-react';
import { StockBar } from '@/shared/ui/StockBar';
import { StockStatusBadge } from '@/shared/ui/StockStatusBadge';
import type { Material } from '@/shared/types';
import { formatNumber, percentOfMinimum, stockStatus, stockTotal, type StockScope } from './utils';

interface MaterialsTableProps {
  materials: Material[];
  /** De onde o estoque é avaliado — muda o significado de "falta". */
  scope?: StockScope;
  selectMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onHistory?: (m: Material) => void;
  onManage?: (m: Material) => void;
  onDelete?: (id: number) => void;
}

/** Saldo em destaque quando o local está zerado, apagado quando é só zero irrelevante. */
function Saldo({ value, unidade }: { value: number; unidade: string }) {
  const zero = Number(value) <= 0;
  return (
    <span className={zero ? 'text-[var(--text-muted)]' : 'font-semibold text-[var(--text)]'}>
      {formatNumber(value)} <span className="text-[10px] font-normal text-[var(--text-muted)]">{unidade}</span>
    </span>
  );
}

export function MaterialsTable({
  materials,
  scope = 'empresa',
  selectMode,
  selectedIds,
  onToggleSelect,
  onHistory,
  onManage,
  onDelete,
}: MaterialsTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        {/* O container rola; o cabeçalho fica fixo para não perder a referência das colunas. */}
        <thead className="sticky top-0 z-10 bg-[var(--surface)]">
          <tr className="border-b border-[var(--border)] text-left">
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Material</th>
            <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Central</th>
            <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Obra</th>
            <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total</th>
            <th className="hidden px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] sm:table-cell">
              Mín.
            </th>
            <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</th>
            <th className="w-10 px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const status = stockStatus(m, scope);
            const total = stockTotal(m);
            const pct = percentOfMinimum(m);
            const isOpen = expanded === m.id;
            const selected = selectedIds?.has(m.id) ?? false;

            return (
              <Fragment key={m.id}>
                <tr
                  onClick={selectMode ? () => onToggleSelect?.(m.id) : () => setExpanded(isOpen ? null : m.id)}
                  className={`cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--brand)]/5 ${
                    selected ? 'bg-[var(--brand)]/10' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      {selectMode && (
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                            selected
                              ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                              : 'border-[var(--border)] text-transparent'
                          }`}
                        >
                          <Check size={13} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text)]">{m.nome}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {m.categoria} · {m.unidade_medida}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <Saldo value={m.saldo_central} unidade={m.unidade_medida} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <Saldo value={m.saldo_obra} unidade={m.unidade_medida} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span
                      className={`font-bold ${
                        status === 'RUPTURA'
                          ? 'text-rose-500'
                          : status === 'ABAIXO'
                            ? 'text-[var(--brand)]'
                            : 'text-[var(--text)]'
                      }`}
                    >
                      {formatNumber(total)}
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-[var(--text-muted)] sm:table-cell">
                    {m.estoque_minimo > 0 ? formatNumber(m.estoque_minimo) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <StockStatusBadge status={status} scope={scope} />
                  </td>
                  <td className="px-2 py-3 text-[var(--text-muted)]">
                    {!selectMode && (
                      <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    )}
                  </td>
                </tr>

                {isOpen && !selectMode && (
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-2)]">
                    <td colSpan={7} className="px-4 py-4">
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex flex-wrap items-end justify-between gap-4"
                      >
                        <div className="min-w-[220px] flex-1">
                          <StockBar saldo={total} minimo={m.estoque_minimo} />
                          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                            {pct === null ? (
                              'Sem estoque mínimo definido'
                            ) : (
                              <>
                                <strong className="text-[var(--text)]">{formatNumber(pct)}%</strong> do mínimo
                                {' · '}mínimo {formatNumber(m.estoque_minimo)} {m.unidade_medida}
                              </>
                            )}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                            {formatNumber(m.qtd_volumes)} volume(s) × fator {formatNumber(m.fator_multiplicador)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onHistory?.(m)}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
                          >
                            <Clock size={14} /> Histórico
                          </button>
                          <button
                            onClick={() => onManage?.(m)}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10"
                          >
                            <Pencil size={14} /> Gerenciar
                          </button>
                          {deletingId === m.id ? (
                            <span className="flex items-center gap-1.5 px-2 text-xs font-bold">
                              <button
                                onClick={() => {
                                  onDelete?.(m.id);
                                  setDeletingId(null);
                                }}
                                className="text-rose-500 hover:underline"
                              >
                                Confirmar
                              </button>
                              <span className="text-[var(--text-muted)]">/</span>
                              <button onClick={() => setDeletingId(null)} className="text-[var(--text-muted)] hover:underline">
                                Cancelar
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeletingId(m.id)}
                              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-500 transition-colors hover:bg-rose-500/10"
                            >
                              <Trash2 size={14} /> Excluir
                            </button>
                          )}
                        </div>
                      </motion.div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
