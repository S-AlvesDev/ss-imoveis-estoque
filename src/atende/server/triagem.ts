import { supabaseServer } from '../../lib/supabaseServer';
import { conversar, systemComCache, claudeConfigurado, type Ferramenta, type Uso, type MensagemDoChat } from '../../server/claude';
import { enviarTextoComId } from '../../server/evolution';
import { previaDe } from './eventos';
import { avisarSobreConversa } from './push';
import { presencaEfetiva, PRESENCA_VALIDA_MS } from '../shared/presenca';
import type { HorarioDeAtendimento, DiaDaSemana, Prioridade, PerguntaFrequente, TipoDaMensagem } from '../shared/tipos';

/**
 * A triagem da IA (Etapa 3): quando um cliente escreve e ninguém da empresa
 * está na conversa, a IA lê, entende o que a pessoa quer, escolhe o setor
 * (time) e a prioridade, resume para o atendente e — se a empresa quiser —
 * responde uma frase para o cliente não ficar no vácuo.
 *
 * O que a IA NÃO faz aqui: vender, negociar, prometer, inventar. Ela só
 * classifica e acolhe. Tudo que ela sabe da empresa vem do que a empresa
 * cadastrou (descrição, produtos, FAQ, regras, times). Toda decisão fica em
 * atende_triagens com o custo, e o supervisor pode corrigir.
 *
 * Roda dentro do webhook (sem sessão), então usa a chave de serviço com
 * `empresa_id` explícito em cada escrita — como whatsapp.ts.
 */

export const FUSO_PADRAO = 'America/Sao_Paulo';
export { PRESENCA_VALIDA_MS };
/** Rodadas de esclarecimento: a IA pergunta no máximo duas vezes; na terceira encaminha com o que tem. */
export const MAX_RODADAS_DE_ESCLARECIMENTO = 2;
/** Quantas mensagens da conversa a IA lê (as últimas). */
const HISTORICO = 12;

export const INTENCOES = ['comprar', 'orcamento', 'duvida', 'suporte', 'reclamacao', 'agendamento', 'financeiro', 'outro'] as const;
export type Intencao = (typeof INTENCOES)[number];
export const NOME_DA_INTENCAO: Record<Intencao, string> = {
  comprar: 'Quer comprar',
  orcamento: 'Pede orçamento',
  duvida: 'Tira dúvida',
  suporte: 'Precisa de suporte',
  reclamacao: 'Reclamação',
  agendamento: 'Quer agendar',
  financeiro: 'Financeiro',
  outro: 'Outro',
};

export const SUGESTOES_DE_LEAD = ['quente', 'morno', 'frio', 'nao_e_lead'] as const;
export type SugestaoDeLead = (typeof SUGESTOES_DE_LEAD)[number];

// ---------------------------------------------------------------------------
//  Horário de atendimento (puro, testável)
// ---------------------------------------------------------------------------

