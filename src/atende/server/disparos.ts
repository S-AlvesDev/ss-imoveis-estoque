import { randomUUID } from 'crypto';
import { supabaseServer } from '../../lib/supabaseServer';
import type { RequisicaoAtende } from './auth';
import { ErroDeConversa, enviarMensagem, primeiroNomeApresentavel, type Envio } from './conversas';

/**
 * Disparo em massa por etiqueta: escreve a mesma mensagem para um grupo de
 * clientes, um por vez, com um intervalo aleatório entre cada envio — para
 * não arriscar o número/chip do WhatsApp.
 *
 * O servidor roda como função serverless (sem processo de vida longa), então
 * o delay não é um `sleep()`: cada item da fila leva o horário em que PODE
 * ser enviado (`enviar_apos`), calculado de uma vez ao criar o lote. Uma
 * chamada curta de "processar" (a tela do disparo aberta, chamando de
 * tempos em tempos) só efetivamente manda o que já venceu — o ritmo entre
 * mensagens é garantido pelo relógio da fila, não pelo intervalo entre
 * chamadas. Como rede de segurança, o cron diário também varre lotes
 * abandonados (aba fechada no meio do disparo).
 *
 * atende_disparos_lote é uma tabela do tenant (RLS por empresa_id, ver
 * tenant.ts) — passa por req.dbAtende normalmente. atende_disparos_item não
 * tem empresa_id próprio (é sempre lido/escrito através do lote, que já é
 * isolado), então vai direto por supabaseServer, com o lote conferido antes.
 */

const MIN_SEGUNDOS_PADRAO = 8;
const MAX_SEGUNDOS_PADRAO = 20;
const MAX_DESTINATARIOS = 500;

export interface DestinatarioDoDisparo {
  id: string;
  nome: string;
  telefone: string;
}

export interface LoteDeDisparo {
  id: string;
  etiqueta_id: string | null;
  titulo: string | null;
  mensagem: string;
  status: 'enviando' | 'concluido' | 'cancelado';
  total: number;
  enviados: number;
  erros: number;
  min_segundos: number;
  max_segundos: number;
  criado_em: string;
}

const COLUNAS_LOTE = 'id, etiqueta_id, titulo, mensagem, status, total, enviados, erros, min_segundos, max_segundos, criado_em';

/** Quem tem esta etiqueta hoje — a fonte é o cliente (migração 045), não a conversa. */
export async function listarClientesPorEtiqueta(req: RequisicaoAtende, etiquetaId: string): Promise<DestinatarioDoDisparo[]> {
  const { data, error } = await req.dbAtende!
    .from('atende_cliente_etiquetas')
    .select('cliente:atende_clientes(id, nome, nome_whatsapp, telefone)')
    .eq('etiqueta_id', etiquetaId);
  if (error) {
    if (/atende_cliente_etiquetas/.test(error.message)) return []; // sem a migração 045 ainda
    throw error;
  }
  return ((data || []) as any[])
    .map((r) => r.cliente)
    .filter((c) => c && c.telefone)
    .map((c) => ({ id: c.id, nome: c.nome || c.nome_whatsapp || `+${c.telefone}`, telefone: c.telefone }));
}

export async function listarLotes(req: RequisicaoAtende): Promise<LoteDeDisparo[]> {
  const { data, error } = await req.dbAtende!.from('atende_disparos_lote').select(COLUNAS_LOTE).order('criado_em', { ascending: false }).limit(50);
  if (error) {
    if (/atende_disparos_lote/.test(error.message)) return []; // sem a migração 045 ainda
    throw error;
  }
  return (data || []) as unknown as LoteDeDisparo[];
}

