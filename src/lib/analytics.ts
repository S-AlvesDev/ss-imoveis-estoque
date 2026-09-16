import { track as vercelTrack } from '@vercel/analytics';

/**
 * Os eventos que a Home dispara, com nome fixo para o painel da Vercel não
 * virar uma lista de variações. Cada um responde a uma pergunta comercial:
 * o hero convence? as pessoas chegam ao fim? o mockup atrai clique?
 */
export type Evento =
  | 'home_hero_cta' // qual dos dois botões do hero
  | 'home_scroll_50'
  | 'home_scroll_90'
  | 'home_mockup_tab' // qual aba do mockup
  | 'home_demo_click' // abriu o formulário, de onde
  | 'home_demo_submit' // enviou o formulário
  | 'home_plano_click' // clicou em começar num cartão de plano
  | 'assinatura_iniciar' // foi para o checkout do Mercado Pago
  | 'assinatura_confirmada' // voltou do checkout com a assinatura ativa
  | 'jatoba_abrir' // abriu o assistente, em qual porta (home/painel)
  | 'jatoba_pergunta'; // mandou uma pergunta

type Props = Record<string, string | number | boolean>;

/**
 * Um ponto só para trocar de ferramenta. Em desenvolvimento a Vercel não
 * envia nada (só registra no console em modo debug), então dá para conferir
 * os eventos no DevTools antes de publicar.
 */
export function track(evento: Evento, props?: Props) {
  try {
    vercelTrack(evento, props);
  } catch {
    // Analytics nunca pode derrubar a página.
  }
}
