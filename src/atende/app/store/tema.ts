import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Tema claro/escuro e a cor da empresa.
 *
 * O tema é escolha de quem usa e fica no navegador dela — duas pessoas da
 * mesma empresa podem preferir coisas diferentes. A cor e o logo são da
 * empresa, vêm do servidor a cada entrada e valem para todo mundo.
 *
 * As duas coisas terminam no mesmo lugar: variáveis CSS no <body class="atende">,
 * que todos os componentes já leem.
 */
export type Tema = 'claro' | 'escuro';

/** O roxo de fábrica do Atende Aí, e o tom que ele assume no escuro. */
export const COR_PADRAO = '#7c3aed';

function corValida(hex: string | null | undefined): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : COR_PADRAO;
}

/** Escurece ou clareia um hex — para derivar o tom de hover a partir da cor escolhida. */
function mexerNaLuz(hex: string, fator: number): string {
  const n = parseInt(hex.slice(1), 16);
  const canal = (deslocamento: number) => {
    const v = (n >> deslocamento) & 0xff;
    const novo = fator < 0 ? v * (1 + fator) : v + (255 - v) * fator;
    return Math.max(0, Math.min(255, Math.round(novo)));
  };
  return `#${[16, 8, 0].map((d) => canal(d).toString(16).padStart(2, '0')).join('')}`;
}

function aplicar(tema: Tema, cor: string) {
  if (typeof document === 'undefined') return;
  const corpo = document.body;
  corpo.dataset.tema = tema;
  const estilo = corpo.style;
  const escolhida = corValida(cor);
  if (escolhida === COR_PADRAO) {
    // Cor de fábrica: deixa o CSS mandar, para o escuro usar o roxo dele.
    ['--brand', '--brand-deep', '--amber', '--amber-deep', '--roxo'].forEach((v) => estilo.removeProperty(v));
    return;
  }
  // No escuro a cor da empresa é clareada; no claro, escurecida no hover.
  const base = tema === 'escuro' ? mexerNaLuz(escolhida, 0.3) : escolhida;
  const fundo = tema === 'escuro' ? mexerNaLuz(escolhida, 0.15) : mexerNaLuz(escolhida, -0.15);
  estilo.setProperty('--brand', base);
  estilo.setProperty('--brand-deep', fundo);
  estilo.setProperty('--amber', base);
  estilo.setProperty('--amber-deep', fundo);
  estilo.setProperty('--roxo', base);
}

interface TemaState {
  tema: Tema;
  /** A cor da empresa em uso; não persiste — vem do servidor a cada entrada. */
  cor: string;
  setTema: (t: Tema) => void;
  alternar: () => void;
  setCor: (c: string | null | undefined) => void;
}

export const useTema = create<TemaState>()(
  persist(
    (set, get) => ({
      tema: 'claro',
      cor: COR_PADRAO,
      setTema: (tema) => {
        aplicar(tema, get().cor);
        set({ tema });
      },
      alternar: () => get().setTema(get().tema === 'escuro' ? 'claro' : 'escuro'),
      setCor: (c) => {
        const cor = corValida(c);
        aplicar(get().tema, cor);
        set({ cor });
      },
    }),
    {
      name: 'atende-tema',
      // Só o tema é da pessoa; a cor é da empresa e vem do servidor.
      partialize: (s) => ({ tema: s.tema }),
      onRehydrateStorage: () => (s) => aplicar(s?.tema ?? 'claro', COR_PADRAO),
    },
  ),
);

// Aplica antes do React montar, para não piscar branco em quem usa o escuro.
aplicar(useTema.getState().tema, COR_PADRAO);
