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
