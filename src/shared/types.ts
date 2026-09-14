import type { Conta, Plano, PlanoEfetivo } from './planos';

/** A conta: a empresa dona dos dados. Nome, cor e logo são a identidade que as telas vestem. */
export interface Organizacao {
  id: string;
  nome: string;
  slug: string;
  /** #rrggbb, ou null para a cor de fábrica. */
  cor_primaria: string | null;
  logo_url: string | null;
  /** O plano contratado; null = sem assinatura (avaliação). */
  plano: Plano | null;
  plano_ate: string | null;
  /** Fim dos dias grátis de conta nova; null para quem já tem plano. */
  avaliacao_ate: string | null;
  /** O que vale de fato — o servidor já resolveu vencimento e avaliação. */
  plano_efetivo: PlanoEfetivo;
  /** A situação da conta: assinada, avaliação, carência ou bloqueada, com o prazo. */
  conta: Conta;
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
 *   entrega       entrega definitiva a uma pessoa (EPI, uniforme), com validade de troca.
 *   validade      saldo por lote com data de validade; saída consome o que vence primeiro.
 *   patrimonio    cada unidade é um item com número próprio, estado e responsável.
 */
export type ModoEstoque = 'almoxarifado' | 'emprestimo' | 'entrega' | 'validade' | 'patrimonio';

export type OperacaoGenerica = 'ENTRADA' | 'SAIDA' | 'CONSUMO' | 'TRANSFERENCIA' | 'AJUSTE';

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
  /** Almoxarifado: operações que a tela oferece. Nulo = todas. */
  operacoes_permitidas: OperacaoGenerica[] | null;
  /** Entrega: a pessoa assina na tela ao receber. */
  exige_assinatura: boolean;
  /** Validade: com quantos dias de antecedência avisar que um lote vence. */
  dias_aviso_validade: number;
}

/** Categoria de material, cadastro da organização. */
export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
}

/**
 * Uma retirada (empréstimo) ou uma entrega (EPI) — a mesma tabela, com `tipo`.
 * Aberta enquanto `devolvido_em` e `encerrado_em` forem nulos. No empréstimo,
 * `prazo_em` é quando devolver; na entrega, é "válido até" (a troca).
 */
export interface Emprestimo {
  id: string;
  tipo: 'emprestimo' | 'entrega';
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
  prazo_em: string | null;
  devolvido_em: string | null;
  retirada_matricula: string;
  devolucao_matricula: string | null;
  /** Entrega: PNG (data URL) da assinatura desenhada na tela. */
  assinatura: string | null;
  encerrado_em: string | null;
  encerramento: 'consumido' | 'substituido' | null;
  substituido_por: string | null;
}

/** Um lote de um material num estoque do modo validade. */
export interface Lote {
  id: string;
  warehouse_id: string;
  material_id: number;
  material_nome: string;
  unidade_medida: string;
  lote: string;
  /** AAAA-MM-DD, ou nulo (sem validade). */
  validade: string | null;
  quantidade: number;
  updated_at: string;
}

export type EstadoDoItem = 'disponivel' | 'em_uso' | 'manutencao' | 'baixado';

/** Um item de patrimônio: o material é o modelo, o item tem número próprio. */
export interface Item {
  id: string;
  warehouse_id: string;
  material_id: number;
  material_nome: string;
  codigo: string;
  serie: string | null;
  estado: EstadoDoItem;
  responsavel_nome: string | null;
  responsavel_referencia: string | null;
  local: string | null;
  observacao: string | null;
  adquirido_em: string | null;
  valor: number | null;
  created_at: string;
  updated_at: string;
}

export type TipoDeEventoDoItem = 'cadastro' | 'alocacao' | 'devolucao' | 'manutencao' | 'retorno' | 'baixa' | 'transferencia' | 'edicao';

export interface EventoDoItem {
  id: string;
  asset_id: string;
  tipo: TipoDeEventoDoItem;
  detalhe: string | null;
  para_nome: string | null;
  para_referencia: string | null;
  funcionario_matricula: string;
  created_at: string;
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
  /** Modo entrega: a cada quantos dias este material precisa ser trocado. Nulo = sem prazo. */
  validade_troca_dias: number | null;
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
  /** O WhatsApp da pessoa (só dígitos, com DDI) — é por ele que o assistente a reconhece. */
  whatsapp: string | null;
  /** Operações liberadas pelo WhatsApp; null = padrão do cargo. */
  whatsapp_operacoes: string[] | null;
  /** Tem PIN para confirmar gravações pelo WhatsApp. */
  whatsapp_pin_definido: boolean;
}
