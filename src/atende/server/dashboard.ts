import type { RequisicaoAtende } from './auth';
import { visaoDe, type Visao } from './conversas';
import { FUSO_PADRAO } from './triagem';
import type { Dashboard, PeriodoDoDashboard, LinhaPorPessoa, LinhaPorSetor, EstadoDoLead } from '../shared/tipos';

/**
 * O dashboard do Atende Aí (Etapa 5): só o que está no banco, contado.
 * Nenhuma projeção, nenhuma estimativa — quando não há dado, o número é
 * zero e a tela diz "ainda nada".
 *
 * As linhas do período vêm em páginas de 1000 (o teto do PostgREST) com as
 * colunas mínimas, e a agregação é feita aqui, em funções puras testáveis.
 * Para o volume de uma central pequena/média isso é imediato; quando uma
 * empresa passar de milhares de conversas por mês, a saída é uma view
 * materializada — a forma da resposta não muda.
 */

export const PERIODOS: readonly PeriodoDoDashboard[] = ['hoje', '7d', '30d', '90d'];
const PAGINA = 1000;
const TETO = 10_000;

// ---------------------------------------------------------------------------
//  As linhas que a agregação lê (colunas mínimas)
// ---------------------------------------------------------------------------

export interface ConversaDoPeriodo {
  id: string;
  estado: string;
  time_id: string | null;
  atendente_id: number | null;
  aberta_em: string;
  primeira_resposta_em: string | null;
  encerrada_em: string | null;
  /** 'cliente' | 'aparelho' — quem abriu, pelo evento; sem evento, deduzido de primeira_resposta_em === aberta_em. */
  aberta_por?: string | null;
}

export interface LeadDoPeriodo {
  conversa_id: string;
  estado: EstadoDoLead;
  sugestao_ia: string | null;
  valor: number | null;
  criado_em: string;
}

export interface TriagemDoPeriodo {
  conversa_id: string;
  intencao: string | null;
  confianca: number | null;
  pediu_esclarecimento: boolean;
  desfecho: string;
  corrigido_em: string | null;
  tokens_entrada: number | null;
  tokens_cache: number | null;
  tokens_saida: number | null;
  modelo: string | null;
}

export interface MensagemDoPeriodo {
  autor_id: number | null;
  autor_tipo: string;
  direcao: string;
}

export interface DadosDoDashboard {
  conversas: ConversaDoPeriodo[];
  leads: LeadDoPeriodo[];
  triagens: TriagemDoPeriodo[];
  mensagens: MensagemDoPeriodo[];
  /** Conversas abertas agora (todas, não só as do período). */
  abertasAgora: Array<{ estado: string }>;
}

// ---------------------------------------------------------------------------
//  Período
// ---------------------------------------------------------------------------

/** Início do dia de hoje no fuso da empresa, em UTC. */
export function inicioDoDia(agora: Date, fuso = FUSO_PADRAO): Date {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
  const p = (t: string) => Number(partes.find((x) => x.type === t)?.value ?? 0);
  // O relógio local no fuso, lido como se fosse UTC, menos o tempo decorrido no dia = a meia-noite local em UTC.
  const decorrido = (p('hour') * 3600 + p('minute') * 60 + p('second')) * 1000 + (agora.getTime() % 1000);
  return new Date(agora.getTime() - decorrido);
}

export function intervaloDoPeriodo(periodo: PeriodoDoDashboard, agora = new Date(), fuso = FUSO_PADRAO): { de: Date; ate: Date } {
  const hoje = inicioDoDia(agora, fuso);
  const dias = periodo === 'hoje' ? 0 : periodo === '7d' ? 6 : periodo === '30d' ? 29 : 89;
  return { de: new Date(hoje.getTime() - dias * 86_400_000), ate: agora };
}

/** 'YYYY-MM-DD' no fuso da empresa — a chave da série diária. */
export function diaDe(iso: string, fuso = FUSO_PADRAO): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return `${p('year')}-${p('month')}-${p('day')}`;
}

// ---------------------------------------------------------------------------
//  Agregação (pura)
// ---------------------------------------------------------------------------

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return Math.round(valores.reduce((s, x) => s + x, 0) / valores.length);
}

