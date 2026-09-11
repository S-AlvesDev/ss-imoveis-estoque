import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A unidade que a pessoa está olhando.
 *
 * Toda tela que fala "Central" ou "Obra" está falando dos depósitos DESTA
 * unidade. Trocar aqui troca o que todas elas mostram — e para onde toda
 * operação vai. Fica salvo no navegador: quem trabalha em Natal abre em Natal.
 *
 * `null` significa "ainda não escolhi": useEstoqueData resolve para a única
 * unidade que existir, ou para a primeira da lista.
 */
interface UnidadeState {
  unidadeId: string | null;
  setUnidade: (id: string | null) => void;
}

export const useUnidade = create<UnidadeState>()(
  persist(
    (set) => ({
      unidadeId: null,
      setUnidade: (unidadeId) => set({ unidadeId }),
    }),
    { name: 'estoque-unidade' },
  ),
);

/**
 * Carimba um pedido de escrita com a unidade em uso.
 *
 * Toda operação que mexe em saldo — cadastro, movimentação, recontagem —
 * precisa dizer ao servidor em qual unidade acontece. Com uma unidade só o
 * servidor deduz; com duas, recusa o que vier sem isto.
 */
export function naUnidade<T extends object>(payload: T): T & { unit_id: string | null } {
  return { ...payload, unit_id: useUnidade.getState().unidadeId };
}
