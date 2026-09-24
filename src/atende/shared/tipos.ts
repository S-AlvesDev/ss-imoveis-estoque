import type { Papel } from './papeis';
import type { CicloAtende, PlanoAtende, PlanoAtendeEfetivo } from './planos';

/** O que o navegador sabe de quem entrou. Vem do JWT e do /me. */
export interface SessaoAtende {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  empresa_id: string;
}

export interface PerguntaFrequente {
  pergunta: string;
  resposta: string;
}

/** Faixa de atendimento de um dia; nulo = fechado. */
export interface FaixaDeHorario {
  de: string;
  ate: string;
}

export type DiaDaSemana = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';
export const DIAS_DA_SEMANA: readonly DiaDaSemana[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
export const NOME_DO_DIA: Record<DiaDaSemana, string> = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };

export type HorarioDeAtendimento = Partial<Record<DiaDaSemana, FaixaDeHorario | null>>;

export interface Empresa {
  id: string;
  nome: string;
  slug: string;
  segmento: string | null;
  descricao: string | null;
  produtos_servicos: string | null;
  informacoes_ia: string | null;
  faq: PerguntaFrequente[];
  horario_atendimento: HorarioDeAtendimento;
  regras_atendimento: string | null;
  mensagem_fora_do_horario: string | null;
  /** A IA tria as conversas novas (Etapa 3). Desligada: tudo cai direto na fila geral. */
  triagem_ativa: boolean;
  /** Fora do horário, a IA manda a mensagem de fora do horário (ou a saudação dela). Desligado: silêncio até abrir. */
  responde_fora_do_horario: boolean;
  /** SLA: minutos sem resposta ao cliente até avisar quem atende/supervisiona; nulo = desligado. */
  sla_aviso_min: number | null;
  /** SLA: minutos até a conversa ir para a fila geral com prioridade alta; nulo = desligado. */
  sla_escalonar_min: number | null;
  criado_em: string;
}

export interface Time {
  id: string;
  nome: string;
  descricao_para_ia: string | null;
  palavras_chave: string[];
  ordem: number;
  ativo: boolean;
  /** Ids dos membros, para a tela montar sem segunda consulta. */
  membros: number[];
  /** Ids de quem supervisiona este time. */
  supervisores: number[];
}

export type Presenca = 'online' | 'ausente' | 'offline';

export interface Funcionario {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  presenca: Presenca;
  presenca_em: string | null;
  ultimo_acesso: string | null;
  criado_em: string;
  times: string[];
}

/** O que o shell carrega ao entrar: quem sou, a empresa, os times, a equipe. */
export interface BootstrapAtende {
  sessao: SessaoAtende;
  empresa: Empresa;
  times: Time[];
  equipe: Funcionario[];
  /** O WhatsApp da empresa, como está gravado (sem consultar a Evolution). */
  conexao: Conexao | null;
  /** A situação da assinatura da empresa e o plano que vale hoje. */
  conta: ContaAtende;
}

// ---------------------------------------------------------------------------
//  Fase 3 (SEVLA): o plano da empresa
// ---------------------------------------------------------------------------

export type SituacaoDaContaAtende = 'assinada' | 'avaliacao' | 'carencia' | 'bloqueada';

/** O mesmo shape da conta do Stok Aí (src/shared/planos.ts), sem "encerrada": o Atende ainda não encerra empresa. */
export interface ContaAtende {
  situacao: SituacaoDaContaAtende;
  /** O plano que vale hoje: na avaliação e na carência ainda vale; bloqueada não vale nenhum. */
  plano: PlanoAtendeEfetivo;
  /** Quando a situação atual termina. Nulo = sem prazo (cortesia, ou empresa de antes da cobrança). */
  ate: string | null;
  dias_restantes: number | null;
  /** Automática (cartão) ou manual; nulo sem cobrança. */
  renovacao: 'automatica' | 'manual' | null;
}

export type StatusDaAssinaturaAtende = 'pendente' | 'autorizada' | 'pausada' | 'cancelada';

