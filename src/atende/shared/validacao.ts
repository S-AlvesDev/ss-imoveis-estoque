import { ehPapel, type Papel } from './papeis';
import { DIAS_DA_SEMANA, type HorarioDeAtendimento, type PerguntaFrequente } from './tipos';

/**
 * O que entra pelas rotas do Atende Aí, conferido antes de chegar ao banco.
 * Puro (sem banco, sem rede) para ser testado à exaustão e usado pelas telas
 * para avisar antes de enviar. Cada função devolve o dado limpo ou o erro
 * para a pessoa — nunca os dois.
 */

export type Validado<T> = { ok: true; valor: T } | { ok: false; erro: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MIN_SENHA = 8;

const texto = (v: unknown, max: number): string | null => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

export function validarEmail(v: unknown): Validado<string> {
  const email = String(v ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) return { ok: false, erro: 'Informe um e-mail válido.' };
  return { ok: true, valor: email };
}

export function validarSenha(v: unknown): Validado<string> {
  const senha = String(v ?? '');
  if (senha.length < MIN_SENHA) return { ok: false, erro: `A senha deve ter pelo menos ${MIN_SENHA} caracteres.` };
  if (senha.length > 200) return { ok: false, erro: 'Senha longa demais.' };
  return { ok: true, valor: senha };
}

export function validarNome(v: unknown, rotulo = 'nome'): Validado<string> {
  const nome = String(v ?? '').trim();
  if (nome.length < 2 || nome.length > 80) return { ok: false, erro: `Informe o ${rotulo} (2 a 80 caracteres).` };
  return { ok: true, valor: nome };
}

export interface CadastroDeEmpresa {
  empresa: string;
  segmento: string | null;
  nome: string;
  email: string;
  senha: string;
}

export function validarCadastro(body: unknown): Validado<CadastroDeEmpresa> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const empresa = validarNome(b.empresa, 'nome da empresa');
  if (!empresa.ok) return empresa;
  const nome = validarNome(b.nome, 'seu nome');
  if (!nome.ok) return nome;
  const email = validarEmail(b.email);
  if (!email.ok) return email;
  const senha = validarSenha(b.senha);
  if (!senha.ok) return senha;
  return { ok: true, valor: { empresa: empresa.valor, segmento: texto(b.segmento, 60), nome: nome.valor, email: email.valor, senha: senha.valor } };
}

export interface DadosDaEmpresa {
  nome?: string;
  segmento?: string | null;
  descricao?: string | null;
  produtos_servicos?: string | null;
  informacoes_ia?: string | null;
  faq?: PerguntaFrequente[];
  horario_atendimento?: HorarioDeAtendimento;
  regras_atendimento?: string | null;
  mensagem_fora_do_horario?: string | null;
  triagem_ativa?: boolean;
  responde_fora_do_horario?: boolean;
  sla_aviso_min?: number | null;
  sla_escalonar_min?: number | null;
}

/** O PATCH da empresa: só o que veio é validado e devolvido; o resto fica como está. */
export function validarEmpresa(body: unknown): Validado<DadosDaEmpresa> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const d: DadosDaEmpresa = {};
  if (b.nome !== undefined) {
    const n = validarNome(b.nome, 'nome da empresa');
    if (!n.ok) return n;
    d.nome = n.valor;
  }
  if (b.segmento !== undefined) d.segmento = texto(b.segmento, 60);
  if (b.descricao !== undefined) d.descricao = texto(b.descricao, 2000);
  if (b.produtos_servicos !== undefined) d.produtos_servicos = texto(b.produtos_servicos, 4000);
  if (b.informacoes_ia !== undefined) d.informacoes_ia = texto(b.informacoes_ia, 4000);
  if (b.regras_atendimento !== undefined) d.regras_atendimento = texto(b.regras_atendimento, 2000);
  if (b.mensagem_fora_do_horario !== undefined) d.mensagem_fora_do_horario = texto(b.mensagem_fora_do_horario, 500);
  if (b.triagem_ativa !== undefined) d.triagem_ativa = b.triagem_ativa === true;
  if (b.responde_fora_do_horario !== undefined) d.responde_fora_do_horario = b.responde_fora_do_horario === true;
  // SLA: inteiros em minutos, ou nulo (desligado). Escalonar depois de avisar.
  const minutos = (v: unknown, max: number): number | null | false => {
    if (v === null || v === '' || v === undefined) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= max ? n : false;
  };
  if (b.sla_aviso_min !== undefined) {
    const n = minutos(b.sla_aviso_min, 1440);
    if (n === false) return { ok: false, erro: 'O aviso do SLA precisa ser um número de minutos entre 1 e 1440.' };
    d.sla_aviso_min = n;
  }
  if (b.sla_escalonar_min !== undefined) {
    const n = minutos(b.sla_escalonar_min, 2880);
    if (n === false) return { ok: false, erro: 'O escalonamento do SLA precisa ser um número de minutos entre 1 e 2880.' };
    d.sla_escalonar_min = n;
  }
  if (d.sla_aviso_min && d.sla_escalonar_min && d.sla_escalonar_min <= d.sla_aviso_min) return { ok: false, erro: 'O escalonamento precisa vir depois do aviso (mais minutos).' };
  if (b.faq !== undefined) {
    if (!Array.isArray(b.faq) || b.faq.length > 50) return { ok: false, erro: 'A lista de perguntas frequentes é inválida (máximo 50).' };
    const faq: PerguntaFrequente[] = [];
    for (const item of b.faq) {
      const pergunta = texto((item as any)?.pergunta, 300);
      const resposta = texto((item as any)?.resposta, 1000);
      if (!pergunta || !resposta) return { ok: false, erro: 'Cada pergunta frequente precisa de pergunta e resposta.' };
      faq.push({ pergunta, resposta });
    }
    d.faq = faq;
  }
  if (b.horario_atendimento !== undefined) {
    const h = validarHorario(b.horario_atendimento);
    if (!h.ok) return h;
    d.horario_atendimento = h.valor;
  }
  if (Object.keys(d).length === 0) return { ok: false, erro: 'Nada para alterar.' };
  return { ok: true, valor: d };
}

