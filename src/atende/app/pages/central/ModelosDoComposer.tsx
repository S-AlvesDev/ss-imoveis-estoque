import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { api, ErroDaApi } from '../../lib/api';
import type { ModeloDeMensagem } from '../Modelos';

/**
 * O popover de modelos no Composer: busca rápida por título, clique insere
 * no campo (com {nome} já trocado pelo chamador). Fecha no clique fora, no
 * Esc, ou ao escolher.
 */
export function ModelosDoComposer({ onEscolher, onFechar }: { onEscolher: (texto: string) => void; onFechar: () => void }) {
  const [modelos, setModelos] = useState<ModeloDeMensagem[] | null>(null);
  const [busca, setBusca] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<{ modelos: ModeloDeMensagem[] }>('/modelos')
      .then((r) => setModelos(r.modelos))
      .catch((err) => {
        toast.error(err instanceof ErroDaApi ? err.message : 'Erro ao carregar os modelos.');
        onFechar();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onFechar();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', esc);
    };
  }, [onFechar]);

  const filtrados = (modelos ?? []).filter((m) => m.titulo.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <div ref={ref} className="absolute bottom-12 left-0 z-20 w-72 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--sombra-flutuante)]">
      <div className="border-b border-[var(--border)] p-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar modelo…" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[var(--brand)]" />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto p-1.5">
        {modelos === null ? (
          <p className="px-2.5 py-3 text-xs text-[var(--text-muted)]">Carregando…</p>
        ) : filtrados.length === 0 ? (
          <p className="px-2.5 py-3 text-xs text-[var(--text-muted)]">{modelos.length === 0 ? 'Nenhum modelo cadastrado ainda.' : 'Nada encontrado.'}</p>
        ) : (
          filtrados.map((m) => (
            <button key={m.id} type="button" onClick={() => onEscolher(m.texto)} className="block w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-2)]">
              <p className="text-sm font-semibold text-[var(--text)]">{m.titulo}</p>
              <p className="line-clamp-1 text-xs text-[var(--text-muted)]">{m.texto}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
