export interface Material {
  id: number;
  nome: string;
  unidade_medida: string;
  qtd_volumes: number;
  fator_multiplicador: number;
  saldo_central: number;
  saldo_obra: number;
  estoque_minimo: number;
  categoria: string;
  created_at: string;
  updated_at: string;
}

export interface MaterialMovement {
  id: number;
  material_id: number | null;
  tipo_operacao: string;
  quantidade: number;
  funcionario_matricula: string;
  justificativa: string | null;
  created_at: string;
  materials?: { nome: string } | null;
}

export interface StaffUser {
  id: number;
  nome: string;
  matricula: string;
  role: string;
}

export interface AuthUser {
  id: number;
  nome: string;
  matricula: string;
  role: string;
}

// --------------------------- SUPORTE ---------------------------

export type TicketTipo = 'DUPLICADO' | 'NOME_INCORRETO' | 'INFO_INCORRETA' | 'FALTA_CADASTRO' | 'OUTRO';
export type TicketStatus = 'ABERTO' | 'EM_ANALISE' | 'RESOLVIDO' | 'RECUSADO';
export type TicketPrioridade = 'BAIXA' | 'NORMAL' | 'ALTA';

export interface TicketMaterial {
  id: number;
  material_id: number | null;
  /** Nome no momento da abertura — sobrevive à exclusão ou unificação. */
  material_nome: string;
}

export interface SupportTicket {
  id: number;
  tipo: TicketTipo;
  assunto: string;
  descricao: string;
  status: TicketStatus;
  prioridade: TicketPrioridade;
  autor_matricula: string;
  autor_nome: string;
  autor_role: string;
  resolvido_por: string | null;
  resolucao: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  materiais: TicketMaterial[];
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  autor_matricula: string;
  autor_nome: string;
  mensagem: string;
  created_at: string;
}

// --------------------------- USUÁRIOS ---------------------------

export interface ManagedUser {
  id: number;
  nome: string;
  email: string | null;
  matricula: string;
  role: string;
  created_at: string;
  /** Sinaliza senha legada não hasheada, para a gestão poder forçar a troca. */
  senha_em_texto_puro: boolean;
}
