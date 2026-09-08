import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Check, ClipboardCheck, Search } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Stripes } from '@/shared/ui/Stripes';
import { EmptyState } from '@/shared/ui/EmptyState';
import { api } from '@/lib/api';
import type { Material } from '@/shared/types';
import { formatNumber } from './utils';
import { CATEGORIES } from '@/shared/constants';

interface RecontagemProps {
  open: boolean;
  onClose: () => void;
  location: 'CENTRAL' | 'OBRA';
  materials: Material[];
  refetch: () => Promise<void>;
}

interface StoredState {
  counts: Record<number, string>;
  matched: number[];
}

function storageKey(location: string) {
  return `estoque-recontagem-${location}-${new Date().toISOString().slice(0, 10)}`;
}

function loadStored(location: string): StoredState {
  try {
    const raw = localStorage.getItem(storageKey(location));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { counts: {}, matched: [] };
}

export function Recontagem({ open, onClose, location, materials, refetch }: RecontagemProps) {
  const [category, setCategory] = useState('TODAS');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<'counting' | 'review'>('counting');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const stored = loadStored(location);
    setCounts(stored.counts || {});
    setMatched(new Set(stored.matched || []));
    setStep('counting');
    setCategory('TODAS');
    setSearch('');
  }, [open, location]);

  function persist(nextCounts: Record<number, string>, nextMatched: Set<number>) {
    localStorage.setItem(storageKey(location), JSON.stringify({ counts: nextCounts, matched: [...nextMatched] }));
  }

  function saldoDe(m: Material) {
    return location === 'CENTRAL' ? Number(m.saldo_central) : Number(m.saldo_obra);
  }

  function setCount(materialId: number, value: string) {
    const next = { ...counts, [materialId]: value };
    const nextMatched = new Set(matched);
    nextMatched.delete(materialId);
    setCounts(next);
    setMatched(nextMatched);
    persist(next, nextMatched);
  }

  function confirmMatch(materialId: number) {
    const next = { ...counts };
    delete next[materialId];
    const nextMatched = new Set(matched).add(materialId);
    setCounts(next);
    setMatched(nextMatched);
    persist(next, nextMatched);
  }

  const filtered = useMemo(() => {
    let list = materials;
    if (category !== 'TODAS') list = list.filter((m) => m.categoria === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.nome.toLowerCase().includes(q));
    }
    return list;
  }, [materials, category, search]);

  const countedInView = filtered.filter((m) => matched.has(m.id) || counts[m.id] !== undefined).length;

  const diffs = useMemo(() => {
    return materials
      .map((m) => {
        const raw = counts[m.id];
        if (raw === undefined || raw === '') return null;
        const contagem = Number(raw);
        if (Number.isNaN(contagem)) return null;
        const saldo = saldoDe(m);
        const diferenca = contagem - saldo;
        if (diferenca === 0) return null;
        return { material: m, saldo, contagem, diferenca };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [materials, counts, location]);

  async function handleSubmit() {
    if (diffs.length === 0) {
      toast.info('Nenhuma divergência para salvar.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/materials/bulk-recount', {
        location,
        counts: diffs.map((d) => ({ material_id: d.material.id, contagem: d.contagem })),
      });
      toast.success(`${diffs.length} ajuste(s) de recontagem aplicado(s).`);
      const remainingCounts = { ...counts };
      const nextMatched = new Set(matched);
      diffs.forEach((d) => {
        delete remainingCounts[d.material.id];
        nextMatched.add(d.material.id);
      });
      setCounts(remainingCounts);
      setMatched(nextMatched);
      persist(remainingCounts, nextMatched);
      await refetch();
      setStep('counting');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar recontagem.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--bg-2)]"
    >
      <Stripes className="h-1.5 shrink-0" color="rgba(245,158,11,0.9)" dense />

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="font-display text-base font-bold text-[var(--text)]">
              Recontagem Rápida — {location === 'CENTRAL' ? 'Central' : 'Obra'}
            </p>
            <p className="font-mono text-[11px] text-[var(--text-muted)]">
              {countedInView}/{filtered.length} conferidos nesta visão
            </p>
          </div>
        </div>
        <Button variant="accent" onClick={() => setStep('review')} disabled={diffs.length === 0}>
          Revisar e Salvar {diffs.length > 0 && `(${diffs.length})`}
        </Button>
      </header>

      {step === 'counting' ? (
        <>
          <div className="shrink-0 space-y-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar material..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
              />
            </div>
            <div className="hide-scrollbar flex gap-2 overflow-x-auto">
              <button
                onClick={() => setCategory('TODAS')}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${category === 'TODAS' ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}
              >
                Todas
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${category === c ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6">
            <div className="mx-auto max-w-2xl space-y-2">
              {filtered.map((m) => {
                const saldo = saldoDe(m);
                const raw = counts[m.id];
                const isMatched = matched.has(m.id);
                const contagem = raw !== undefined && raw !== '' ? Number(raw) : null;
                const diff = contagem !== null && !Number.isNaN(contagem) ? contagem - saldo : null;
                const isDone = isMatched || raw !== undefined;

                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                      isDone ? 'border-emerald-200 bg-emerald-50/40' : 'border-[var(--border)] bg-[var(--surface)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{m.nome}</p>
                      <p className="font-mono text-[11px] text-[var(--text-muted)]">
                        Sistema: {formatNumber(saldo)} {m.unidade_medida}
                      </p>
                    </div>

                    {diff !== null && diff !== 0 && (
                      <span className={`shrink-0 font-mono text-xs font-bold ${diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {diff > 0 ? '+' : ''}
                        {formatNumber(diff)}
                      </span>
                    )}

                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={raw ?? (isMatched ? String(saldo) : '')}
                      onChange={(e) => setCount(m.id, e.target.value)}
                      placeholder={String(saldo)}
                      className="w-20 shrink-0 rounded-lg border border-[var(--border)] px-2 py-2 text-right text-sm font-semibold outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
                    />

                    <button
                      onClick={() => confirmMatch(m.id)}
                      title="Confere com o sistema"
                      className={`shrink-0 rounded-lg p-2 transition-colors ${
                        isMatched ? 'bg-emerald-500 text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)] hover:bg-emerald-100 hover:text-emerald-600'
                      }`}
                    >
                      <Check size={16} />
                    </button>
                  </div>
                );
              })}
              {filtered.length === 0 && <EmptyState icon={<Search size={20} />} title="Nenhum material encontrado" />}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-5 flex items-center gap-2">
              <ClipboardCheck size={18} className="text-[var(--brand)]" />
              <h3 className="font-display text-lg font-bold text-[var(--text)]">Confirmar {diffs.length} divergência(s)</h3>
            </div>
            <div className="space-y-2">
              <AnimatePresence>
                {diffs.map((d) => (
                  <motion.div
                    key={d.material.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">{d.material.nome}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Sistema: {formatNumber(d.saldo)} → Contagem: {formatNumber(d.contagem)}
                      </p>
                    </div>
                    <span className={`font-mono text-sm font-bold ${d.diferenca > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {d.diferenca > 0 ? '+' : ''}
                      {formatNumber(d.diferenca)}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-6 flex gap-3">
              <Button variant="outline" fullWidth onClick={() => setStep('counting')}>
                Voltar
              </Button>
              <Button variant="primary" fullWidth loading={submitting} onClick={handleSubmit}>
                Confirmar Ajustes
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
