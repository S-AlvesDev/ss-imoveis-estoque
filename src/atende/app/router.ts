import { create } from 'zustand';
import { ATENDE } from '../shared/produto';

/**
 * As telas do Atende Aí, pela URL — tudo debaixo de /atende.
 *
 * Diferente do Stok Aí (que navega por estado depois do login), aqui cada
 * tela tem endereço: uma central de atendimento precisa de link para
 * "aquela conversa" e de botão Voltar que funcione.
 */
export const BASE = ATENDE.base;

export const TELAS = {
  entrar: 'entrar',
  /** Página pública de planos (a vitrine; a landing é a raiz /atende). */
  planos: 'planos',
  criarConta: 'criar-conta',
  esqueciSenha: 'esqueci-senha',
  redefinirSenha: 'redefinir-senha',
  central: 'central',
  supervisao: 'supervisao',
  /** O quadro geral do funil de vendas, todas as conversas — supervisor e admin. */
  leads: 'leads',
  dashboard: 'dashboard',
  /** As avaliações do atendimento (0 a 10), por período — supervisor e admin. */
  avaliacoes: 'avaliacoes',
  /** Disparo em massa por etiqueta. */
  campanhas: 'campanhas',
  /** O catálogo de itens da empresa — que o Jatobá também consulta. */
  inventario: 'inventario',
  /** Textos prontos para responder de um clique. */
  modelos: 'modelos',
  /** O pipeline de análise de MCMV — quem analisa não abre a Central. */
  mcmv: 'mcmv',
  empresa: 'empresa',
  times: 'times',
  equipe: 'equipe',
  whatsapp: 'whatsapp',
  /** O plano da empresa e a contratação (administrador). */
  plano: 'plano',
  conta: 'conta',
} as const;

export type Tela = (typeof TELAS)[keyof typeof TELAS];

/** As telas que existem antes de entrar. Qualquer outra exige sessão. */
export const TELAS_PUBLICAS: readonly Tela[] = [TELAS.entrar, TELAS.planos, TELAS.criarConta, TELAS.esqueciSenha, TELAS.redefinirSenha];

/** Nomes alternativos que as pessoas (e a SEVLA) usam: /atende/login é /atende/entrar. */
const ALIASES: Record<string, Tela> = { login: TELAS.entrar };

export function caminhoDe(tela: Tela, resto = ''): string {
  return `${BASE}/${tela}${resto ? `/${resto}` : ''}`;
}

/** "/atende/central/abc" → { tela: 'central', resto: 'abc' }. Fora de /atende ou raiz → tela nula (a raiz é a landing). */
export function lerCaminho(pathname: string): { tela: Tela | null; resto: string } {
  if (!pathname.startsWith(BASE)) return { tela: null, resto: '' };
  const partes = pathname.slice(BASE.length).split('/').filter(Boolean);
  const primeira = ALIASES[partes[0]] ?? partes[0];
  const tela = (Object.values(TELAS) as string[]).includes(primeira) ? (primeira as Tela) : null;
  return { tela, resto: partes.slice(1).join('/') };
}

interface Rota {
  path: string;
  ir: (tela: Tela, resto?: string) => void;
}

export const useRotaAtende = create<Rota>((set) => ({
  path: typeof window === 'undefined' ? BASE : window.location.pathname,
  ir: (tela, resto = '') => {
    const to = caminhoDe(tela, resto);
    if (typeof window !== 'undefined' && window.location.pathname !== to) window.history.pushState(null, '', to);
    set({ path: to });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => useRotaAtende.setState({ path: window.location.pathname }));
}