/** Um pedido de contratação (ou a assinatura, quando houver gateway). */
export interface AssinaturaAtende {
  id: string;
  plano: PlanoAtende;
  ciclo: CicloAtende;
  /** Por mês, no ciclo escolhido. */
  valor: number;
  status: StatusDaAssinaturaAtende;
  payer_email: string | null;
  /** A próxima cobrança agendada no gateway; nulo sem gateway. */
  proxima_cobranca: string | null;
  created_at: string;
  autorizada_em: string | null;
  cancelada_em: string | null;
  /** O combo da SEVLA de onde veio (essencial/profissional/empresarial); nulo = assinatura avulsa. */
  combo?: string | null;
}

/** Uma cobrança da assinatura (o mesmo shape do Stok Aí: recibo e nota fiscal reaproveitam o código). */
export interface PagamentoAtende {
  id: string;
  status: 'agendado' | 'aprovado' | 'recusado' | 'cancelado' | 'reembolsado' | 'pendente';
  valor: number;
  moeda: string;
  detalhe: string | null;
  data: string;
  metodo: 'cartao' | 'pix' | 'boleto';
  plano: PlanoAtende | null;
  ciclo: CicloAtende | null;
  periodo_de: string | null;
  periodo_ate: string | null;
  mp_payment_id: string | null;
  nf_status: 'pendente' | 'emitida' | 'erro' | 'cancelada' | null;
  nf_numero: string | null;
  nf_url: string | null;
  recibo_enviado_em: string | null;
  /** O combo da SEVLA: este Pix/boleto é a parte do Atende Aí de um pagamento único com o Stok Aí. */
  combo?: string | null;
}

/** Quem aparece no recibo e na nota fiscal. */
export interface FaturamentoAtende {
  nome: string;
  tipoDoc: 'CPF' | 'CNPJ';
  doc: string;
  email?: string | null;
  endereco?: { cep: string; rua: string; numero: string; bairro: string; cidade: string; uf: string } | null;
}

/** GET /api/atende/assinatura — o que a tela de plano mostra. */
export interface SituacaoDaAssinatura {
  conta: ContaAtende;
  /** O pedido pendente ou a assinatura em vigor; nulo quando não há nenhum. */
  assinatura: AssinaturaAtende | null;
  /** Quantas pessoas ativas e setores existem — para a tela mostrar "3 de 10". */
  uso: { atendentes: number; times: number };
  /** O Mercado Pago está ligado: "Assinar" leva ao checkout. Senão, o pedido vai por e-mail para a equipe. */
  pagamento_online: boolean;
  /** As cobranças, mais recentes primeiro (vazio até a primeira). */
  pagamentos: PagamentoAtende[];
  /** Dados de faturamento cadastrados (nulo = recibo em nome de quem assinou; sem nota fiscal). */
  faturamento: FaturamentoAtende | null;
}

// ---------------------------------------------------------------------------
//  Etapa 2: WhatsApp, clientes, conversas e mensagens
// ---------------------------------------------------------------------------

export type EstadoDaConexao = 'aguardando_qr' | 'conectando' | 'conectada' | 'desconectada';

export interface Conexao {
  id: string;
  instancia: string;
  numero: string | null;
  estado: EstadoDaConexao;
  conectado_em: string | null;
  ultimo_evento_em: string | null;
}

export interface Cliente {
  id: string;
  telefone: string;
  nome: string | null;
  nome_whatsapp: string | null;
  foto_url: string | null;
  email: string | null;
  observacoes: string | null;
  /** false = a IA não tria as conversas deste contato; elas vão direto para a fila. */
  ia_ativa: boolean;
  primeiro_contato_em: string;
  ultimo_contato_em: string;
}

export type EstadoDaConversa = 'nova' | 'em_triagem' | 'na_fila' | 'em_atendimento' | 'aguardando_cliente' | 'encerrada';
export const ESTADOS_DA_CONVERSA: readonly EstadoDaConversa[] = ['nova', 'em_triagem', 'na_fila', 'em_atendimento', 'aguardando_cliente', 'encerrada'];
export const NOME_DO_ESTADO: Record<EstadoDaConversa, string> = {
  nova: 'Nova',
  em_triagem: 'Em triagem',
  na_fila: 'Na fila',
  em_atendimento: 'Em atendimento',
  aguardando_cliente: 'Aguardando cliente',
  encerrada: 'Encerrada',
};

