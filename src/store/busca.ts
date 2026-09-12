import { create } from 'zustand';

/**
 * O termo que a paleta de comando (⌘K) entrega para a tela de destino.
 *
 * Quem escolhe um material na paleta cai na tela dele já filtrada. A tela,
 * ao montar, consome o termo uma vez — e ele some, para uma próxima visita
 * espontânea não vir filtrada do nada.
 */
interface BuscaState {
  termo: string | null;
  entregar: (termo: string) => void;
  consumir: () => string | null;
}

export const useBusca = create<BuscaState>()((set, get) => ({
  termo: null,
  entregar: (termo) => set({ termo }),
  consumir: () => {
    const t = get().termo;
    if (t !== null) set({ termo: null });
    return t;
  },
}));

/** Para o `useState(() => ...)` das telas: o termo entregue, ou vazio. */
export function buscaInicial(): string {
  return useBusca.getState().consumir() ?? '';
}
