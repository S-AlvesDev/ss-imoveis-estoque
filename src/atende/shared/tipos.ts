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
}