export type Prioridade = 'baixa' | 'normal' | 'alta' | 'urgente';

/** As abas da lista de conversas. */
export type Filtro = 'abertas' | 'minhas' | 'fila' | 'aguardando' | 'encerradas' | 'todas';

export interface Conversa {
  id: string;
  cliente_id: string;
  cliente: Cliente;
  conexao_id: string | null;
  estado: EstadoDaConversa;
  time_id: string | null;
  atendente_id: number | null;
  prioridade: Prioridade;
  assunto: string | null;
  intencao: string | null;
  resumo: string | null;
  aberta_em: string;
  primeira_resposta_em: string | null;
  ultima_mensagem_em: string;
  ultima_mensagem_do_cliente_em: string | null;
  ultima_mensagem_texto: string | null;
  ultima_mensagem_de: string | null;
  nao_lidas: number;
  encerrada_em: string | null;
  /** Avaliação do atendimento (0 a 10): quando foi pedida e a nota, se o cliente respondeu. */
  avaliacao_pedida_em: string | null;
  avaliacao_nota: number | null;
  etiquetas: string[];
  atualizado_em: string;
}

/** Média, distribuição, por pessoa e os atendimentos mais bem avaliados — para a supervisão e o dashboard. */
export interface ResumoDeAvaliacoes {
  pedidas: number;
  respondidas: number;
  /** % respondidas entre as pedidas; nulo sem pedido. */
  taxa_de_resposta: number | null;
  media: number | null;
  /** Promotores (9–10) menos detratores (0–6), em %; nulo sem resposta. */
  nps: number | null;
  /** Quantas notas de 0 a 10, índice = nota. */
  distribuicao: number[];
  por_pessoa: Array<{ usuario_id: number; avaliacoes: number; media: number }>;
  melhores: Array<{ conversa_id: string; nota: number; comentario: string | null; cliente: string; atendente_id: number | null; assunto: string | null; avaliada_em: string }>;
}

export type DirecaoDaMensagem = 'entrada' | 'saida' | 'interna' | 'sistema';
export type AutorDaMensagem = 'cliente' | 'atendente' | 'supervisor' | 'ia' | 'aparelho' | 'sistema';
export type TipoDaMensagem = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'figurinha' | 'localizacao' | 'contato' | 'outro';
export type StatusDaMensagem = 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou';

export interface MidiaDaMensagem {
  /** Caminho no bucket privado; a URL vem assinada, por /midias/:mensagemId. */
  caminho?: string;
  mimetype?: string;
  nome?: string;
  tamanho?: number;
  duracao?: number;
  largura?: number;
  altura?: number;
  latitude?: number;
  longitude?: number;
  contato?: { nome: string; telefone: string };
  /** A mídia ainda não foi baixada da Evolution (chegou a mensagem, o arquivo vem em seguida). */
  pendente?: boolean;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  direcao: DirecaoDaMensagem;
  autor_tipo: AutorDaMensagem;
  autor_id: number | null;
  tipo: TipoDaMensagem;
  texto: string | null;
  midia: MidiaDaMensagem | null;
  wa_id: string | null;
  status: StatusDaMensagem;
  erro: string | null;
  respondendo_a: string | null;
  criado_em: string;
}

export interface Etiqueta {
  id: string;
  nome: string;
  cor: string;
}

/** O que muda de um `sync` para o outro. */
export interface Delta {
  /** O carimbo para pedir o próximo delta. */
  cursor: string;
  conversas: Conversa[];
  mensagens: Mensagem[];
  equipe: Array<{ id: number; presenca: Presenca; presenca_em: string | null }>;
  conexao: Conexao | null;
}

// ---------------------------------------------------------------------------
//  Etapa 3: a triagem da IA e o lead
// ---------------------------------------------------------------------------

