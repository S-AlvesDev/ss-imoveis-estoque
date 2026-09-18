import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessaoAtende } from '../../shared/tipos';

/**
 * A sessão do Atende Aí no navegador. Chave própria no storage
 * ('atende-sessao'): entrar aqui não mexe na sessão do Stok Aí, e vice-versa
 * — os dois produtos podem estar abertos em abas vizinhas.
 */
interface EstadoDaSessao {
  sessao: SessaoAtende | null;
  token: string | null;
  entrar: (sessao: SessaoAtende, token: string) => void;
  atualizar: (sessao: SessaoAtende) => void;
  sair: () => void;
}

export const useSessaoAtende = create<EstadoDaSessao>()(
  persist(
    (set) => ({
      sessao: null,
      token: null,
      entrar: (sessao, token) => set({ sessao, token }),
      atualizar: (sessao) => set({ sessao }),
      sair: () => set({ sessao: null, token: null }),
    }),
    { name: 'atende-sessao' },
  ),
);