const DIA_POR_INDICE: DiaDaSemana[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

/** Dia da semana e HH:MM de `agora` no fuso da empresa. */
export function agoraNoFuso(agora: Date, fuso = FUSO_PADRAO): { dia: DiaDaSemana; hora: string } {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
  const pegar = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const indice = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(pegar('weekday'));
  return { dia: DIA_POR_INDICE[indice < 0 ? 0 : indice], hora: `${pegar('hour')}:${pegar('minute')}` };
}

/**
 * Sem horário cadastrado (objeto vazio) a empresa atende sempre. Com horário,
 * um dia ausente ou nulo é fechado; a faixa vale de `de` (inclusive) a `ate`
 * (exclusive).
 */
export function dentroDoHorario(horario: HorarioDeAtendimento | null | undefined, agora = new Date(), fuso = FUSO_PADRAO): boolean {
  if (!horario || Object.keys(horario).length === 0) return true;
  const { dia, hora } = agoraNoFuso(agora, fuso);
  const faixa = horario[dia];
  if (!faixa) return false;
  return hora >= faixa.de && hora < faixa.ate;
}

// ---------------------------------------------------------------------------
//  O que a IA recebe e o que devolve
// ---------------------------------------------------------------------------

export interface TimeParaTriagem {
  id: string;
  nome: string;
  descricao_para_ia: string | null;
  palavras_chave: string[];
}

export interface EmpresaParaTriagem {
  nome: string;
  segmento: string | null;
  descricao: string | null;
  produtos_servicos: string | null;
  informacoes_ia: string | null;
  faq: PerguntaFrequente[];
  regras_atendimento: string | null;
}

export interface Classificacao {
  assunto: string;
  intencao: Intencao;
  /** null = nenhum time se encaixa. */
  time_id: string | null;
  prioridade: Prioridade;
  confianca: number;
  resumo: string;
  lead: SugestaoDeLead;
  precisa_esclarecer: boolean;
  pergunta: string | null;
  resposta_ao_cliente: string | null;
}

export interface ResultadoDaClassificacao {
  classificacao: Classificacao;
  uso: Uso | null;
}

/** As regras que valem para toda empresa: vão primeiro no system, em cache. */
export const REGRAS_DA_TRIAGEM = [
  'Você é a triagem do atendimento de uma empresa pelo WhatsApp. Você recebe as mensagens de um cliente e classifica: o que a pessoa quer, qual setor da empresa deve atender, com que urgência — e escreve um resumo curto para o atendente humano que vai assumir.',
  '',
  'O que você faz:',
  '- Classifica a conversa chamando a ferramenta `classificar`. Sempre. Nunca responda em texto solto.',
  '- Escolhe o setor (time) entre os cadastrados pela empresa, pela descrição e pelas palavras-chave de cada um. Se nenhum se encaixa, escolha "nenhum".',
  '- Escreve o resumo para o atendente: 1 a 2 frases, objetivas, com o que o cliente quer, dados que ele já deu (produto, cidade, valor, prazo) e o que falta. Sem opinião.',
  '- Define a prioridade: "urgente" só para problema que impede o cliente agora (serviço parado, cobrança errada, prazo hoje) ou reclamação forte; "alta" para quem quer comprar/fechar agora ou tem prazo curto; "normal" para o resto; "baixa" para curiosidade sem urgência.',
  '- Sugere o lead: "quente" (quer comprar/fechar, pergunta preço ou disponibilidade de algo específico), "morno" (interesse, ainda pesquisando), "frio" (curiosidade, sem sinal de compra), "nao_e_lead" (suporte, reclamação, fornecedor, engano).',
  '- Se a mensagem não dá para classificar (só "oi", "bom dia", uma figurinha, um áudio sem texto), marque `precisa_esclarecer` e faça UMA pergunta curta e gentil para entender do que se trata. Se já houve pergunta antes e o cliente continua vago, NÃO pergunte de novo: encaminhe com o que tem.',
  '- Escreve `resposta_ao_cliente`: uma saudação curta (1 a 2 frases) confirmando que a mensagem foi recebida e que alguém do setor vai atender. Se `precisa_esclarecer`, a resposta É a pergunta. Use o tom da empresa, sem emoji em excesso.',
  '',
  'O que você NÃO faz — regras invioláveis:',
  '- Não vende, não negocia, não dá preço, não promete prazo, não confirma disponibilidade, não agenda. Isso é da equipe humana.',
  '- Não inventa nada sobre a empresa. Só use o que está no contexto abaixo (descrição, produtos, FAQ, regras). Se a pergunta do cliente tem resposta exata no FAQ, pode dar essa resposta em `resposta_ao_cliente` — e só ela.',
  '- Não se apresenta como pessoa. Se perguntarem, você é o atendimento automático da empresa.',
  '- Não pede documentos, senhas, cartão ou dados sensíveis.',
  '- Não responde sobre assuntos fora da empresa.',
  '- A conversa é em português do Brasil, no tratamento que o cliente usar.',
].join('\n');

function textoDosTimes(times: TimeParaTriagem[]): string {
  if (!times.length) return 'A empresa não cadastrou setores: escolha "nenhum".';
  return times.map((t) => `- id "${t.id}": ${t.nome}${t.descricao_para_ia ? ` — ${t.descricao_para_ia}` : ''}${t.palavras_chave.length ? ` (palavras-chave: ${t.palavras_chave.join(', ')})` : ''}`).join('\n');
}

/** O contexto da empresa — só o que ela cadastrou. Vai no bloco em cache (muda raramente). */
export function contextoDaEmpresa(empresa: EmpresaParaTriagem, times: TimeParaTriagem[]): string {
  const partes = [`## A empresa\nNome: ${empresa.nome}${empresa.segmento ? `\nSegmento: ${empresa.segmento}` : ''}`];
  if (empresa.descricao) partes.push(`Descrição: ${empresa.descricao}`);
  if (empresa.produtos_servicos) partes.push(`## Produtos e serviços\n${empresa.produtos_servicos}`);
  if (empresa.informacoes_ia) partes.push(`## Informações para o atendimento automático\n${empresa.informacoes_ia}`);
  if (empresa.faq.length) partes.push(`## Perguntas frequentes (respostas oficiais)\n${empresa.faq.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n')}`);
  if (empresa.regras_atendimento) partes.push(`## Regras de atendimento da empresa\n${empresa.regras_atendimento}`);
  partes.push(`## Setores (times) — use exatamente um destes ids, ou "nenhum"\n${textoDosTimes(times)}`);
  return partes.join('\n\n');
}

export function ferramentaClassificar(times: TimeParaTriagem[]): Ferramenta {
  return {
    name: 'classificar',
    description: 'Registra a triagem desta conversa: assunto, intenção, setor, prioridade, resumo e a resposta ao cliente.',
    input_schema: {
      type: 'object',
      properties: {
        assunto: { type: 'string', description: 'O que o cliente quer, em até 60 caracteres. Ex.: "Apartamento 2 quartos em Nova Cruz".' },
        intencao: { type: 'string', enum: [...INTENCOES] },
        time_id: { type: 'string', enum: [...times.map((t) => t.id), 'nenhum'], description: 'O id do setor que deve atender, ou "nenhum".' },
        prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'] },
        confianca: { type: 'number', minimum: 0, maximum: 1, description: 'Quanto você confia na escolha do setor (0 a 1).' },
        resumo: { type: 'string', description: 'Para o atendente: 1 a 2 frases com o que o cliente quer, o que já informou e o que falta.' },
        lead: { type: 'string', enum: [...SUGESTOES_DE_LEAD] },
        precisa_esclarecer: { type: 'boolean', description: 'true se não dá para classificar ainda e você vai perguntar.' },
        resposta_ao_cliente: { type: 'string', description: 'O que mandar ao cliente agora (1 a 2 frases). Se precisa_esclarecer, é a pergunta. Vazio para não mandar nada.' },
      },
      required: ['assunto', 'intencao', 'time_id', 'prioridade', 'confianca', 'resumo', 'lead', 'precisa_esclarecer', 'resposta_ao_cliente'],
    },
  };
}

export interface MensagemParaTriagem {
  direcao: 'entrada' | 'saida' | 'interna' | 'sistema';
  autor_tipo: string;
  tipo: string;
  texto: string | null;
}

/** As últimas mensagens viram o histórico do chat: cliente = user, IA/equipe = assistant. Notas e sistema ficam de fora. */
export function historicoDe(mensagens: MensagemParaTriagem[]): MensagemDoChat[] {
  const saida: MensagemDoChat[] = [];
  for (const m of mensagens) {
    if (m.direcao !== 'entrada' && m.direcao !== 'saida') continue;
    const role = m.direcao === 'entrada' ? 'user' : 'assistant';
    const texto = m.tipo === 'texto' ? (m.texto ?? '').trim() : `[${previaDe(m.tipo as TipoDaMensagem, null)}]${m.texto ? ` ${m.texto}` : ''}`;
    if (!texto) continue;
    const anterior = saida[saida.length - 1];
    // A API exige papéis alternados: mensagens seguidas do mesmo lado se juntam.
    if (anterior && anterior.role === role) anterior.content = `${anterior.content}\n${texto}`;
    else saida.push({ role, content: texto });
  }
  // Tem que começar e terminar com o cliente.
  while (saida.length && saida[0].role !== 'user') saida.shift();
  while (saida.length && saida[saida.length - 1].role !== 'user') saida.pop();
  return saida;
}

/** O que veio do modelo, saneado: enum fora da lista vira o padrão; time desconhecido vira nenhum. */
export function lerClassificacao(input: Record<string, unknown>, times: TimeParaTriagem[], podePerguntar: boolean): Classificacao {
  const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const ids = new Set(times.map((t) => t.id));
  const timeId = texto(input.time_id, 60);
  const intencao = (INTENCOES as readonly string[]).includes(String(input.intencao)) ? (input.intencao as Intencao) : 'outro';
  const prioridade = (['baixa', 'normal', 'alta', 'urgente'] as const).includes(input.prioridade as any) ? (input.prioridade as Prioridade) : 'normal';
  const lead = (SUGESTOES_DE_LEAD as readonly string[]).includes(String(input.lead)) ? (input.lead as SugestaoDeLead) : 'morno';
  const confianca = Number(input.confianca);
  const precisa = podePerguntar && input.precisa_esclarecer === true;
  const resposta = texto(input.resposta_ao_cliente, 600) || null;
  return {
    assunto: texto(input.assunto, 80) || 'Sem assunto definido',
    intencao,
    time_id: ids.has(timeId) ? timeId : null,
    prioridade,
    confianca: Number.isFinite(confianca) ? Math.min(1, Math.max(0, Math.round(confianca * 100) / 100)) : 0.5,
    resumo: texto(input.resumo, 600) || texto(input.assunto, 80) || 'Sem resumo.',
    lead,
    precisa_esclarecer: precisa,
    pergunta: precisa ? resposta : null,
    resposta_ao_cliente: resposta,
  };
}

/**
 * Sem chave da Anthropic, a triagem ainda funciona no básico: casa palavras-
 * chave dos times com o texto do cliente. Sem resposta ao cliente, sem
 * resumo inventado — o que não dá para saber fica em branco.
 */
export function classificarPorPalavrasChave(textoDoCliente: string, times: TimeParaTriagem[]): Classificacao {
  const t = textoDoCliente.toLowerCase();
  let melhor: { time: TimeParaTriagem; pontos: number } | null = null;
  for (const time of times) {
    const pontos = time.palavras_chave.filter((p) => p && t.includes(p.toLowerCase())).length;
    if (pontos > 0 && (!melhor || pontos > melhor.pontos)) melhor = { time, pontos };
  }
  return {
    assunto: textoDoCliente.trim().slice(0, 80) || 'Sem assunto definido',
    intencao: 'outro',
    time_id: melhor?.time.id ?? null,
    prioridade: 'normal',
    confianca: melhor ? 0.5 : 0,
    resumo: melhor ? `Encaminhado para ${melhor.time.nome} por palavras-chave (sem IA configurada).` : 'Sem IA configurada e nenhuma palavra-chave dos times apareceu na mensagem.',
    lead: 'morno',
    precisa_esclarecer: false,
    pergunta: null,
    resposta_ao_cliente: null,
  };
}

/** Uma chamada ao modelo com a ferramenta forçada: o resultado é o input da chamada. */
export async function classificar(args: { empresa: EmpresaParaTriagem; times: TimeParaTriagem[]; historico: MensagemDoChat[]; nomeDoCliente: string | null; rodada: number; agora?: Date }): Promise<ResultadoDaClassificacao> {
  const podePerguntar = args.rodada <= MAX_RODADAS_DE_ESCLARECIMENTO;
  if (!claudeConfigurado()) {
    const ultima = [...args.historico].reverse().find((m) => m.role === 'user');
    return { classificacao: classificarPorPalavrasChave(typeof ultima?.content === 'string' ? ultima.content : '', args.times), uso: null };
  }
  const agora = args.agora ?? new Date();
  const quando = agora.toLocaleString('pt-BR', { timeZone: FUSO_PADRAO, dateStyle: 'full', timeStyle: 'short' });
  const variavel = [
    `## Agora\n${quando}.`,
    `## O cliente\n${args.nomeDoCliente ? `Nome no WhatsApp: ${args.nomeDoCliente}.` : 'Sem nome no WhatsApp.'} Esta é a rodada ${args.rodada} da triagem desta conversa.${podePerguntar ? '' : ' Você JÁ perguntou o máximo permitido: classifique com o que tem e não pergunte de novo.'}`,
  ].join('\n\n');
  const historico = args.historico.length ? args.historico : [{ role: 'user' as const, content: '(mensagem sem texto)' }];
  const r = await conversar({
    system: systemComCache(`${REGRAS_DA_TRIAGEM}\n\n${contextoDaEmpresa(args.empresa, args.times)}`, variavel),
    historico,
    tools: [ferramentaClassificar(args.times)],
    // Nunca chega a executar: com a ferramenta forçada, o laço para na primeira chamada.
    executar: async () => 'ok',
    forcarFerramenta: 'classificar',
    maxTokens: 600,
    esforco: 'low',
    maxRodadas: 1,
  });
  const input = r.chamadas[0]?.input ?? {};
  return { classificacao: lerClassificacao(input, args.times, podePerguntar), uso: r.uso };
}

// ---------------------------------------------------------------------------
//  Quem recebe a conversa
// ---------------------------------------------------------------------------

export interface CandidatoAAtender {
  id: number;
  presenca: string;
  presenca_em: string | null;
  abertas: number;
}

/** Entre quem está online agora, quem tem menos conversas abertas. Ninguém online → null (vai para a fila). */
export function escolherAtendente(candidatos: CandidatoAAtender[], agora = Date.now()): number | null {
  const online = candidatos.filter((c) => presencaEfetiva(c, agora) === 'online');
  if (!online.length) return null;
  online.sort((a, b) => a.abertas - b.abertas || a.id - b.id);
  return online[0].id;
}

async function candidatosDoTime(empresaId: string, timeId: string): Promise<CandidatoAAtender[]> {
  const { data: membros } = await supabaseServer.from('atende_time_membros').select('usuario_id, usuario:atende_usuarios(id, ativo, presenca, presenca_em)').eq('time_id', timeId);
  const pessoas = ((membros || []) as any[]).map((m) => m.usuario).filter((u) => u && u.ativo);
  if (!pessoas.length) return [];
  const ids = pessoas.map((u) => Number(u.id));
  const { data: abertas } = await supabaseServer.from('atende_conversas').select('atendente_id').eq('empresa_id', empresaId).in('atendente_id', ids).in('estado', ['em_atendimento', 'aguardando_cliente']);
  const contagem = new Map<number, number>();
  for (const c of (abertas || []) as any[]) contagem.set(Number(c.atendente_id), (contagem.get(Number(c.atendente_id)) ?? 0) + 1);
  return pessoas.map((u) => ({ id: Number(u.id), presenca: u.presenca, presenca_em: u.presenca_em, abertas: contagem.get(Number(u.id)) ?? 0 }));
}

// ---------------------------------------------------------------------------
//  A triagem de uma conversa, de ponta a ponta
// ---------------------------------------------------------------------------

export type Desfecho = 'atribuida' | 'na_fila' | 'esclarecendo' | 'sem_time' | 'simulacao';

export interface ResultadoDaTriagem {
  triagemId: string | null;
  desfecho: Desfecho;
  classificacao: Classificacao;
  atendenteId: number | null;
  /** O que foi mandado ao cliente (nulo se nada). */
  respostaEnviada: string | null;
  uso: Uso | null;
}

interface ConversaParaTriar {
  id: string;
  empresa_id: string;
  cliente_id: string;
  conexao_id: string | null;
  estado: string;
  cliente: { telefone: string; nome: string | null; nome_whatsapp: string | null } | null;
}

interface EmpresaCompleta extends EmpresaParaTriagem {
  id: string;
  triagem_ativa: boolean;
  responde_fora_do_horario: boolean;
  horario_atendimento: HorarioDeAtendimento;
  mensagem_fora_do_horario: string | null;
}

async function carregarEmpresa(empresaId: string): Promise<EmpresaCompleta | null> {
  const { data } = await supabaseServer.from('atende_empresas').select('id, nome, segmento, descricao, produtos_servicos, informacoes_ia, faq, regras_atendimento, horario_atendimento, mensagem_fora_do_horario, triagem_ativa, responde_fora_do_horario').eq('id', empresaId).maybeSingle();
  if (!data) return null;
  return { ...(data as any), faq: Array.isArray(data.faq) ? data.faq : [], horario_atendimento: data.horario_atendimento ?? {} };
}

async function carregarTimes(empresaId: string): Promise<TimeParaTriagem[]> {
  const { data } = await supabaseServer.from('atende_times').select('id, nome, descricao_para_ia, palavras_chave').eq('empresa_id', empresaId).eq('ativo', true).order('ordem').order('nome');
  return ((data || []) as any[]).map((t) => ({ ...t, palavras_chave: t.palavras_chave ?? [] }));
}

/** A empresa quer triagem? (Lido pelo webhook para decidir se a conversa nasce 'nova' ou 'na_fila'.) */
export async function triagemAtiva(empresaId: string): Promise<boolean> {
  const { data } = await supabaseServer.from('atende_empresas').select('triagem_ativa').eq('id', empresaId).maybeSingle();
  return data?.triagem_ativa !== false;
}

/**
 * Triagem de uma conversa que está em 'nova' ou 'em_triagem'. Chamada pelo
 * webhook depois de gravar a mensagem do cliente. Nunca deixa a conversa
 * presa: se a IA falhar, a conversa vai para a fila sem time.
 */
export async function triar(conversaId: string, mensagemId: string | null): Promise<ResultadoDaTriagem | null> {
  const { data: c } = await supabaseServer.from('atende_conversas').select('id, empresa_id, cliente_id, conexao_id, estado, cliente:atende_clientes(telefone, nome, nome_whatsapp)').eq('id', conversaId).maybeSingle();
  const conversa = c as unknown as ConversaParaTriar | null;
  if (!conversa || (conversa.estado !== 'nova' && conversa.estado !== 'em_triagem')) return null;
  const empresaId = conversa.empresa_id;

  // Reivindica a conversa: duas mensagens ao mesmo tempo não disparam duas triagens da primeira rodada.
  if (conversa.estado === 'nova') {
    const { data: minha } = await supabaseServer.from('atende_conversas').update({ estado: 'em_triagem' }).eq('id', conversaId).eq('estado', 'nova').select('id');
    if (!minha || (minha as any[]).length === 0) return null;
  }

  try {
    const [empresa, times, { data: historicoBruto }, { count: rodadasAnteriores }] = await Promise.all([
      carregarEmpresa(empresaId),
      carregarTimes(empresaId),
      supabaseServer.from('atende_mensagens').select('direcao, autor_tipo, tipo, texto').eq('conversa_id', conversaId).order('criado_em', { ascending: false }).limit(HISTORICO),
      supabaseServer.from('atende_triagens').select('id', { count: 'exact', head: true }).eq('conversa_id', conversaId).eq('pediu_esclarecimento', true),
    ]);
    if (!empresa) throw new Error('empresa não encontrada');
    const rodada = (rodadasAnteriores ?? 0) + 1;
    const historico = historicoDe(((historicoBruto || []) as MensagemParaTriagem[]).slice().reverse());
    const agora = new Date();

    const { classificacao, uso } = await classificar({ empresa, times, historico, nomeDoCliente: conversa.cliente?.nome ?? conversa.cliente?.nome_whatsapp ?? null, rodada, agora });

    const aberto = dentroDoHorario(empresa.horario_atendimento, agora);
    // Fora do horário, com a empresa em silêncio, não dá para perguntar: encaminha com o que tem.
    const podeFalar = aberto || empresa.responde_fora_do_horario;
    let desfecho: Desfecho;
    let atendenteId: number | null = null;
    const patch: Record<string, unknown> = {};

    if (classificacao.precisa_esclarecer && classificacao.pergunta && podeFalar) {
      desfecho = 'esclarecendo';
      patch.estado = 'em_triagem';
    } else {
      patch.assunto = classificacao.assunto;
      patch.intencao = classificacao.intencao;
      patch.prioridade = classificacao.prioridade;
      patch.resumo = classificacao.resumo;
      patch.time_id = classificacao.time_id;
      if (classificacao.time_id) {
        atendenteId = escolherAtendente(await candidatosDoTime(empresaId, classificacao.time_id), agora.getTime());
        if (atendenteId) {
          desfecho = 'atribuida';
          patch.atendente_id = atendenteId;
          patch.estado = 'em_atendimento';
        } else {
          desfecho = 'na_fila';
          patch.estado = 'na_fila';
        }
      } else {
        desfecho = 'sem_time';
        patch.estado = 'na_fila';
      }
    }

    // O que dizer ao cliente: fora do horário, a mensagem da empresa (se ela quiser responder); dentro, a da IA.
    let resposta: string | null = null;
    if (desfecho === 'esclarecendo') resposta = classificacao.pergunta;
    else if (aberto) resposta = classificacao.resposta_ao_cliente;
    else if (empresa.responde_fora_do_horario) resposta = empresa.mensagem_fora_do_horario?.trim() || classificacao.resposta_ao_cliente;

    await supabaseServer.from('atende_conversas').update(patch).eq('id', conversaId);

    const { data: triagem } = await supabaseServer
      .from('atende_triagens')
      .insert({
        empresa_id: empresaId,
        conversa_id: conversaId,
        mensagem_id: mensagemId,
        rodada,
        assunto: classificacao.assunto,
        intencao: classificacao.intencao,
        time_sugerido_id: classificacao.time_id,
        atendente_sugerido_id: atendenteId,
        prioridade: classificacao.prioridade,
        confianca: classificacao.confianca,
        resumo: classificacao.resumo,
        pediu_esclarecimento: desfecho === 'esclarecendo',
        resposta_enviada: resposta,
        desfecho,
        modelo: uso?.modelo ?? (claudeConfigurado() ? null : 'palavras-chave'),
        tokens_entrada: uso?.tokens_entrada ?? null,
        tokens_cache: uso?.tokens_cache ?? null,
        tokens_saida: uso?.tokens_saida ?? null,
      })
      .select('id')
      .single();

    if (desfecho !== 'esclarecendo') {
      // O lead nasce (ou é atualizado) com a sugestão da IA; o estado é da equipe.
      await supabaseServer.from('atende_leads').upsert({ empresa_id: empresaId, cliente_id: conversa.cliente_id, conversa_id: conversaId, sugestao_ia: classificacao.lead }, { onConflict: 'conversa_id', ignoreDuplicates: false });
      const nomeDoTime = classificacao.time_id ? times.find((t) => t.id === classificacao.time_id)?.nome ?? null : null;
      await supabaseServer.from('atende_eventos').insert({ empresa_id: empresaId, conversa_id: conversaId, tipo: 'triagem', dados: { triagem_id: triagem?.id ?? null, desfecho, time_id: classificacao.time_id, atendente_id: atendenteId, prioridade: classificacao.prioridade, confianca: classificacao.confianca } });
      if (atendenteId) await supabaseServer.from('atende_eventos').insert({ empresa_id: empresaId, conversa_id: conversaId, tipo: 'atribuida', dados: { por: 'ia', para: atendenteId, time_id: classificacao.time_id } });
      await supabaseServer.from('atende_mensagens').insert({
        empresa_id: empresaId,
        conversa_id: conversaId,
        direcao: 'sistema',
        autor_tipo: 'sistema',
        tipo: 'texto',
        texto: desfecho === 'sem_time' ? `Triagem da IA: ${classificacao.assunto} — nenhum setor se encaixou; na fila geral.` : `Triagem da IA: ${classificacao.assunto} → ${nomeDoTime ?? 'setor'}${atendenteId ? ', atribuída' : ', na fila'} · prioridade ${classificacao.prioridade}.`,
        status: 'entregue',
      });

      // Push: quem vai atender fica sabendo — a pessoa escolhida, ou o time (ou todo mundo, sem setor).
      const nomeDoCliente = conversa.cliente?.nome ?? conversa.cliente?.nome_whatsapp ?? 'Cliente novo';
      const lead = classificacao.lead === 'quente' ? ' · lead quente' : '';
      await avisarSobreConversa(
        empresaId,
        { id: conversaId, atendente_id: atendenteId, time_id: classificacao.time_id },
        atendenteId
          ? { titulo: 'Nova conversa para você', corpo: `${nomeDoCliente} · ${classificacao.assunto}${nomeDoTime ? ` · ${nomeDoTime}` : ''}${lead}` }
          : { titulo: nomeDoTime ? `Nova conversa na fila de ${nomeDoTime}` : 'Nova conversa na fila geral', corpo: `${nomeDoCliente} · ${classificacao.assunto}${lead}` },
      );
    }

    const respostaEnviada = resposta ? await responderComoIa(conversa, empresaId, resposta) : null;
    return { triagemId: triagem?.id ?? null, desfecho, classificacao, atendenteId, respostaEnviada, uso };
  } catch (e: any) {
    console.error('[atende triagem]', e.message);
    // Nunca fica presa: sem triagem, vai para a fila geral e alguém pega.
    await supabaseServer.from('atende_conversas').update({ estado: 'na_fila' }).eq('id', conversaId).in('estado', ['nova', 'em_triagem']);
    await supabaseServer.from('atende_eventos').insert({ empresa_id: empresaId, conversa_id: conversaId, tipo: 'triagem', dados: { desfecho: 'falhou', erro: String(e.message).slice(0, 300) } });
    await avisarSobreConversa(empresaId, { id: conversaId, atendente_id: null, time_id: null }, { titulo: 'Nova conversa na fila geral', corpo: `${conversa.cliente?.nome ?? conversa.cliente?.nome_whatsapp ?? 'Cliente novo'} · a IA não conseguiu triar` });
    return null;
  }
}

/** A IA fala com o cliente: a linha nasce como saída da IA e sai pela Evolution. Falhou → fica 'falhou' com o motivo, sem derrubar a triagem. */
async function responderComoIa(conversa: ConversaParaTriar, empresaId: string, texto: string): Promise<string | null> {
  if (!conversa.cliente?.telefone) return null;
  const { data: linha } = await supabaseServer
    .from('atende_mensagens')
    .insert({ empresa_id: empresaId, conversa_id: conversa.id, direcao: 'saida', autor_tipo: 'ia', tipo: 'texto', texto, conexao_id: conversa.conexao_id, status: 'enviando' })
    .select('id')
    .single();
  if (!linha) return null;
  // A conversa mostra a última mensagem; o estado não muda (a IA respondendo não é a equipe respondendo).
  await supabaseServer.from('atende_conversas').update({ ultima_mensagem_em: new Date().toISOString(), ultima_mensagem_texto: previaDe('texto', texto).slice(0, 200), ultima_mensagem_de: 'ia' }).eq('id', conversa.id);
  try {
    let instancia: string | null = null;
    if (conversa.conexao_id) {
      const { data } = await supabaseServer.from('atende_conexoes').select('instancia').eq('id', conversa.conexao_id).maybeSingle();
      instancia = data?.instancia ?? null;
    }
    if (!instancia) {
      const { data } = await supabaseServer.from('atende_conexoes').select('instancia').eq('empresa_id', empresaId).maybeSingle();
      instancia = data?.instancia ?? null;
    }
    if (!instancia) throw new Error('A empresa não tem WhatsApp conectado.');
    const enviada = await enviarTextoComId(conversa.cliente.telefone, texto, instancia);
    await supabaseServer.from('atende_mensagens').update({ status: 'enviada', wa_id: enviada.waId }).eq('id', linha.id);
    return texto;
  } catch (e: any) {
    console.error('[atende triagem] resposta da IA:', e.message);
    await supabaseServer.from('atende_mensagens').update({ status: 'falhou', erro: String(e.message).slice(0, 300) }).eq('id', linha.id);
    return null;
  }
}

/**
 * O administrador testa a triagem com uma mensagem inventada: mesma IA,
 * mesmo contexto, nada gravado, nada enviado. Serve para ajustar as
 * descrições dos times e ver o que a IA responderia.
 */
export async function simular(empresaId: string, texto: string, nomeDoCliente?: string | null): Promise<{ classificacao: Classificacao; nomeDoTime: string | null; uso: Uso | null; ia: boolean }> {
  const [empresa, times] = await Promise.all([carregarEmpresa(empresaId), carregarTimes(empresaId)]);
  if (!empresa) throw new Error('empresa não encontrada');
  const { classificacao, uso } = await classificar({ empresa, times, historico: [{ role: 'user', content: texto }], nomeDoCliente: nomeDoCliente ?? null, rodada: 1 });
  return { classificacao, nomeDoTime: classificacao.time_id ? times.find((t) => t.id === classificacao.time_id)?.nome ?? null : null, uso, ia: claudeConfigurado() };
}
