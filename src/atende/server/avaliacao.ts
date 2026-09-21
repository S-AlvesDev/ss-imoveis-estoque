import { supabaseServer } from '../../lib/supabaseServer';
import { ASSISTENTE_VIRTUAL, assinarRemetente } from '../shared/remetente';
import { conversar, claudeConfigurado, type MensagemDoChat } from '../../server/claude';
import { enviarTextoComId, variantesDoTelefone } from '../../server/evolution';
import { previaDe, type MensagemDoWhatsApp } from './eventos';
import { avisarSobreConversa } from './push';
import { intervaloDoPeriodo, filtrarPelaVisao } from './dashboard';
import { visaoDe } from './conversas';
import type { RequisicaoAtende } from './auth';
import type { PeriodoDoDashboard, ResumoDeAvaliacoes } from '../shared/tipos';

/**
 * Avaliação do atendimento, de 0 a 10.
 *
 * Ao encerrar, quem atende escolhe: despedida (escrita pela IA, no tom da
 * conversa) + pedido de nota, ou encerrar sem nada. O cliente responde com
 * o número pelo WhatsApp; o webhook reconhece, grava na conversa encerrada
 * — sem reabri-la — e agradece. Se vier número e texto ("10, muito
 * atenciosa"), a nota e o comentário ficam; quem atendeu vê o comentário
 * no push e no histórico e reabre se for o caso.
 */

export const PERGUNTA_DA_NOTA = 'De 0 a 10, como você avalia este atendimento? Responda só com o número.';
export const AGRADECIMENTO = 'Obrigado pela avaliação! 🙏';
/** Quantos dias uma resposta ainda vale como nota do atendimento encerrado. */
export const VALIDADE_DIAS = 7;

const primeiroNome = (nome: string | null | undefined) => (nome ? nome.trim().split(/\s+/)[0] : null);

/** Sem IA: uma despedida simples. */
export function despedidaPadrao(cliente: string | null): string {
  return cliente ? `Obrigado pelo contato, ${cliente}! Qualquer coisa, é só chamar por aqui.` : 'Obrigado pelo contato! Qualquer coisa, é só chamar por aqui.';
}

interface ContextoDaDespedida {
  empresa: { nome: string; segmento: string | null; regras_atendimento: string | null };
  cliente: string | null;
  atendente: string;
  assunto: string | null;
  resumo: string | null;
  mensagens: Array<{ direcao: string; texto: string | null; tipo: string }>;
}

