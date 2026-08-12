export const CATEGORIES = [
  'Fundação e Estrutura',
  'Alvenaria e Vedação',
  'Instalações Elétricas/Hidráulicas',
  'Acabamento e Revestimento',
  'Equipamentos',
  'Geral',
] as const;

export const ADMIN_ROLES = ['ADMINISTRADOR', 'ADMINISTRATIVO'];
export const CENTRAL_ROLES = ['ALMOXARIFE_GERAL', 'ALMOXARIFADO', ...ADMIN_ROLES];
export const OBRA_ROLES = ['ALMOXARIFE_OBRA', ...ADMIN_ROLES];
export const ALL_INVENTORY_ROLES = Array.from(new Set([...CENTRAL_ROLES, ...OBRA_ROLES]));

export const OPERATION_LABELS: Record<string, string> = {
  ENTRADA_CENTRAL: 'Entrada (Central)',
  SAIDA: 'Saída (Central)',
  REMESSA_OBRA: 'Remessa p/ Obra',
  DEVOLUCAO_CENTRAL: 'Devolução p/ Central',
  CONSUMO_OBRA: 'Consumo (Obra)',
  AJUSTE_CENTRAL: 'Ajuste Manual (Central)',
  AJUSTE_OBRA: 'Ajuste Manual (Obra)',
  ENTRADA: 'Entrada (legado)',
  DEVOLUCAO: 'Devolução (legado)',
  'AJUSTE MANUAL': 'Ajuste Manual (legado)',
  EXCLUSÃO: 'Exclusão de Material',
  UNIFICACAO: 'Unificação de Materiais',
};