/** Segundos até a primeira resposta humana — só conversas que o cliente abriu e alguém respondeu. */
function segundosDePrimeiraResposta(c: ConversaDoPeriodo): number | null {
  if (!c.primeira_resposta_em) return null;
  if (c.aberta_por === 'aparelho') return null;
  const s = (Date.parse(c.primeira_resposta_em) - Date.parse(c.aberta_em)) / 1000;
  // Empresa abriu pelo celular sem o evento dizer: resposta "instantânea" não é resposta.
  return s <= 0 ? null : Math.round(s);
}

function segundosDeResolucao(c: ConversaDoPeriodo): number | null {
  if (!c.encerrada_em) return null;
  const s = (Date.parse(c.encerrada_em) - Date.parse(c.aberta_em)) / 1000;
  return s < 0 ? null : Math.round(s);
}

const ESTADOS_DO_LEAD: EstadoDoLead[] = ['novo', 'em_atendimento', 'em_negociacao', 'aguardando_cliente', 'convertido', 'perdido'];

export function agregarDashboard(dados: DadosDoDashboard, periodo: { de: Date; ate: Date }, fuso = FUSO_PADRAO): Dashboard {
  const { conversas, leads, triagens, mensagens, abertasAgora } = dados;

  // ---- Atendimentos
  const encerradas = conversas.filter((c) => c.estado === 'encerrada');
  const primeiras = conversas.map(segundosDePrimeiraResposta).filter((s): s is number => s !== null);
  const resolucoes = encerradas.map(segundosDeResolucao).filter((s): s is number => s !== null);
  const semResposta = conversas.filter((c) => !c.primeira_resposta_em && c.estado !== 'encerrada' && c.aberta_por !== 'aparelho').length;

  // ---- Série diária (cada dia do período, mesmo zerado)
  const porDia = new Map<string, number>();
  for (let t = periodo.de.getTime(); t <= periodo.ate.getTime(); t += 86_400_000) porDia.set(diaDe(new Date(t).toISOString(), fuso), 0);
  porDia.set(diaDe(periodo.ate.toISOString(), fuso), porDia.get(diaDe(periodo.ate.toISOString(), fuso)) ?? 0);
  for (const c of conversas) {
    const d = diaDe(c.aberta_em, fuso);
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }
  const serie = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, conversas]) => ({ dia, conversas }));

  // ---- Leads
  const funil = Object.fromEntries(ESTADOS_DO_LEAD.map((e) => [e, 0])) as Record<EstadoDoLead, number>;
  let valorConvertido = 0;
  const sugestoes: Record<string, number> = {};
  for (const l of leads) {
    funil[l.estado] = (funil[l.estado] ?? 0) + 1;
    if (l.estado === 'convertido' && l.valor) valorConvertido += Number(l.valor);
    if (l.sugestao_ia) sugestoes[l.sugestao_ia] = (sugestoes[l.sugestao_ia] ?? 0) + 1;
  }
  const decididos = funil.convertido + funil.perdido;

  // ---- IA
  const decisoes = triagens.filter((t) => !t.pediu_esclarecimento && t.desfecho !== 'simulacao');
  const corrigidas = decisoes.filter((t) => t.corrigido_em).length;
  const confiancas = decisoes.map((t) => t.confianca).filter((c): c is number => typeof c === 'number');
  const intencoes: Record<string, number> = {};
  for (const t of decisoes) if (t.intencao) intencoes[t.intencao] = (intencoes[t.intencao] ?? 0) + 1;
  const tokens = triagens.reduce((s, t) => ({ entrada: s.entrada + (t.tokens_entrada ?? 0), cache: s.cache + (t.tokens_cache ?? 0), saida: s.saida + (t.tokens_saida ?? 0) }), { entrada: 0, cache: 0, saida: 0 });
  const conversasTriadas = new Set(decisoes.map((t) => t.conversa_id)).size;

  // ---- Por pessoa
  const leadPorConversa = new Map(leads.map((l) => [l.conversa_id, l]));
  const pessoas = new Map<number, LinhaPorPessoa>();
  const linhaDe = (id: number): LinhaPorPessoa => {
    let p = pessoas.get(id);
    if (!p) {
      p = { usuario_id: id, conversas: 0, encerradas: 0, primeira_resposta_mediana_s: null, primeira_resposta_media_s: null, mensagens_enviadas: 0, leads_convertidos: 0, valor_convertido: 0 };
      pessoas.set(id, p);
    }
    return p;
  };
  const primeirasPorPessoa = new Map<number, number[]>();
  for (const c of conversas) {
    if (!c.atendente_id) continue;
    const p = linhaDe(c.atendente_id);
    p.conversas++;
    if (c.estado === 'encerrada') p.encerradas++;
    const s = segundosDePrimeiraResposta(c);
    if (s !== null) primeirasPorPessoa.set(c.atendente_id, [...(primeirasPorPessoa.get(c.atendente_id) ?? []), s]);
    const l = leadPorConversa.get(c.id);
    if (l?.estado === 'convertido') {
      p.leads_convertidos++;
      p.valor_convertido += Number(l.valor ?? 0);
    }
  }
  for (const m of mensagens) {
    if (m.direcao !== 'saida' || !m.autor_id || m.autor_tipo === 'ia' || m.autor_tipo === 'aparelho') continue;
    linhaDe(m.autor_id).mensagens_enviadas++;
  }
  for (const [id, lista] of primeirasPorPessoa) {
    const p = linhaDe(id);
    p.primeira_resposta_mediana_s = mediana(lista);
    p.primeira_resposta_media_s = media(lista);
  }

  // ---- Por setor
  const setores = new Map<string | null, LinhaPorSetor>();
  const primeirasPorSetor = new Map<string | null, number[]>();
  for (const c of conversas) {
    let s = setores.get(c.time_id);
    if (!s) {
      s = { time_id: c.time_id, conversas: 0, encerradas: 0, na_fila_agora: 0, primeira_resposta_mediana_s: null, leads_convertidos: 0 };
      setores.set(c.time_id, s);
    }
    s.conversas++;
    if (c.estado === 'encerrada') s.encerradas++;
    if (c.estado === 'na_fila' || c.estado === 'nova' || c.estado === 'em_triagem') s.na_fila_agora++;
    const pr = segundosDePrimeiraResposta(c);
    if (pr !== null) primeirasPorSetor.set(c.time_id, [...(primeirasPorSetor.get(c.time_id) ?? []), pr]);
    if (leadPorConversa.get(c.id)?.estado === 'convertido') s.leads_convertidos++;
  }
  for (const [id, lista] of primeirasPorSetor) setores.get(id)!.primeira_resposta_mediana_s = mediana(lista);

  const mensagensDoCliente = mensagens.filter((m) => m.direcao === 'entrada').length;
  const mensagensDaEquipe = mensagens.filter((m) => m.direcao === 'saida' && m.autor_tipo !== 'ia').length;
  const mensagensDaIa = mensagens.filter((m) => m.direcao === 'saida' && m.autor_tipo === 'ia').length;

  return {
    periodo: { de: periodo.de.toISOString(), ate: periodo.ate.toISOString() },
    atendimentos: {
      abertas_no_periodo: conversas.length,
      encerradas_no_periodo: encerradas.length,
      abertas_agora: abertasAgora.length,
      na_fila_agora: abertasAgora.filter((c) => c.estado === 'na_fila' || c.estado === 'nova' || c.estado === 'em_triagem').length,
      sem_resposta_humana: semResposta,
      primeira_resposta_mediana_s: mediana(primeiras),
      primeira_resposta_media_s: media(primeiras),
      resolucao_mediana_s: mediana(resolucoes),
      resolucao_media_s: media(resolucoes),
      mensagens_do_cliente: mensagensDoCliente,
      mensagens_da_equipe: mensagensDaEquipe,
      mensagens_da_ia: mensagensDaIa,
    },
    serie,
    leads: {
      total: leads.length,
      funil,
      convertidos: funil.convertido,
      perdidos: funil.perdido,
      /** Convertidos sobre os decididos (convertido + perdido); nulo sem decisão ainda. */
      taxa_de_conversao: decididos ? Math.round((funil.convertido / decididos) * 1000) / 10 : null,
      valor_convertido: Math.round(valorConvertido * 100) / 100,
      sugestoes_da_ia: sugestoes,
    },
    ia: {
      triagens: triagens.filter((t) => t.desfecho !== 'simulacao').length,
      decisoes: decisoes.length,
      conversas_triadas: conversasTriadas,
      esclarecimentos: triagens.filter((t) => t.pediu_esclarecimento).length,
      corrigidas,
      taxa_de_correcao: decisoes.length ? Math.round((corrigidas / decisoes.length) * 1000) / 10 : null,
      confianca_media: confiancas.length ? Math.round((confiancas.reduce((s, x) => s + x, 0) / confiancas.length) * 100) / 100 : null,
      intencoes,
      tokens,
      modelos: [...new Set(triagens.map((t) => t.modelo).filter((m): m is string => Boolean(m)))],
    },
    por_pessoa: [...pessoas.values()].sort((a, b) => b.conversas - a.conversas || a.usuario_id - b.usuario_id),
    por_setor: [...setores.values()].sort((a, b) => b.conversas - a.conversas),
  };
}

