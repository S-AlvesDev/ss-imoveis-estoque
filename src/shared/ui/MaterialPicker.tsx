import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import type { Material } from '@/shared/types';
import { formatNumber, needsPurchase } from '@/features/estoque/utils';

interface MaterialPickerProps {
  materials: Material[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  required?: boolean;
}

const RESULTS_LIMIT = 60;

export function MaterialPicker({ materials, value, onChange, label = 'Material', required }: MaterialPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => materials.find((m) => String(m.id) === value), [materials, value]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? materials.filter((m) => m.nome.toLowerCase().includes(q)) : materials;
    return list.slice(0, RESULTS_LIMIT);
  }, [materials, search]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function openPicker() {
    setOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function pick(m: Material) {
    onChange(String(m.id));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      {label && (
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {!open ? (
        <button
          type="button"
          onClick={openPicker}
          className={`flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left text-sm outline-none transition-colors hover:border-[var(--brand)]/50 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 ${
            !selected ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'
          }`}
        >
          <span className="truncate">{selected ? selected.nome : 'Buscar material...'}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {selected && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                }}
                className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]"
              >
                <X size={13} />
              </span>
            )}
            <ChevronDown size={15} className="text-[var(--text-muted)]" />
          </span>
        </button>
      ) : (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            placeholder="Digite o nome do material..."
            className="w-full rounded-lg border border-[var(--brand)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--text)] outline-none ring-2 ring-[var(--brand)]/20"
          />
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
          {results.length === 0 && <p className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">Nenhum material encontrado.</p>}
          {results.map((m) => {
            const critical = needsPurchase(m);
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => pick(m)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--brand)]/10 ${
                  String(m.id) === value ? 'bg-[var(--brand)]/10 font-semibold text-[var(--brand)]' : 'text-[var(--text)]'
                }`}
              >
                <span className="truncate">{m.nome}</span>
                <span className={`shrink-0 font-mono text-[11px] ${critical ? 'text-rose-500' : 'text-[var(--text-muted)]'}`}>
                  C:{formatNumber(m.saldo_central)} O:{formatNumber(m.saldo_obra)}
                </span>
              </button>
            );
          })}
          {materials.length > RESULTS_LIMIT && results.length === RESULTS_LIMIT && (
            <p className="px-3 pt-1.5 text-center text-[10px] text-[var(--text-muted)]">Refine a busca para ver mais resultados</p>
          )}
        </div>
      )}
    </div>
  );
}
