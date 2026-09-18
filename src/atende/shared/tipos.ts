import type { Papel } from './papeis';

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
  etiquetas: string[];
  atualizado_em: string;
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