export type DesfechoDaTriagem = 'atribuida' | 'na_fila' | 'esclarecendo' | 'sem_time' | 'simulacao';

/** Uma decisão da IA sobre uma conversa (uma linha por rodada). */
export interface Triagem {
  id: string;
  conversa_id: string;
  rodada: number;
  assunto: string | null;
  intencao: string | null;
  time_sugerido_id: string | null;
  atendente_sugerido_id: number | null;
  prioridade: Prioridade;
  confianca: number | null;
  resumo: string | null;
  pediu_esclarecimento: boolean;
  resposta_enviada: string | null;
  desfecho: DesfechoDaTriagem;
  modelo: string | null;
  corrigido_por: number | null;
  time_corrigido_id: string | null;
  corrigido_em: string | null;
  motivo_correcao: string | null;
  criado_em: string;
}

export type EstadoDoLead = 'novo' | 'em_atendimento' | 'em_negociacao' | 'aguardando_cliente' | 'convertido' | 'perdido';
export const ESTADOS_DO_LEAD: readonly EstadoDoLead[] = ['novo', 'em_atendimento', 'em_negociacao', 'aguardando_cliente', 'convertido', 'perdido'];
export const NOME_DO_ESTADO_DO_LEAD: Record<EstadoDoLead, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  em_negociacao: 'Em negociação',
  aguardando_cliente: 'Aguardando cliente',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

export type SugestaoDeLead = 'quente' | 'morno' | 'frio' | 'nao_e_lead';
export const NOME_DA_SUGESTAO: Record<SugestaoDeLead, string> = { quente: 'Quente', morno: 'Morno', frio: 'Frio', nao_e_lead: 'Não é lead' };

/**
 * A etapa do financiamento MCMV — uma dimensão PARALELA ao funil de vendas
 * (`EstadoDoLead`): um lead pode estar "em negociação" no funil geral e, ao
 * mesmo tempo, "em análise" no MCMV. `null` = nunca entrou nesse pipeline.
 */
export type EstadoMcmv = 'em_analise' | 'aprovado_condicionado' | 'aprovado' | 'reprovado';
export const ESTADOS_MCMV: readonly EstadoMcmv[] = ['em_analise', 'aprovado_condicionado', 'aprovado', 'reprovado'];
export const NOME_DO_ESTADO_MCMV: Record<EstadoMcmv, string> = {
  em_analise: 'Em análise',
  aprovado_condicionado: 'Aprovado condicionado',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
};

export type OrigemDoLead = 'whatsapp' | 'manual';

export const TIPOS_DE_DOCUMENTO = ['rg', 'cpf', 'comprovante_renda', 'contrato', 'outro'] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];
export const NOME_DO_TIPO_DE_DOCUMENTO: Record<TipoDeDocumento, string> = {
  rg: 'RG',
  cpf: 'CPF',
  comprovante_renda: 'Comprovante de renda',
  contrato: 'Contrato',
  outro: 'Outro',
};

export interface ItemDoPipelineMcmv {
  lead_id: string;
  conversa_id: string;
  cliente_id: string;
  cliente_nome: string;
  telefone: string;
  mcmv_status: EstadoMcmv;
  mcmv_iniciado_em: string;
  mcmv_atualizado_em: string;
}

export interface EventoMcmv {
  id: string;
  usuario_id: number | null;
  de: EstadoMcmv | null;
  para: EstadoMcmv;
  nota: string | null;
  criado_em: string;
}

/** Uma linha do quadro geral "Gestão de Leads" (supervisor/admin) — todo o funil, de todas as conversas. */
export interface ItemDoFunilDeLeads {
  lead_id: string;
  conversa_id: string;
  cliente_id: string;
  cliente_nome: string;
  telefone: string;
  estado: EstadoDoLead;
  mcmv_status: EstadoMcmv | null;
  valor: number | null;
  origem: OrigemDoLead;
  atendente_id: number | null;
  atualizado_em: string;
}

export interface DocumentoDoCliente {
  id: string;
  cliente_id: string;
  nome_arquivo: string;
  mimetype: string;
  tipo: TipoDeDocumento;
  tamanho: number | null;
  anexado_por: number | null;
  criado_em: string;
}