export function validarHorario(v: unknown): Validado<HorarioDeAtendimento> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, erro: 'Horário de atendimento inválido.' };
  const saida: HorarioDeAtendimento = {};
  for (const dia of DIAS_DA_SEMANA) {
    const faixa = (v as Record<string, unknown>)[dia];
    if (faixa === undefined) continue;
    if (faixa === null) {
      saida[dia] = null;
      continue;
    }
    const de = String((faixa as any)?.de ?? '');
    const ate = String((faixa as any)?.ate ?? '');
    if (!HORA.test(de) || !HORA.test(ate)) return { ok: false, erro: `Horário de ${dia} inválido: use HH:MM.` };
    if (de >= ate) return { ok: false, erro: `Em ${dia}, o início precisa vir antes do fim.` };
    saida[dia] = { de, ate };
  }
  return { ok: true, valor: saida };
}

export interface DadosDoTime {
  nome: string;
  descricao_para_ia: string | null;
  palavras_chave: string[];
  ordem: number;
  ativo: boolean;
}

export function validarTime(body: unknown, atual?: Partial<DadosDoTime>): Validado<DadosDoTime> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const nome = String(b.nome ?? atual?.nome ?? '').trim();
  if (nome.length < 2 || nome.length > 60) return { ok: false, erro: 'Informe o nome do time (2 a 60 caracteres).' };
  let palavras = atual?.palavras_chave ?? [];
  if (b.palavras_chave !== undefined) {
    if (!Array.isArray(b.palavras_chave)) return { ok: false, erro: 'Palavras-chave inválidas.' };
    palavras = [...new Set(b.palavras_chave.map((p) => String(p).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
  }
  const ordem = b.ordem !== undefined ? Number(b.ordem) : (atual?.ordem ?? 0);
  if (!Number.isInteger(ordem) || ordem < 0 || ordem > 999) return { ok: false, erro: 'Ordem inválida.' };
  return {
    ok: true,
    valor: {
      nome,
      descricao_para_ia: b.descricao_para_ia !== undefined ? texto(b.descricao_para_ia, 1000) : (atual?.descricao_para_ia ?? null),
      palavras_chave: palavras,
      ordem,
      ativo: b.ativo !== undefined ? Boolean(b.ativo) : (atual?.ativo ?? true),
    },
  };
}

export interface NovoFuncionario {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
  times: string[];
}

export function validarNovoFuncionario(body: unknown): Validado<NovoFuncionario> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const nome = validarNome(b.nome);
  if (!nome.ok) return nome;
  const email = validarEmail(b.email);
  if (!email.ok) return email;
  const senha = validarSenha(b.senha);
  if (!senha.ok) return senha;
  if (!ehPapel(b.papel)) return { ok: false, erro: 'Papel inválido: use Administrador, Supervisor ou Atendente.' };
  const times = validarListaDeIds(b.times);
  if (!times.ok) return times;
  return { ok: true, valor: { nome: nome.valor, email: email.valor, senha: senha.valor, papel: b.papel, times: times.valor } };
}

export interface EdicaoDeFuncionario {
  nome?: string;
  email?: string;
  senha?: string;
  papel?: Papel;
  ativo?: boolean;
  times?: string[];
}

export function validarEdicaoDeFuncionario(body: unknown): Validado<EdicaoDeFuncionario> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const d: EdicaoDeFuncionario = {};
  if (b.nome !== undefined) {
    const n = validarNome(b.nome);
    if (!n.ok) return n;
    d.nome = n.valor;
  }
  if (b.email !== undefined) {
    const e = validarEmail(b.email);
    if (!e.ok) return e;
    d.email = e.valor;
  }
  if (b.senha !== undefined && b.senha !== '' && b.senha !== null) {
    const s = validarSenha(b.senha);
    if (!s.ok) return s;
    d.senha = s.valor;
  }
  if (b.papel !== undefined) {
    if (!ehPapel(b.papel)) return { ok: false, erro: 'Papel inválido: use Administrador, Supervisor ou Atendente.' };
    d.papel = b.papel;
  }
  if (b.ativo !== undefined) d.ativo = Boolean(b.ativo);
  if (b.times !== undefined) {
    const t = validarListaDeIds(b.times);
    if (!t.ok) return t;
    d.times = t.valor;
  }
  if (Object.keys(d).length === 0) return { ok: false, erro: 'Nada para alterar.' };
  return { ok: true, valor: d };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarListaDeIds(v: unknown): Validado<string[]> {
  if (v === undefined || v === null) return { ok: true, valor: [] };
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && UUID.test(x))) return { ok: false, erro: 'Lista de times inválida.' };
  return { ok: true, valor: [...new Set(v as string[])] };
}
