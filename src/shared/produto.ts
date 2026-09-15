/**
 * A marca do PRODUTO — o que aparece antes de alguém entrar.
 *
 * Por dentro, cada organização veste a própria identidade (nome, cor, logo),
 * configurada em Configurações. Aqui é só o que é de todo mundo: a Home, a
 * tela de login, o título da aba, o rodapé de um relatório.
 *
 * Os arquivos da marca ficam em public/brand (gerados a partir de
 * design/brand). Trocar o nome é trocar aqui; trocar o desenho é trocar lá.
 */
export const PRODUTO = {
  nome: 'Stok Aí',
  slogan: 'Sua operação, no controle.',
  descricao:
    'Controle estoques, depósitos e unidades em um só lugar — e opere pelo WhatsApp: a equipe registra pelo celular, os fornecedores respondem cotações, e você decide com os dados na tela.',
  /** O laranja da marca. O do sistema por dentro é `--brand`, que a organização pode trocar. */
  cor: '#FF8A24',
  /** Fundo navy da Home e da tela de login. */
  navy: '#050B18',
  navy2: '#0B1426',
  /** Só dígitos, com DDI: é o formato que o wa.me exige. */
  whatsapp: '5584991434190',
  simbolo: '/brand/symbol.webp',
  simboloGrande: '/brand/symbol-512.png',
  /** Símbolo + nome. "Stok" em branco na versão escura, em preto na clara: cada fundo tem a sua. */
  logoHorizontal: { escuro: '/brand/logo-horizontal.webp', claro: '/brand/logo-horizontal-light.webp' },
  /** Símbolo + nome + slogan, idem. */
  logoComSlogan: { escuro: '/brand/logo-tagline.webp', claro: '/brand/logo-tagline-light.webp' },
} as const;

/** Link que abre a conversa no WhatsApp já com a mensagem escrita. */
export function linkWhatsApp(mensagem = 'Olá! Quero conhecer o Stok Aí.'): string {
  return `https://wa.me/${PRODUTO.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

/** +55 (84) 99128-4470 — para mostrar na tela. */
export function whatsappFormatado(): string {
  const d = PRODUTO.whatsapp;
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
}
