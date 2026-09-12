import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CornerDownLeft, Package, Search } from 'lucide-react';
import type { Material } from '@/shared/types';
import type { AppView } from './Sidebar';
import { StockStatusBadge } from '@/shared/ui/StockStatusBadge';
import { stockStatus } from '@/features/estoque/utils';
import { useBusca } from '@/store/busca';

export interface DestinoDeNavegacao {
  view: AppView;
  label: string;
  icon: React.ReactNode;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  /** As telas que esta pessoa pode abrir — as mesmas da barra lateral. */
  destinos: DestinoDeNavegacao[];
  /** Para onde um material abre: Materiais para admin, o depósito da pessoa para operador. */
  telaDeMaterial: AppView | null;
  onNavigate: (view: AppView) => void;
}

type Resultado = { tipo: 'tela'; destino: DestinoDeNavegacao } | { tipo: 'material'; material: Material };

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * ⌘K: uma caixa só para achar um material ou pular para uma tela. Material
 * abre a tela dele já filtrada pelo nome (ver store/busca.ts).
 */
export function CommandPalette({ open, onClose, materials, destinos, telaDeMaterial, onNavigate }: CommandPaletteProps) {
  const [termo, setTermo] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const reduzido = useReducedMotion();
  const entregar = useBusca((s) => s.entregar);

  const resultados = useMemo<Resultado[]>(() => {
    const q = normalizar(termo.trim());
    const telas = destinos.filter((d) => !q || normalizar(d.label).includes(q)).map((destino) => ({ tipo: 'tela', destino }) as Resultado);
    if (!q || !telaDeMaterial) return telas.slice(0, 8);
    const mats = materials
      .filter((m) => normalizar(m.nome).includes(q))
      .sort((a, b) => normalizar(a.nome).indexOf(q) - normalizar(b.nome).indexOf(q) || a.nome.localeCompare(b.nome))
      .slice(0, 8)
      .map((material) => ({ tipo: 'material', material }) as Resultado);
    return [...mats, ...telas.slice(0, 3)];
  }, [termo, materials, destinos, telaDeMaterial]);

  useEffect(() => {
    if (!open) return;
    setTermo('');
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => setCursor(0), [termo]);

  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function escolher(r: Resultado) {
    onClose();
    if (r.tipo === 'tela') {
      onNavigate(r.destino.view);
    } else if (telaDeMaterial) {
      entregar(r.material.nome);
      onNavigate(telaDeMaterial);
    }
  }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = resultados[cursor];
      if (r) escolher(r);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[70] flex items-start justify-center bg-[#05080f]/60 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Buscar"
            initial={reduzido ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduzido ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
              <Search size={18} className="shrink-0 text-[var(--text-muted)]" />
              <input
                ref={inputRef}
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={tecla}
                placeholder="Buscar material ou ir para uma tela…"
                aria-label="Buscar material ou ir para uma tela"
                aria-activedescendant={resultados[cursor] ? `paleta-${cursor}` : undefined}
                className="h-14 w-full bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              <kbd className="hidden rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:block">esc</kbd>
            </div>

            <ul ref={listaRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {resultados.length === 0 && <li className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">Nada encontrado para “{termo}”.</li>}
              {resultados.map((r, i) => {
                const ativo = i === cursor;
                const base = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${ativo ? 'bg-[var(--brand)]/12 text-[var(--text)]' : 'text-[var(--text)] hover:bg-[var(--bg-2)]'}`;
                return (
                  <li key={r.tipo === 'tela' ? `t-${r.destino.view}` : `m-${r.material.id}`} id={`paleta-${i}`} role="option" aria-selected={ativo} data-indice={i}>
                    <button type="button" className={base} onMouseEnter={() => setCursor(i)} onClick={() => escolher(r)}>
                      {r.tipo === 'tela' ? (
                        <>
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ativo ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>{r.destino.icon}</span>
                          <span className="flex-1 font-medium">{r.destino.label}</span>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">tela</span>
                        </>
                      ) : (
                        <>
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ativo ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>
                            <Package size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{r.material.nome}</span>
                            <span className="block text-[11px] text-[var(--text-muted)]">
                              {r.material.categoria} · Central {r.material.saldo_central} · Obra {r.material.saldo_obra} {r.material.unidade_medida}
                            </span>
                          </span>
                          <StockStatusBadge status={stockStatus(r.material, 'empresa')} />
                        </>
                      )}
                      {ativo && <CornerDownLeft size={14} className="shrink-0 text-[var(--text-muted)]" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
              <span>
                <kbd className="font-mono">↑↓</kbd> navegar
              </span>
              <span>
                <kbd className="font-mono">↵</kbd> abrir
              </span>
              <span className="ml-auto hidden sm:inline">Digite o nome de um material ou de uma tela</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
