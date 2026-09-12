/**
 * As categorias que o sistema tinha quando eram uma lista fixa. Hoje cada
 * organização tem as suas (tabela categories, migração 018); esta lista só
 * serve de exemplo para quem está começando do zero.
 */
export const CATEGORIAS_SUGERIDAS = [
  'Fundação e Estrutura',
  'Alvenaria e Vedação',
  'Instalações Elétricas/Hidráulicas',
  'Acabamento e Revestimento',
  'Equipamentos',
  'Geral',
] as const;

/** Nome antigo, ainda importado por alguns lugares. */
export const CATEGORIES = CATEGORIAS_SUGERIDAS;

export const ADMIN_ROLES = ['ADMINISTRADOR', 'ADMINISTRATIVO'];

/**
 * Quem não administra, opera — e o que pode operar é dito pelo acesso a cada
 * estoque, não pelo cargo. Os cargos ALMOXARIFE_* deixaram de existir na
 * migração 018; continuam aceitos para uma sessão emitida antes dela.
 */
export const OPERADOR = 'OPERADOR';
export const LEGACY_OPERATOR_ROLES = ['ALMOXARIFE_GERAL', 'ALMOXARIFADO', 'ALMOXARIFE_OBRA'];

/** Cargos que uma pessoa pode receber hoje. */
export const ASSIGNABLE_ROLES = ['ADMINISTRADOR', 'ADMINISTRATIVO', OPERADOR];

// Só para os testes de equivalência com o modelo antigo.
export const CENTRAL_ROLES = ['ALMOXARIFE_GERAL', 'ALMOXARIFADO', ...ADMIN_ROLES];
export const OBRA_ROLES = ['ALMOXARIFE_OBRA', ...ADMIN_ROLES];

export const ALL_INVENTORY_ROLES = Array.from(new Set([...ADMIN_ROLES, OPERADOR, ...LEGACY_OPERATOR_ROLES]));

export const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  ADMINISTRATIVO: 'Administrativo',
  OPERADOR: 'Operador',
  ALMOXARIFE_GERAL: 'Operador',
  ALMOXARIFADO: 'Operador',
  ALMOXARIFE_OBRA: 'Operador',
};

export const OPERATION_LABELS: Record<string, string> = {
  // Genéricas (estoques configuráveis, migração 018)
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  CONSUMO: 'Consumo',
  AJUSTE: 'Ajuste manual',
  TRANSFERENCIA: 'Transferência',
  EMPRESTIMO: 'Retirada (empréstimo)',
  DEVOLUCAO_EMPRESTIMO: 'Devolução (empréstimo)',
  ENTREGA: 'Entrega',
  DEVOLUCAO_ENTREGA: 'Devolução (entrega)',
  BAIXA: 'Baixa de patrimônio',
  // Antigas, do tempo de Central e Obra — continuam no histórico
  ENTRADA_CENTRAL: 'Entrada (Central)',
  REMESSA_OBRA: 'Remessa p/ Obra',
  DEVOLUCAO_CENTRAL: 'Devolução p/ Central',
  CONSUMO_OBRA: 'Consumo (Obra)',
  AJUSTE_CENTRAL: 'Ajuste Manual (Central)',
  AJUSTE_OBRA: 'Ajuste Manual (Obra)',
  DEVOLUCAO: 'Devolução (legado)',
  'AJUSTE MANUAL': 'Ajuste Manual (legado)',
  EXCLUSÃO: 'Exclusão de Material',
  UNIFICACAO: 'Unificação de Materiais',
};

/** Como cada modo de estoque se chama na tela. */
export const MODO_LABELS: Record<string, { nome: string; descricao: string; exemplos: string }> = {
  almoxarifado: { nome: 'Almoxarifado', descricao: 'Entrada, saída, consumo, ajuste e transferência entre estoques da unidade.', exemplos: 'Almoxarifado, depósito da obra, copa, material de escritório' },
  emprestimo: { nome: 'Empréstimo', descricao: 'Retirada por tempo limitado: quem pegou, o quê, quanto e até quando. Devolução fecha a retirada.', exemplos: 'Coordenação de esportes, laboratório, ferramentaria' },
  entrega: { nome: 'Entrega / EPI', descricao: 'Entrega definitiva a uma pessoa, com validade de troca por material, ficha por pessoa e termo de entrega.', exemplos: 'EPIs, uniformes, kit do aluno, crachás' },
  validade: { nome: 'Validade e lotes', descricao: 'Saldo por lote com data de validade. A saída consome o que vence primeiro; vencendo e vencido viram alerta.', exemplos: 'Farmácia, dispensa de merenda, laboratório, cosméticos' },
  patrimonio: { nome: 'Patrimônio', descricao: 'Cada unidade é um item com número próprio: estado, responsável, local e histórico.', exemplos: 'Notebooks, projetores, ferramentas caras, móveis' },
};

/** As operações de um almoxarifado, na ordem da tela. */
export const OPERACOES_ALMOXARIFADO: { value: 'ENTRADA' | 'SAIDA' | 'CONSUMO' | 'TRANSFERENCIA' | 'AJUSTE'; label: string; dica: string }[] = [
  { value: 'ENTRADA', label: 'Entrada', dica: 'Chegou de fora: compra, doação, devolução de terceiro.' },
  { value: 'SAIDA', label: 'Saída', dica: 'Saiu da empresa: venda, descarte, uso administrativo.' },
  { value: 'CONSUMO', label: 'Consumo', dica: 'Foi usado no trabalho: obra, manutenção, aula.' },
  { value: 'TRANSFERENCIA', label: 'Transferir', dica: 'Vai para outro estoque desta unidade. O total da unidade não muda.' },
  { value: 'AJUSTE', label: 'Ajuste', dica: 'Acerto de contagem, com sinal: +5 achou, −5 sumiu.' },
];

export const ESTADO_DO_ITEM: Record<string, { nome: string; cls: string }> = {
  disponivel: { nome: 'Disponível', cls: 'bg-[var(--verde)]/15 text-[var(--verde)]' },
  em_uso: { nome: 'Em uso', cls: 'bg-[var(--azul)]/15 text-[var(--azul)]' },
  manutencao: { nome: 'Manutenção', cls: 'bg-[var(--amarelo)]/15 text-[var(--amarelo)]' },
  baixado: { nome: 'Baixado', cls: 'bg-[var(--vermelho)]/15 text-[var(--vermelho)]' },
};
