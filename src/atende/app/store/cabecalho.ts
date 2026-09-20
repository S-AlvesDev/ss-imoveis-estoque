import { create } from 'zustand';

/**
 * O que a tela atual diz ao cabeçalho do Shell: título, descrição e onde
 * (no DOM) as ações dela devem aparecer. `telaCheia` é a Central com uma
 * conversa aberta no celular — o cabeçalho e a navegação inferior somem
 * para a conversa tomar a tela.
 */
interface Cabecalho {
  titulo: string | null;
  descricao: string | null;
  alvoDasAcoes: HTMLElement | null;
  telaCheia: boolean;
}

export const useCabecalho = create<Cabecalho>(() => ({ titulo: null, descricao: null, alvoDasAcoes: null, telaCheia: false }));
