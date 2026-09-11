import { create } from 'zustand';
import type { Organizacao } from '@/shared/types';
import { PRODUTO } from '@/shared/produto';

/** A cor de fábrica — a do tema Elegent. Vale até a organização escolher outra. */
export const COR_PADRAO = '#ff8e29';

/**
 * A identidade da organização em uso: nome, cor, logo.
 *
 * Preenchida pelo useEstoqueData depois de carregar; lida pela barra lateral,
 * pelo topo e pela tela de Configurações, que não recebem os dados por props.
 * Não persiste: a cor certa vem do servidor a cada entrada — um logo antigo
 * salvo no navegador apareceria por um instante na organização errada.
 */
interface MarcaState {
  organizacao: Organizacao | null;
  setOrganizacao: (o: Organizacao | null) => void;
}

export const useMarca = create<MarcaState>()((set) => ({
  organizacao: null,
  setOrganizacao: (organizacao) => {
    aplicarCor(organizacao?.cor_primaria ?? COR_PADRAO);
    set({ organizacao });
  },
}));

/**
 * Veste o sistema com a cor. Tudo que é laranja hoje lê `--brand`; trocar a
 * variável troca botões, links, o pill do menu, as faixas. O fundo claro é
 * um tom derivado (ver index.css), então acompanha sozinho.
 */
export function aplicarCor(hex: string) {
  if (typeof document === 'undefined') return;
  const cor = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : COR_PADRAO;
  const raiz = document.documentElement.style;
  raiz.setProperty('--brand', cor);
  raiz.setProperty('--brand-deep', cor);
  raiz.setProperty('--amber', cor);
  raiz.setProperty('--amber-deep', cor);
}

/** Volta à cor de fábrica — ao sair, para a tela de login não herdar a cor da organização anterior. */
export function limparCor() {
  aplicarCor(COR_PADRAO);
}

/** Para relatórios e exportações, que rodam fora do React. */
export function nomeDaOrganizacao(): string {
  return useMarca.getState().organizacao?.nome ?? PRODUTO.nome;
}