export async function statusDoLote(req: RequisicaoAtende, loteId: string): Promise<LoteDeDisparo> {
  const { data, error } = await req.dbAtende!.from('atende_disparos_lote').select(COLUNAS_LOTE).eq('id', loteId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroDeConversa('Disparo não encontrado.', 404);
  return data as unknown as LoteDeDisparo;
}

function segundosValidos(v: unknown, padrao: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 3 && n <= 300 ? Math.round(n) : padrao;
}

/** Um atraso aleatório dentro do intervalo, em segundos. */
function atraso(minSegundos: number, maxSegundos: number): number {
  return minSegundos + Math.random() * (maxSegundos - minSegundos);
}

export interface NovoLote {
  etiquetaId?: string | null;
  clienteIds: unknown;
  mensagem: unknown;
  titulo?: unknown;
  minSegundos?: unknown;
  maxSegundos?: unknown;
}

/** Cria o lote e já enfileira um item por destinatário, com o horário de cada envio pré-calculado. */
export async function criarLote(req: RequisicaoAtende, args: NovoLote): Promise<LoteDeDisparo> {
  const mensagem = String(args.mensagem ?? '').trim().slice(0, 1000);
  if (!mensagem) throw new ErroDeConversa('Escreva a mensagem.');
  const ids = Array.isArray(args.clienteIds) ? [...new Set(args.clienteIds.map(String))] : [];
  if (!ids.length) throw new ErroDeConversa('Escolha pelo menos um destinatário.');
  if (ids.length > MAX_DESTINATARIOS) throw new ErroDeConversa(`No máximo ${MAX_DESTINATARIOS} destinatários por disparo.`);
  const min = segundosValidos(args.minSegundos, MIN_SEGUNDOS_PADRAO);
  const max = Math.max(min, segundosValidos(args.maxSegundos, MAX_SEGUNDOS_PADRAO));

  const { data: clientes, error: erroClientes } = await req.dbAtende!.from('atende_clientes').select('id, nome, nome_whatsapp, telefone').in('id', ids);
  if (erroClientes) throw erroClientes;
  const validos = ((clientes || []) as any[]).filter((c) => c.telefone);
  if (!validos.length) throw new ErroDeConversa('Nenhum destinatário válido (sem telefone).');

  const { data: lote, error: erroLote } = await req.dbAtende!
    .from('atende_disparos_lote')
    .insert({
      etiqueta_id: args.etiquetaId || null,
      titulo: args.titulo ? String(args.titulo).trim().slice(0, 80) : null,
      mensagem,
      criado_por: req.sessao!.id,
      total: validos.length,
      min_segundos: min,
      max_segundos: max,
    })
    .select(COLUNAS_LOTE)
    .single();
  if (erroLote || !lote) throw erroLote ?? new Error('não gravou o lote de disparo');

  let proximo = Date.now();
  const itens = validos.map((c, i) => {
    if (i > 0) proximo += Math.round(atraso(min, max) * 1000);
    const nome = primeiroNomeApresentavel(c.nome ?? c.nome_whatsapp) ?? '';
    return {
      id: randomUUID(),
      lote_id: lote.id,
      cliente_id: c.id,
      telefone: c.telefone,
      mensagem_final: nome ? mensagem.replace(/\{nome\}/gi, nome) : mensagem.replace(/\{nome\}/gi, '').replace(/\s{2,}/g, ' ').trim(),
      enviar_apos: new Date(proximo).toISOString(),
    };
  });
  const { error: erroItens } = await supabaseServer.from('atende_disparos_item').insert(itens);
  if (erroItens) throw erroItens;

  return lote as unknown as LoteDeDisparo;
}

/**
 * Manda o que já venceu, em lotes pequenos (a chamada é curta de propósito —
 * função serverless). Devolve o status atualizado do lote.
 */
export async function processarLote(req: RequisicaoAtende, loteId: string, limite = 3): Promise<LoteDeDisparo> {
  const lote = await statusDoLote(req, loteId);
  if (lote.status !== 'enviando') return lote;

  const { data: devidos, error: erroDevidos } = await supabaseServer
    .from('atende_disparos_item')
    .select('id')
    .eq('lote_id', loteId)
    .eq('status', 'pendente')
    .lte('enviar_apos', new Date().toISOString())
    .order('enviar_apos')
    .limit(limite);
  if (erroDevidos) throw erroDevidos;

  /**
   * Reivindica os itens ANTES de enviar. Sem isto, dois processamentos ao
   * mesmo tempo — a aba chama a cada 5 s e um envio demora mais que isso,
   * duas abas abertas, ou o cron junto com a aba — escolhem os mesmos
   * pendentes e o cliente recebe a mesma mensagem duas vezes.
   *
   * O update condicionado a `status = 'pendente'` é a trava: o Postgres
   * serializa as duas escritas na mesma linha e só a primeira casa; a
   * segunda volta de mãos vazias. Marcar como enviado ANTES de mandar troca
   * "pelo menos uma vez" por "no máximo uma vez", de propósito: numa campanha,
   * uma mensagem a menos é bem melhor que uma repetida (que irrita o cliente
   * e arrisca o número no WhatsApp). Falhou no envio, a linha vira 'erro'.
   */
  const candidatos = ((devidos || []) as any[]).map((i) => i.id);
  let meus: any[] = [];
  // Sem nada vencido não há o que reivindicar — mas o fecho do lote lá embaixo
  // ainda precisa rodar, senão um lote já todo enviado nunca vira 'concluido'
  // e a tela fica chamando para sempre.
  if (candidatos.length) {
    const { data, error: erroReivindicar } = await supabaseServer
      .from('atende_disparos_item')
      .update({ status: 'enviado', enviado_em: new Date().toISOString() })
      .in('id', candidatos)
      .eq('status', 'pendente')
      .select('id, cliente_id, mensagem_final');
    if (erroReivindicar) throw erroReivindicar;
    meus = (data || []) as any[];
  }

  let enviados = 0;
  let erros = 0;
  for (const item of meus) {
    try {
      const { data: conversa } = await req.dbAtende!.from('atende_conversas').select('id').eq('cliente_id', item.cliente_id).maybeSingle();
      if (!conversa) {
        await supabaseServer.from('atende_disparos_item').update({ status: 'erro', enviado_em: null, erro: 'Este contato não tem conversa aberta.' }).eq('id', item.id);
        erros += 1;
        continue;
      }
      const mensagem = await enviarMensagem(req, conversa.id, { tipo: 'texto', texto: item.mensagem_final } as Envio);
      // Já está gravado como enviado pela reivindicação: só o fracasso corrige a linha.
      if (mensagem.status === 'falhou') {
        await supabaseServer.from('atende_disparos_item').update({ status: 'erro', enviado_em: null, erro: (mensagem.erro ?? 'Falha ao enviar.').slice(0, 300) }).eq('id', item.id);
        erros += 1;
      } else {
        enviados += 1;
      }
    } catch (e: any) {
      await supabaseServer.from('atende_disparos_item').update({ status: 'erro', enviado_em: null, erro: String(e.message ?? 'Falha ao enviar.').slice(0, 300) }).eq('id', item.id);
      erros += 1;
    }
  }

  const { count: restantes } = await supabaseServer.from('atende_disparos_item').select('*', { count: 'exact', head: true }).eq('lote_id', loteId).eq('status', 'pendente');
  const patch: Record<string, unknown> = { enviados: lote.enviados + enviados, erros: lote.erros + erros };
  if (!restantes) patch.status = 'concluido';
  const { data: atualizado, error: erroPatch } = await req.dbAtende!.from('atende_disparos_lote').update(patch).eq('id', loteId).select(COLUNAS_LOTE).single();
  if (erroPatch || !atualizado) throw erroPatch ?? new Error('não atualizou o lote');
  return atualizado as unknown as LoteDeDisparo;
}

export async function cancelarLote(req: RequisicaoAtende, loteId: string): Promise<LoteDeDisparo> {
  const lote = await statusDoLote(req, loteId);
  if (lote.status === 'enviando') {
    await supabaseServer.from('atende_disparos_item').update({ status: 'cancelado' }).eq('lote_id', loteId).eq('status', 'pendente');
    const { data: atualizado, error } = await req.dbAtende!.from('atende_disparos_lote').update({ status: 'cancelado' }).eq('id', loteId).select(COLUNAS_LOTE).single();
    if (error || !atualizado) throw error ?? new Error('não cancelou o lote');
    return atualizado as unknown as LoteDeDisparo;
  }
  return lote;
}

/**
 * Rede de segurança do cron diário: processa lotes "enviando" com item
 * vencido há mais de uma hora — cobre quem fechou a aba no meio do disparo.
 * Não usa req.dbAtende (o cron não é uma sessão de ninguém): vai direto por
 * supabaseServer, uma empresa de cada vez.
 */
export async function processarLotesAbandonados(limitePorLote = 20): Promise<{ lotes: number; enviados: number; erros: number }> {
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: enviando } = await supabaseServer.from('atende_disparos_lote').select('id').eq('status', 'enviando');
  const idsEnviando = ((enviando || []) as any[]).map((l) => l.id);
  if (!idsEnviando.length) return { lotes: 0, enviados: 0, erros: 0 };
  const { data: pendentes } = await supabaseServer
    .from('atende_disparos_item')
    .select('lote_id')
    .eq('status', 'pendente')
    .lte('enviar_apos', umaHoraAtras)
    .in('lote_id', idsEnviando);
  const loteIds = [...new Set(((pendentes || []) as any[]).map((r) => r.lote_id))];
  let totalEnviados = 0;
  let totalErros = 0;
  for (const loteId of loteIds) {
    const { data: loteRow } = await supabaseServer.from('atende_disparos_lote').select('empresa_id, criado_por').eq('id', loteId).maybeSingle();
    if (!loteRow?.criado_por) continue; // sem quem criou, não dá para assinar a mensagem — fica para a próxima aba aberta
    const { data: autor } = await supabaseServer.from('atende_usuarios').select('nome, email, papel').eq('id', loteRow.criado_por).maybeSingle();
    if (!autor) continue;
    // A sessão de quem criou o lote — é a atribuição correta (foi essa pessoa que mandou a campanha).
    const { dbDaEmpresa } = await import('./tenant');
    const req = { dbAtende: dbDaEmpresa(loteRow.empresa_id), sessao: { id: loteRow.criado_por, nome: autor.nome, email: autor.email, papel: autor.papel, empresa_id: loteRow.empresa_id } } as any;
    try {
      const r = await processarLote(req, loteId, limitePorLote);
      totalEnviados += r.enviados;
      totalErros += r.erros;
    } catch (e: any) {
      console.error('[atende disparos] cron não processou lote', loteId, e.message);
    }
  }
  return { lotes: loteIds.length, enviados: totalEnviados, erros: totalErros };
}