export interface Lead {
  id: string;
  conversa_id: string;
  cliente_id: string;
  estado: EstadoDoLead;
  sugestao_ia: SugestaoDeLead | null;
  valor: number | null;
  atualizado_por: number | null;
  criado_em: string;
  atualizado_em: string;
  /** A retomada sugerida pela IA (cliente em silêncio há 24 h), à espera de alguém enviar ou descartar. */
  followup_sugestao: string | null;
  followup_sugerido_em: string | null;
  followup_enviado_em: string | null;
  followup_descartado_em: string | null;
  mcmv_status: EstadoMcmv | null;
  mcmv_iniciado_em: string | null;
  mcmv_atualizado_em: string | null;
  origem: OrigemDoLead;
}

/** O que a simulação da triagem devolve (nada é gravado nem enviado). */
export interface SimulacaoDaTriagem {
  classificacao: {
    assunto: string;
    intencao: string;
    time_id: string | null;
    prioridade: Prioridade;
    confianca: number;
    resumo: string;
    lead: SugestaoDeLead;
    precisa_esclarecer: boolean;
    pergunta: string | null;
    resposta_ao_cliente: string | null;
  };
  nomeDoTime: string | null;
  uso: { tokens_entrada: number; tokens_cache: number; tokens_saida: number; modelo: string } | null;
  /** false = sem chave da IA neste servidor; a triagem usou palavras-chave. */
  ia: boolean;
}

// ---------------------------------------------------------------------------
//  Etapa 5: o dashboard — só o que está no banco, contado
// ---------------------------------------------------------------------------

export type PeriodoDoDashboard = 'hoje' | '7d' | '30d' | '90d';
export const NOME_DO_PERIODO: Record<PeriodoDoDashboard, string> = { hoje: 'Hoje', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias' };

export interface LinhaPorPessoa {
  usuario_id: number;
  conversas: number;
  encerradas: number;
  primeira_resposta_mediana_s: number | null;
  primeira_resposta_media_s: number | null;
  mensagens_enviadas: number;
  leads_convertidos: number;
  valor_convertido: number;
}

export interface LinhaPorSetor {
  /** null = conversas sem setor. */
  time_id: string | null;
  conversas: number;
  encerradas: number;
  na_fila_agora: number;
  primeira_resposta_mediana_s: number | null;
  leads_convertidos: number;
}

export interface Dashboard {
  periodo: { de: string; ate: string };
  atendimentos: {
    abertas_no_periodo: number;
    encerradas_no_periodo: number;
    abertas_agora: number;
    na_fila_agora: number;
    /** Abertas pelo cliente no período que ninguém da equipe respondeu ainda. */
    sem_resposta_humana: number;
    primeira_resposta_mediana_s: number | null;
    primeira_resposta_media_s: number | null;
    resolucao_mediana_s: number | null;
    resolucao_media_s: number | null;
    mensagens_do_cliente: number;
    mensagens_da_equipe: number;
    mensagens_da_ia: number;
  };
  /** Conversas abertas por dia, cada dia do período (zero incluído). */
  serie: Array<{ dia: string; conversas: number }>;
  leads: {
    total: number;
    funil: Record<EstadoDoLead, number>;
    convertidos: number;
    perdidos: number;
    /** % de convertidos entre os decididos (convertido + perdido); nulo sem decisão. */
    taxa_de_conversao: number | null;
    valor_convertido: number;
    sugestoes_da_ia: Record<string, number>;
  };
  ia: {
    triagens: number;
    decisoes: number;
    conversas_triadas: number;
    esclarecimentos: number;
    corrigidas: number;
    taxa_de_correcao: number | null;
    confianca_media: number | null;
    intencoes: Record<string, number>;
    tokens: { entrada: number; cache: number; saida: number };
    modelos: string[];
  };
  por_pessoa: LinhaPorPessoa[];
  /** As avaliações pedidas no período. */
  avaliacoes: ResumoDeAvaliacoes;
  por_setor: LinhaPorSetor[];
}
