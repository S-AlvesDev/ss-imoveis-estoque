import { type AnchorHTMLAttributes, type MouseEvent, createElement } from 'react';
import { create } from 'zustand';

/**
 * As rotas públicas do produto. Por dentro, depois de entrar, o sistema
 * navega por estado (Sidebar) e fica sempre em "/".
 */
export const ROTAS = {
  home: '/',
  entrar: '/entrar',
  criarConta: '/criar-conta',
  esqueciSenha: '/esqueci-senha',
  /** Chega por link de e-mail, com ?token=... */
  redefinirSenha: '/redefinir-senha',
  /** Para onde o Mercado Pago devolve a pessoa depois do checkout, com ?preapproval_id=... */
  assinaturaRetorno: '/assinatura/retorno',
  termos: '/termos',
  privacidade: '/privacidade',
} as const;

export type Rota = (typeof ROTAS)[keyof typeof ROTAS];

interface RouterState {
  path: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

/**
 * Um roteador de três rotas não precisa de biblioteca: o caminho da URL vira
 * estado, e navegar é empurrar no histórico e avisar quem lê.
 */
export const useRouter = create<RouterState>()((set) => ({
  path: typeof window === 'undefined' ? ROTAS.home : window.location.pathname,
  navigate: (to, { replace = false } = {}) => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== to) {
      window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
    }
    window.scrollTo({ top: 0 });
    set({ path: to });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => useRouter.setState({ path: window.location.pathname }));
}

/**
 * Um <a> de verdade — botão do meio, Ctrl+clique e leitores de tela
 * funcionam como sempre — que, num clique comum, navega sem recarregar.
 */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const navigate = useRouter((s) => s.navigate);
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!href.startsWith('/')) return; // âncoras (#secao) e links externos seguem o navegador
    e.preventDefault();
    navigate(href);
  }
  return createElement('a', { href, onClick: handleClick, ...rest });
}
