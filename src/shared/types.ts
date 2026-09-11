/** Uma filial: "Nova Cruz", "Natal". Toda unidade tem um Central e uma Obra. */
export interface Unidade {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
}

export type TipoDeposito = 'CENTRAL' | 'OBRA' | 'OUTRO';

/** O lugar onde o material fica. Pertence a uma unidade. */
export interface Deposito {
  id: string;
  nome: string;
  tipo: TipoDeposito;
  unit_id: string;
  ativo: boolean;
}

export interface Material {
  id: number;
  nome: string;
  unidade_medida: string;
  qtd_volumes: number;
  fator_multiplicador: number;
  /**
   * Saldo por depósito, para TODAS as unidades: { [depositoId]: saldo }.
   * É a fonte da verdade; os dois campos abaixo derivam dela.
   */
  saldos: Record<string, number>;
  /**
   * Saldo no Central e na Obra DA UNIDADE SELECIONADA. Derivados de `saldos`
   * no cliente (useEstoqueData), não lidos do servidor. Existem porque todo
   * lugar da interface que fala "Central" e "Obra" está falando da unidade
   * que a pessoa escolheu — e uma tela de almoxarifado mostra um almoxarifado.
   */
  saldo_central: number;
  saldo_obra: number;
  /**
   * Se o material existe na unidade selecionada (tem linha de saldo em algum
   * depósito dela). Derivado no cliente. Falso = a unidade não trabalha com
   * ele; não aparece nas telas de operação.
   */
  na_unidade: boolean;
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
