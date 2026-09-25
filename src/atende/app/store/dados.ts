import { create } from 'zustand';
import { api } from '../lib/api';
import { useCentral } from './central';
import { useTema } from './tema';
import type { BootstrapAtende, ContaAtende, Empresa, Funcionario, Time } from '../../shared/tipos';

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
  /** A situação do plano da empresa (avaliação, assinada, carência, bloqueada). */
  conta: ContaAtende | null;
  carregar: () => Promise<BootstrapAtende | null>;
  aplicar: (parte: Partial<Pick<Dados, 'empresa' | 'times' | 'equipe' | 'conta'>>) => void;
  /** O servidor respondeu 402 com `bloqueada`: a avaliação terminou no meio do uso. */
  marcarBloqueada: () => void;
  limpar: () => void;
}

export const useDadosAtende = create<Dados>((set) => ({
  carregado: false,
  erro: null,
  empresa: null,
  times: [],
  equipe: [],
  conta: null,
  carregar: async () => {
    try {
      const b = await api.get<BootstrapAtende>('/bootstrap');
      set({ carregado: true, erro: null, empresa: b.empresa, times: b.times, equipe: b.equipe, conta: b.conta ?? null });
      // A empresa veste o sistema com a cor dela (o tema claro/escuro é de quem usa).
      useTema.getState().setCor(b.empresa?.cor_primaria);
      // O cartão do WhatsApp na barra lateral lê daqui; o sync da Central mantém atualizado depois.
      useCentral.setState({ conexao: b.conexao });
      return b;
    } catch (e: any) {
      set({ carregado: true, erro: e.message || 'Não foi possível carregar.' });
      return null;
    }
  },
  aplicar: (parte) => set(parte),
  marcarBloqueada: () => set((s) => (s.conta && s.conta.situacao !== 'bloqueada' ? { conta: { ...s.conta, situacao: 'bloqueada', plano: 'avaliacao', dias_restantes: 0 } } : {})),
  limpar: () => {
    // Ao sair, a próxima tela de login não herda a cor da empresa anterior.
    useTema.getState().setCor(null);
    set({ carregado: false, erro: null, empresa: null, times: [], equipe: [], conta: null });
  },
}));
