import { ASSIGNABLE_ROLES as CARGOS, ROLE_LABELS as LABELS } from '@/shared/constants';

export const ROLE_LABELS: Record<string, string> = LABELS;

export const ROLE_HINTS: Record<string, string> = {
  ADMINISTRADOR: 'Acesso total: materiais, usuários, configurações, auditoria e suporte.',
  ADMINISTRATIVO: 'Acesso total ao estoque, incluindo cadastro e auditoria.',
  OPERADOR: 'Opera os estoques que receber em Configurações → Acessos. Não vê o resto.',
  ALMOXARIFE_GERAL: 'Cargo antigo — hoje é Operador.',
  ALMOXARIFADO: 'Cargo antigo — hoje é Operador.',
  ALMOXARIFE_OBRA: 'Cargo antigo — hoje é Operador.',
};

/** Perfis que este gerenciador pode atribuir: Administrador, Administrativo ou Operador. */
export const ASSIGNABLE_ROLES = CARGOS;

export const MIN_PASSWORD_LENGTH = 8;