// ---------------------------------------------------------------------------
//  As consultas
// ---------------------------------------------------------------------------

/** Todas as linhas de uma consulta, em páginas de 1000, até um teto. */
async function todas<T>(montar: () => any, teto = TETO): Promise<T[]> {
  const saida: T[] = [];
  for (let inicio = 0; inicio < teto; inicio += PAGINA) {
    const { data, error } = await montar().range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    const lote = (data || []) as T[];
    saida.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return saida;
}

/** Supervisor: só os times dele (e o que está com ele). Admin: tudo. */
function filtrarPelaVisao<T extends { time_id: string | null; atendente_id?: number | null }>(linhas: T[], visao: Visao): T[] {
  if (visao.tudo) return linhas;
  return linhas.filter((c) => (c.time_id && visao.supervisiona.includes(c.time_id)) || c.atendente_id === visao.eu);
}

export async function montarDashboard(req: RequisicaoAtende, periodo: PeriodoDoDashboard, agora = new Date()): Promise<Dashboard> {
  const db = req.dbAtende!;
  const visao = await visaoDe(req);
  const intervalo = intervaloDoPeriodo(periodo, agora);
  const de = intervalo.de.toISOString();

  const [conversasBrutas, aberturas, abertasAgora] = await Promise.all([
    todas<ConversaDoPeriodo>(() => db.from('atende_conversas').select('id, estado, time_id, atendente_id, aberta_em, primeira_resposta_em, encerrada_em').gte('aberta_em', de).order('aberta_em', { ascending: true })),
    todas<{ conversa_id: string; dados: { por?: string } | null }>(() => db.from('atende_eventos').select('conversa_id, dados').eq('tipo', 'aberta').gte('criado_em', de).order('criado_em', { ascending: true })),
    todas<{ estado: string; time_id: string | null; atendente_id: number | null }>(() => db.from('atende_conversas').select('estado, time_id, atendente_id').neq('estado', 'encerrada').order('aberta_em', { ascending: true })),
  ]);
  const abertaPor = new Map(aberturas.map((e) => [e.conversa_id, e.dados?.por ?? null]));
  const conversas = filtrarPelaVisao(
    conversasBrutas.map((c) => ({ ...c, atendente_id: c.atendente_id === null ? null : Number(c.atendente_id), aberta_por: abertaPor.get(c.id) ?? null })),
    visao,
  );
  const ids = new Set(conversas.map((c) => c.id));

  const [leads, triagens, mensagens] = await Promise.all([
    todas<LeadDoPeriodo>(() => db.from('atende_leads').select('conversa_id, estado, sugestao_ia, valor, criado_em').gte('criado_em', de).order('criado_em', { ascending: true })),
    todas<TriagemDoPeriodo>(() => db.from('atende_triagens').select('conversa_id, intencao, confianca, pediu_esclarecimento, desfecho, corrigido_em, tokens_entrada, tokens_cache, tokens_saida, modelo').gte('criado_em', de).order('criado_em', { ascending: true })),
    todas<MensagemDoPeriodo & { conversa_id: string }>(() => db.from('atende_mensagens').select('conversa_id, autor_id, autor_tipo, direcao').gte('criado_em', de).in('direcao', ['entrada', 'saida']).order('criado_em', { ascending: true })),
  ]);

  return agregarDashboard(
    {
      conversas,
      leads: leads.filter((l) => ids.has(l.conversa_id)).map((l) => ({ ...l, valor: l.valor === null ? null : Number(l.valor) })),
      triagens: triagens.filter((t) => ids.has(t.conversa_id)).map((t) => ({ ...t, confianca: t.confianca === null ? null : Number(t.confianca) })),
      mensagens: mensagens.filter((m) => ids.has(m.conversa_id)).map((m) => ({ ...m, autor_id: m.autor_id === null ? null : Number(m.autor_id) })),
      abertasAgora: filtrarPelaVisao(abertasAgora.map((c) => ({ ...c, atendente_id: c.atendente_id === null ? null : Number(c.atendente_id) })), visao),
    },
    intervalo,
  );
}
