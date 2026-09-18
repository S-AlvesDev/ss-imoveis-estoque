import { create } from 'zustand';
import { api } from '../lib/api';
import type { BootstrapAtende, Empresa, Funcionario, Time } from '../../shared/tipos';

/**
 * O que o shell carrega ao entrar (empresa, times, equipe) e mantém em
 * memória. As rotas de escrita devolvem a lista atualizada; as telas
 * chamam `aplicar` com o que veio, sem recarregar tudo.
 */
interface Dados {
  carregado: boolean;
  erro: string | null;
  empresa: Empresa | null;
  times: Time[];
  equipe: Funcionario[];
  carregar: () => Promise<BootstrapAtende | null>;
  aplicar: (parte: Partial<Pick<Dados, 'empresa' | 'times' | 'equipe'>>) => void;
  limpar: () => void;
}

export const useDadosAtende = create<Dados>((set) => ({
  carregado: false,
  erro: null,
  empresa: null,
  times: [],
  equipe: [],
  carregar: async () => {
    try {
      const b = await api.get<BootstrapAtende>('/bootstrap');
      set({ carregado: true, erro: null, empresa: b.empresa, times: b.times, equipe: b.equipe });
      return b;
    } catch (e: any) {
      set({ carregado: true, erro: e.message || 'Não foi possível carregar.' });
      return null;
    }
  },
  aplicar: (parte) => set(parte),
  limpar: () => set({ carregado: false, erro: null, empresa: null, times: [], equipe: [] }),
}));
