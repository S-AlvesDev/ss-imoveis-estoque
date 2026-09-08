import { ALL_INVENTORY_ROLES } from '@/shared/constants';

export const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  ADMINISTRATIVO: 'Administrativo',
  ALMOXARIFE_GERAL: 'Almoxarife Central',
  ALMOXARIFADO: 'Almoxarifado Central',
  ALMOXARIFE_OBRA: 'Almoxarife de Obra',
};

export const ROLE_HINTS: Record<string, string> = {
  ADMINISTRADOR: 'Acesso total: materiais, usuários, auditoria e suporte.',
  ADMINISTRATIVO: 'Acesso total ao estoque, incluindo cadastro e auditoria.',
  ALMOXARIFE_GERAL: 'Movimenta o almoxarifado central e envia remessas para a obra.',
  ALMOXARIFADO: 'Movimenta o almoxarifado central e envia remessas para a obra.',
  ALMOXARIFE_OBRA: 'Registra consumo na obra e devolve materiais para a central.',
};

/** Perfis que este gerenciador pode atribuir — nunca papéis do CRM. */
export const ASSIGNABLE_ROLES = ALL_INVENTORY_ROLES;

export const MIN_PASSWORD_LENGTH = 8;
