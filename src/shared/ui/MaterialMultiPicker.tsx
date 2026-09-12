import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Material } from '@/shared/types';
import { formatNumber } from '@/features/estoque/utils';

interface MaterialMultiPickerProps {
  materials: Material[];
  value: number[];
  onChange: (ids: number[]) => void;
  label?: string;
  hint?: string;
  max?: number;
}

const RESULTS_LIMIT = 40;

/**
 * Seleção de vários materiais para um chamado. Os escolhidos viram chips acima
 * da busca, para o usuário conferir a lista sem rolar os resultados.
 */
export function MaterialMultiPicker({
  materials,
  value,
  onChange,
  label = 'Materiais relacionados',
  hint,
  max = 20,
}: MaterialMultiPickerProps) {
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => value.map((id) => materials.find((m) => m.id === id)).filter((m): m is Material => !!m),
    [value, materials]
  );

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return materials.filter((m) => m.nome.toLowerCase().includes(q) && !value.includes(m.id)).slice(0, RESULTS_LIMIT);
  }, [materials, search, value]);

  function add(m: Material) {
    if (value.length >= max) return;
    onChange([...value, m.id]);
    setSearch('');
  }

  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        {label} {selected.length > 0 && <span className="text-[var(--brand)]">({selected.length})</span>}
      </label>

      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((m) => (
            <span
              key={m.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--brand)]/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-[var(--brand)]"
            >
              <span className="truncate">{m.nome}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== m.id))}
                className="shrink-0 rounded-full p-0.5 hover:bg-[var(--brand)]/20"
                aria-label={`Remover ${m.nome}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={value.length >= max ? `Limite de ${max} materiais atingido` : 'Buscar material para adicionar...'}
          disabled={value.length >= max}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 disabled:opacity-60"
        />
      </div>

      {results.length > 0 && (
        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
          {results.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => add(m)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--brand)]/10"
            >
              <span className="min-w-0">
                <span className="block truncate">{m.nome}</span>
                <span className="block truncate text-[11px] text-[var(--text-muted)]">{m.categoria}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
                Unidade: {formatNumber(m.saldo_unidade)}
              </span>
            </button>
          ))}
        </div>
      )}

      {search.trim() && results.length === 0 && (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">Nenhum material encontrado para “{search.trim()}”.</p>
      )}

      {hint && <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}