/** A IA escreve a despedida (curta, no assunto, sem prometer nada novo). Cai no padrão se falhar. */
export async function escreverDespedida(ctx: ContextoDaDespedida): Promise<{ texto: string; modelo: string | null }> {
  if (!claudeConfigurado()) return { texto: despedidaPadrao(ctx.cliente), modelo: null };
  const historico: MensagemDoChat[] = [
    {
      role: 'user',
      content:
        `Você escreve a mensagem de encerramento de um atendimento pelo WhatsApp da empresa "${ctx.empresa.nome}"${ctx.empresa.segmento ? ` (${ctx.empresa.segmento})` : ''}, em nome de ${ctx.atendente}.\n` +
        (ctx.empresa.regras_atendimento ? `Regras de atendimento: ${ctx.empresa.regras_atendimento}\n` : '') +
        (ctx.assunto ? `Assunto: ${ctx.assunto}.\n` : '') +
        (ctx.resumo ? `Resumo: ${ctx.resumo}\n` : '') +
        `\nÚltimas mensagens (mais antigas primeiro):\n` +
        ctx.mensagens.map((m) => `${m.direcao === 'entrada' ? 'Cliente' : m.direcao === 'saida' ? 'Equipe' : 'Sistema'}: ${m.texto?.trim() || `[${m.tipo}]`}`).join('\n') +
        `\n\nEscreva UMA despedida curta (até 220 caracteres) para ${ctx.cliente ?? 'o cliente'}: agradeça o contato, feche o que foi tratado numa frase se fizer sentido, e diga que é só chamar se precisar. Não peça nota (isso vai em seguida), não prometa nada que não apareceu na conversa, no máximo um emoji. Responda só com o texto, sem aspas.`,
    },
  ];
  try {
    const r = await conversar({ system: 'Você é um redator de mensagens de atendimento. Responde só com a mensagem pedida.', historico, tools: [], executar: async () => '', maxTokens: 160, maxRodadas: 1 });
    const texto = r.texto.trim().replace(/^["“”']+|["“”']+$/g, '').slice(0, 400);
    if (!texto) throw new Error('resposta vazia');
    return { texto, modelo: r.uso.modelo };
  } catch (e: any) {
    console.warn('[atende avaliação] IA falhou, usando a despedida padrão:', e.message);
    return { texto: despedidaPadrao(ctx.cliente), modelo: null };
  }
}

/** A mensagem inteira que sai: despedida + pergunta da nota. */
export const mensagemDeEncerramento = (despedida: string) => `${despedida}\n\n${PERGUNTA_DA_NOTA}`;

/**
 * Lê a nota numa resposta: "9", "10", "nota 8", "8/10", "10!" — e o que
 * sobrou como comentário. Nulo quando não há uma nota clara no começo.
 */
export function extrairNota(texto: string | null | undefined): { nota: number; comentario: string | null } | null {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  const m = /^(?:nota\s*:?\s*)?(10|[0-9])(?:\s*\/\s*10)?(?![0-9])[\s.!,;:)-]*(.*)$/is.exec(t);
  if (!m) return null;
  const nota = Number(m[1]);
  const resto = m[2].trim();
  return { nota, comentario: resto ? resto.slice(0, 500) : null };
}

/** Manda um texto pela conexão da conversa como "IA" (linha de saída + Evolution). Nunca lança. */
export async function enviarComoIa(args: { empresaId: string; conversaId: string; conexaoId: string | null; telefone: string; texto: string }): Promise<boolean> {
  const { data: linha } = await supabaseServer.from('atende_mensagens').insert({ empresa_id: args.empresaId, conversa_id: args.conversaId, direcao: 'saida', autor_tipo: 'ia', tipo: 'texto', texto: args.texto, conexao_id: args.conexaoId, status: 'enviando' }).select('id').single();
  if (!linha) return false;
  await supabaseServer.from('atende_conversas').update({ ultima_mensagem_em: new Date().toISOString(), ultima_mensagem_texto: previaDe('texto', args.texto).slice(0, 200), ultima_mensagem_de: 'ia' }).eq('id', args.conversaId);
  try {
    let instancia: string | null = null;
    if (args.conexaoId) instancia = (await supabaseServer.from('atende_conexoes').select('instancia').eq('id', args.conexaoId).maybeSingle()).data?.instancia ?? null;
    if (!instancia) instancia = (await supabaseServer.from('atende_conexoes').select('instancia').eq('empresa_id', args.empresaId).maybeSingle()).data?.instancia ?? null;
    if (!instancia) throw new Error('A empresa não tem WhatsApp conectado.');
    // Sai assinada como Assistente Virtual; a linha gravada é o texto puro.
    const enviada = await enviarTextoComId(args.telefone, assinarRemetente(ASSISTENTE_VIRTUAL, args.texto), instancia);
    await supabaseServer.from('atende_mensagens').update({ status: 'enviada', wa_id: enviada.waId }).eq('id', linha.id);
    return true;
  } catch (e: any) {
    console.error('[atende avaliação] envio:', e.message);
    await supabaseServer.from('atende_mensagens').update({ status: 'falhou', erro: String(e.message).slice(0, 300) }).eq('id', linha.id);
    return false;
  }
}

/**
 * Chamado pelo webhook ANTES de escolher a conversa: a mensagem é a resposta
 * ao pedido de nota de uma conversa encerrada há até 7 dias? Então a nota
 * (e o comentário que veio junto) ficam na conversa encerrada, o cliente
 * recebe o agradecimento, quem atendeu recebe o push — e nada reabre: se o
 * comentário pedir algo, quem atende reabre. Falso quando não é avaliação.
 */
export async function tratarRespostaDeAvaliacao(empresaId: string, e: MensagemDoWhatsApp): Promise<boolean> {
  if (e.fromMe || e.tipo !== 'texto') return false;
  const lida = extrairNota(e.texto);
  if (!lida) return false;
  // Todos os cadastros deste número (com e sem o nono dígito): o pedido de nota pode estar em qualquer um.
  const { data: clientes } = await supabaseServer.from('atende_clientes').select('id').eq('empresa_id', empresaId).in('telefone', variantesDoTelefone(e.telefone));
  const ids = ((clientes || []) as Array<{ id: string }>).map((c) => c.id);
  if (!ids.length) return false;
  const limite = new Date(Date.now() - VALIDADE_DIAS * 86_400_000).toISOString();
  const { data: c, error } = await supabaseServer
    .from('atende_conversas')
    .select('id, conexao_id, atendente_id, time_id, avaliacao_pedida_em, avaliacao_nota')
    .in('cliente_id', ids)
    .eq('estado', 'encerrada')
    .not('avaliacao_pedida_em', 'is', null)
    .is('avaliacao_nota', null)
    .gte('avaliacao_pedida_em', limite)
    .order('avaliacao_pedida_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !c) return false;

  const agora = e.em.toISOString();
  const { data: gravada } = await supabaseServer.from('atende_conversas').update({ avaliacao_nota: lida.nota, avaliacao_em: agora, avaliacao_comentario: lida.comentario }).eq('id', c.id).is('avaliacao_nota', null).select('id').maybeSingle();
  if (!gravada) return false;
  // ATD-01: fecha a linha do atendimento (a que ainda não tem resposta) com a nota e a autoria de quando foi pedida.
  await supabaseServer.from('atende_avaliacoes').update({ nota: lida.nota, comentario: lida.comentario, respondida_em: agora }).eq('conversa_id', c.id).is('respondida_em', null);

  // A resposta fica na conversa encerrada (a linha do tempo conta a história), sem reabrir.
  await supabaseServer.from('atende_mensagens').insert({ empresa_id: empresaId, conversa_id: c.id, direcao: 'entrada', autor_tipo: 'cliente', tipo: 'texto', texto: e.texto, wa_id: e.chave.id, conexao_id: c.conexao_id, status: 'entregue', criado_em: agora });
  await supabaseServer.from('atende_mensagens').insert({ empresa_id: empresaId, conversa_id: c.id, direcao: 'sistema', autor_tipo: 'sistema', tipo: 'texto', texto: `Avaliação do cliente: ${lida.nota}/10${lida.comentario ? ` — “${lida.comentario}”` : ''}.`, status: 'entregue' });
  await supabaseServer.from('atende_eventos').insert({ empresa_id: empresaId, conversa_id: c.id, tipo: 'avaliada', dados: { nota: lida.nota, comentario: lida.comentario } });
  await supabaseServer.from('atende_conversas').update({ ultima_mensagem_em: agora, ultima_mensagem_texto: previaDe('texto', e.texto).slice(0, 200), ultima_mensagem_de: 'cliente' }).eq('id', c.id);
  await enviarComoIa({ empresaId, conversaId: c.id, conexaoId: c.conexao_id, telefone: e.telefone, texto: AGRADECIMENTO });
  await avisarSobreConversa(empresaId, { id: c.id, atendente_id: c.atendente_id === null ? null : Number(c.atendente_id), time_id: c.time_id ?? null }, { titulo: `Avaliação: ${lida.nota}/10`, corpo: lida.comentario ?? 'O cliente avaliou o atendimento.' });
  return true;
}

// ---------------------------------------------------------------------------
//  O resumo: média, distribuição, por pessoa e os mais bem avaliados
// ---------------------------------------------------------------------------

interface ConversaAvaliada {
  id: string;
  atendente_id: number | null;
  time_id: string | null;
  avaliacao_nota: number | null;
  avaliacao_pedida_em: string | null;
  avaliacao_em: string | null;
  avaliacao_comentario: string | null;
  assunto: string | null;
  cliente: { nome: string | null; nome_whatsapp: string | null; telefone: string } | null;
}

/** Pura: agrega uma lista de conversas com pedido de nota. */
export function agregarAvaliacoes(linhas: ConversaAvaliada[]): ResumoDeAvaliacoes {
  const respondidas = linhas.filter((c) => c.avaliacao_nota !== null);
  const notas = respondidas.map((c) => Number(c.avaliacao_nota));
  const distribuicao = Array.from({ length: 11 }, (_, n) => notas.filter((x) => x === n).length);
  const promotores = notas.filter((n) => n >= 9).length;
  const detratores = notas.filter((n) => n <= 6).length;
  const porPessoa = new Map<number, { usuario_id: number; avaliacoes: number; soma: number }>();
  for (const c of respondidas) {
    if (c.atendente_id === null) continue;
    const id = Number(c.atendente_id);
    const p = porPessoa.get(id) ?? { usuario_id: id, avaliacoes: 0, soma: 0 };
    p.avaliacoes++;
    p.soma += Number(c.avaliacao_nota);
    porPessoa.set(id, p);
  }
  const nomeDo = (c: ConversaAvaliada) => c.cliente?.nome ?? c.cliente?.nome_whatsapp ?? (c.cliente ? `+${c.cliente.telefone}` : 'cliente');
  return {
    pedidas: linhas.length,
    respondidas: respondidas.length,
    taxa_de_resposta: linhas.length ? Math.round((respondidas.length / linhas.length) * 1000) / 10 : null,
    media: notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null,
    nps: notas.length ? Math.round(((promotores - detratores) / notas.length) * 100) : null,
    distribuicao,
    por_pessoa: [...porPessoa.values()].map((p) => ({ usuario_id: p.usuario_id, avaliacoes: p.avaliacoes, media: Math.round((p.soma / p.avaliacoes) * 10) / 10 })).sort((a, b) => b.media - a.media || b.avaliacoes - a.avaliacoes),
    melhores: [...respondidas]
      .sort((a, b) => Number(b.avaliacao_nota) - Number(a.avaliacao_nota) || String(b.avaliacao_em).localeCompare(String(a.avaliacao_em)))
      .slice(0, 10)
      .map((c) => ({ conversa_id: c.id, nota: Number(c.avaliacao_nota), comentario: c.avaliacao_comentario, cliente: nomeDo(c), atendente_id: c.atendente_id === null ? null : Number(c.atendente_id), assunto: c.assunto, avaliada_em: c.avaliacao_em ?? '' })),
  };
}

/**
 * As avaliações pedidas no período — uma linha por atendimento (ATD-01: a
 * conversa é um fio só, mas cada encerramento com pedido de nota conta à
 * parte, com o atendente de quando foi pedida). Sem a migração 044 ainda,
 * cai para as colunas antigas de atende_conversas (uma nota "atual" por
 * fio, que uma reabertura sobrescreve — o problema que a 044 resolve).
 */
export async function resumoDeAvaliacoes(req: RequisicaoAtende, periodo: PeriodoDoDashboard, agora = new Date()): Promise<ResumoDeAvaliacoes> {
  const de = intervaloDoPeriodo(periodo, agora).de.toISOString();
  const { data, error } = await req.dbAtende!
    .from('atende_avaliacoes')
    .select('conversa_id, atendente_id, time_id, nota, pedida_em, respondida_em, comentario, assunto, cliente:atende_clientes(nome, nome_whatsapp, telefone)')
    .gte('pedida_em', de)
    .order('pedida_em', { ascending: false })
    .limit(2000);
  if (error) {
    if (/atende_avaliacoes/.test(error.message)) return resumoDeAvaliacoesLegado(req, de); // sem a migração 044 ainda
    throw error;
  }
  const brutas = (data || []) as unknown as Array<{ conversa_id: string; atendente_id: number | string | null; time_id: string | null; nota: number | null; pedida_em: string; respondida_em: string | null; comentario: string | null; assunto: string | null; cliente: ConversaAvaliada['cliente'] }>;
  const linhas: ConversaAvaliada[] = brutas.map((r) => ({
    id: r.conversa_id,
    atendente_id: r.atendente_id === null ? null : Number(r.atendente_id),
    time_id: r.time_id,
    avaliacao_nota: r.nota,
    avaliacao_pedida_em: r.pedida_em,
    avaliacao_em: r.respondida_em,
    avaliacao_comentario: r.comentario,
    assunto: r.assunto,
    cliente: r.cliente,
  }));
  const visao = await visaoDe(req);
  return agregarAvaliacoes(filtrarPelaVisao(linhas, visao));
}

/** Antes da migração 044: uma nota por fio (o problema do ATD-01), lida das colunas antigas. */
async function resumoDeAvaliacoesLegado(req: RequisicaoAtende, de: string): Promise<ResumoDeAvaliacoes> {
  const { data, error } = await req.dbAtende!
    .from('atende_conversas')
    .select('id, atendente_id, time_id, avaliacao_nota, avaliacao_pedida_em, avaliacao_em, avaliacao_comentario, assunto, cliente:atende_clientes(nome, nome_whatsapp, telefone)')
    .not('avaliacao_pedida_em', 'is', null)
    .gte('avaliacao_pedida_em', de)
    .order('avaliacao_pedida_em', { ascending: false })
    .limit(2000);
  if (error) {
    if (/avaliacao_/.test(error.message)) return agregarAvaliacoes([]); // sem a migração 039
    throw error;
  }
  const visao = await visaoDe(req);
  const linhas = filtrarPelaVisao(((data || []) as unknown as ConversaAvaliada[]).map((c) => ({ ...c, atendente_id: c.atendente_id === null ? null : Number(c.atendente_id) })), visao);
  return agregarAvaliacoes(linhas);
}
