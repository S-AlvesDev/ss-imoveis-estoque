import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import type { Material } from '@/shared/types';
import { formatNumber } from '@/features/estoque/utils';

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
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {!open ? (
        <button
          type="button"
          onClick={openPicker}
          className={`flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm outline-none transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${
            !selected ? 'text-slate-400' : 'text-slate-800'
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
                className="rounded-full p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
              >
                <X size={13} />
              </span>
            )}
            <ChevronDown size={15} className="text-slate-400" />
          </span>
        </button>
      ) : (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            placeholder="Digite o nome do material..."
            className="w-full rounded-lg border border-blue-500 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-2 ring-blue-500/15"
          />
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-400">Nenhum material encontrado.</p>}
          {results.map((m) => {
            const critical = m.saldo_central <= m.estoque_minimo || m.saldo_obra <= m.estoque_minimo;
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => pick(m)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                  String(m.id) === value ? 'bg-blue-50/70 font-semibold text-blue-700' : 'text-slate-700'
                }`}
              >
                <span className="truncate">{m.nome}</span>
                <span className={`shrink-0 font-mono text-[11px] ${critical ? 'text-rose-500' : 'text-slate-400'}`}>
                  C:{formatNumber(m.saldo_central)} O:{formatNumber(m.saldo_obra)}
                </span>
              </button>
            );
          })}
          {materials.length > RESULTS_LIMIT && results.length === RESULTS_LIMIT && (
            <p className="px-3 pt-1.5 text-center text-[10px] text-slate-300">Refine a busca para ver mais resultados</p>
          )}
        </div>
      )}
    </div>
  );
}
