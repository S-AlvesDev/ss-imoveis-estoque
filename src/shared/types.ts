/** A conta: a empresa dona dos dados. Nome, cor e logo são a identidade que as telas vestem. */
export interface Organizacao {
  id: string;
  nome: string;
  slug: string;
  /** #rrggbb, ou null para a cor de fábrica. */
  cor_primaria: string | null;
  logo_url: string | null;
}

/** Uma filial: "Nova Cruz", "Natal". Cada unidade tem os próprios estoques. */
export interface Unidade {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
}

/** Marca de transição: o que era Central/Obra. Estoque novo é OUTRO. */
export type TipoDeposito = 'CENTRAL' | 'OBRA' | 'OUTRO';

/**
 * Como se opera um estoque.
 *   almoxarifado  entrada, saída, consumo, ajuste, transferência na unidade.
 *   emprestimo    retirada por tempo limitado, com devolução.
 */
export type ModoEstoque = 'almoxarifado' | 'emprestimo';

/** Um estoque: o lugar onde o material fica, com nome livre e um modo. Pertence a uma unidade. */
export interface Deposito {
  id: string;
  nome: string;
  tipo: TipoDeposito;
  unit_id: string;
  ativo: boolean;
  modo: ModoEstoque;
  /** Só no modo empréstimo: horas que uma retirada tem por padrão. */
  prazo_padrao_horas: number | null;
}

/** Categoria de material, cadastro da organização. */
export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
}

/** Uma retirada num estoque de empréstimo. Pendente enquanto `devolvido_em` for nulo. */
export interface Emprestimo {
  id: string;
  warehouse_id: string;
  material_id: number;
  material_nome: string;
  unidade_medida: string;
  quantidade: number;
  quantidade_devolvida: number;
  tomador_nome: string;
  tomador_referencia: string | null;
  observacao: string | null;
  retirado_em: string;
  prazo_em: string;
  devolvido_em: string | null;
  retirada_matricula: string;
  devolucao_matricula: string | null;
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
   * O saldo visto da UNIDADE SELECIONADA: a soma dos estoques dela e o saldo
   * em cada um. Derivados de `saldos` no cliente (useEstoqueData), não lidos
   * do servidor. É contra `saldo_unidade` que o mínimo se compara.
   */
  saldo_unidade: number;
  saldos_unidade: Record<string, number>;
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

/** O que uma pessoa pode num depósito. Administrador não tem atribuição: vê e opera tudo. */
export type NivelAcesso = 'OPERA' | 'CONSULTA';

export interface Acesso {
  warehouse_id: string;
  nivel: NivelAcesso;
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
  /** Depósitos que a pessoa vê/opera. Vazio para administrador (acesso implícito e total). */
  acessos: Acesso[];
}
