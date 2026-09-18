/**
 * A marca do Cloud Aí — a casa dos sistemas "Aí".
 *
 * Não é um produto: é o guarda-chuva. Vende a família (Stok Aí, Atende Aí e
 * o que vier), os combos, e abre a porta de cada sistema. A cor da casa é o
 * espectro dos filhos: o laranja do Stok Aí, o violeta do Atende Aí, e um
 * ciano próprio, de "nuvem", para o que é só da casa.
 */
export const CLOUD = {
  nome: 'Cloud Aí',
  slogan: 'Sua empresa inteira, no controle.',
  descricao: 'Estoque, atendimento e o que vier — sistemas que nascem juntos, falam pelo WhatsApp da sua empresa e pensam com a mesma IA. Um por vez, ou todos.',
  cor: '#22d3ee',
  navy: '#050b18',
  navy2: '#0b1426',
  /** Onde a casa vive enquanto não tem domínio próprio (cloudai). */
  base: '/cloud',
} as const;

/** Ordem do espectro da casa: laranja (Stok) → violeta (Atende) → ciano (Cloud). */
export const ESPECTRO = ['#ff8a24', '#7c3aed', '#22d3ee'] as const;
