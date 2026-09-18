/**
 * A marca do Atende Aí — o segundo produto da casa.
 *
 * Mesma família do Stok Aí ("… Aí", "…, no controle."), identidade própria:
 * azul-marinho profundo, roxo, violeta, lilás. Os arquivos ficam em
 * public/atende/. O símbolo é um "A" abstrato com três pontos — comunicação
 * sem o balão genérico.
 */
export const ATENDE = {
  nome: 'Atende Aí',
  slogan: 'Seu atendimento, no controle.',
  descricao: 'A central de atendimento do WhatsApp da sua empresa: a IA entende e encaminha, o atendente resolve, o supervisor acompanha — e os resultados aparecem.',
  /** O roxo da marca. */
  cor: '#7c3aed',
  corEscura: '#5b21b6',
  lilas: '#c4b5fd',
  /** O navy profundo do login e da supervisão. */
  navy: '#0b1020',
  navy2: '#141a3a',
  /** Onde o produto vive enquanto não tem domínio próprio. */
  base: '/atende',
  /**
   * O logo (símbolo + nome + slogan) tem o "Atende" em navy sobre fundo
   * transparente: só funciona em fundo claro. Em fundo escuro a marca é o
   * símbolo com o nome desenhado — ver app/Marca.tsx.
   */
  logoClaro: '/atende/logo_atendeai.png',
  simbolo: '/atende/favicon_atendeai.png',
} as const;

/** Endereço público do Atende Aí (o do Stok Aí + /atende, até existir domínio próprio). */
export function atendeUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${ATENDE.base}`;
}
