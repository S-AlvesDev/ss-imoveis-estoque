import { supabaseServer } from '../../lib/supabaseServer';
import { criarInstancia, qrDaInstancia, estadoDaInstancia, apagarInstancia, baixarMidia, fotoDoContato, evolutionConfigurada, variantesDoTelefone, type QrCode } from '../../server/evolution';
import { siteUrl } from '../../server/senha';
import { lerEventoDoAtende, previaDe, type MensagemDoWhatsApp, type AtualizacaoDeStatus, type AtualizacaoDeConexao } from './eventos';
import { caminhoDaMidia, guardarMidia } from './midias';
import { triar, triagemAtiva } from './triagem';
import { tratarRespostaDeAvaliacao } from './avaliacao';
import { avisarSobreConversa } from './push';
import type { Conexao, EstadoDaConexao, StatusDaMensagem } from '../shared/tipos';

/**
 * O WhatsApp de cada empresa do Atende Aí: uma instância da Evolution por
 * empresa, com webhook próprio. Este módulo conecta (QR), acompanha o
 * estado, e transforma cada evento do webhook em linhas de cliente,
 * conversa e mensagem.
 *
 * O webhook chega sem sessão — a Evolution não é uma pessoa —, então a
 * empresa é descoberta pelo nome da instância, e tudo aqui usa a chave de
 * serviço com `empresa_id` explícito em cada escrita.
 */

/** Os eventos que a instância de uma empresa manda para nós. */
export const EVENTOS_DO_ATENDE: readonly string[] = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'];

export function nomeDaInstancia(empresaId: string): string {
  return `atende-${empresaId.replace(/-/g, '').slice(0, 12)}`;
}

export function urlDoWebhook(): string {
  return `${siteUrl()}/api/atende/webhooks/whatsapp?token=${encodeURIComponent(process.env.EVOLUTION_WEBHOOK_TOKEN ?? '')}`;
}

/** 'open' → conectada etc. O que a Evolution chama de estado, no nosso vocabulário. */
export function traduzirEstado(s: string): EstadoDaConexao {
  const v = s.toLowerCase();
  if (v === 'open') return 'conectada';
  if (v === 'connecting') return 'conectando';
  if (v === 'close' || v === 'closed') return 'desconectada';
  return 'aguardando_qr';
}

const CONEXAO_COLUNAS = 'id, empresa_id, instancia, numero, estado, conectado_em, ultimo_evento_em';

export async function conexaoDaEmpresa(empresaId: string): Promise<(Conexao & { empresa_id: string }) | null> {
  const { data } = await supabaseServer.from('atende_conexoes').select(CONEXAO_COLUNAS).eq('empresa_id', empresaId).maybeSingle();
  return (data as any) ?? null;
}

/** Começa (ou retoma) a conexão: garante a instância e devolve o QR. */
export async function conectar(empresaId: string): Promise<{ conexao: Conexao; qr: QrCode | null }> {
  if (!evolutionConfigurada()) throw new Error('A Evolution API não está configurada neste servidor.');
  const instancia = nomeDaInstancia(empresaId);
  let conexao = await conexaoDaEmpresa(empresaId);
  if (!conexao) {
    const { data, error } = await supabaseServer.from('atende_conexoes').insert({ empresa_id: empresaId, instancia, estado: 'aguardando_qr' }).select(CONEXAO_COLUNAS).single();
    if (error || !data) throw error ?? new Error('não criou a conexão');
    conexao = data as any;
  }
  await criarInstancia(instancia, urlDoWebhook(), process.env as any, EVENTOS_DO_ATENDE);
  const estado = traduzirEstado(await estadoDaInstancia(instancia).catch(() => 'close'));
  let qr: QrCode | null = null;
  if (estado !== 'conectada') {
    try {
      qr = await qrDaInstancia(instancia);
    } catch (e: any) {
      console.warn('[atende whatsapp] qr:', e.message);
    }
  }
  const { data } = await supabaseServer.from('atende_conexoes').update({ estado, ...(estado === 'conectada' && !conexao!.conectado_em ? { conectado_em: new Date().toISOString() } : {}) }).eq('id', conexao!.id).select(CONEXAO_COLUNAS).single();
  return { conexao: (data as any) ?? conexao!, qr };
}

/** Como está agora: o que a Evolution diz, gravado de volta. QR só enquanto não conectou. */
export async function situacaoDaConexao(empresaId: string): Promise<{ conexao: Conexao | null; qr: QrCode | null; evolution: boolean }> {
  const conexao = await conexaoDaEmpresa(empresaId);
  if (!conexao) return { conexao: null, qr: null, evolution: evolutionConfigurada() };
  if (!evolutionConfigurada()) return { conexao, qr: null, evolution: false };
  const estado = traduzirEstado(await estadoDaInstancia(conexao.instancia).catch(() => 'close'));
  let qr: QrCode | null = null;
  if (estado !== 'conectada') {
    try {
      qr = await qrDaInstancia(conexao.instancia);
    } catch {
      /* sem QR agora */
    }
  }
  if (estado !== conexao.estado) {
    const { data } = await supabaseServer.from('atende_conexoes').update({ estado, ...(estado === 'conectada' ? { conectado_em: new Date().toISOString() } : {}) }).eq('id', conexao.id).select(CONEXAO_COLUNAS).single();
    return { conexao: (data as any) ?? { ...conexao, estado }, qr, evolution: true };
  }
  return { conexao, qr, evolution: true };
}

/** Desconecta o número e apaga a instância na Evolution; a linha fica, desconectada (o histórico aponta para ela). */
export async function desconectar(empresaId: string): Promise<void> {
  const conexao = await conexaoDaEmpresa(empresaId);
  if (!conexao) return;
  if (evolutionConfigurada()) await apagarInstancia(conexao.instancia);
  await supabaseServer.from('atende_conexoes').update({ estado: 'desconectada' }).eq('id', conexao.id);
}

// ---------------------------------------------------------------------------
//  O webhook
// ---------------------------------------------------------------------------

interface ConexaoPorInstancia {
  id: string;
  empresa_id: string;
  instancia: string;
}

async function conexaoPelaInstancia(instancia: string): Promise<ConexaoPorInstancia | null> {
  if (!instancia.startsWith('atende-')) return null;
  const { data } = await supabaseServer.from('atende_conexoes').select('id, empresa_id, instancia').eq('instancia', instancia).maybeSingle();
  return (data as any) ?? null;
}

export interface ResultadoDoWebhook {
  eventos: number;
  mensagens: number;
  ignorados: number;
}

/** Processa um corpo de webhook inteiro. Nunca lança: cada evento que falha vira log, o resto segue. */
export async function processarWebhook(body: any): Promise<ResultadoDoWebhook> {
  const eventos = lerEventoDoAtende(body);
  const r: ResultadoDoWebhook = { eventos: eventos.length, mensagens: 0, ignorados: 0 };
  for (const e of eventos) {
    try {
      const conexao = await conexaoPelaInstancia(e.instancia);
      if (!conexao) {
        r.ignorados++;
        continue;
      }
      if (e.tipoDeEvento === 'mensagem') {
        if (await registrarMensagem(conexao, e)) r.mensagens++;
        else r.ignorados++;
      } else if (e.tipoDeEvento === 'status') await aplicarStatus(conexao, e);
      else await aplicarConexao(conexao, e);
    } catch (err: any) {
      console.error('[atende webhook]', e.tipoDeEvento, err.message);
    }
  }
  return r;
}

const ORDEM_DO_STATUS: Record<StatusDaMensagem, number> = { enviando: 0, enviada: 1, entregue: 2, lida: 3, falhou: 9 };

async function aplicarStatus(conexao: ConexaoPorInstancia, e: AtualizacaoDeStatus) {
  const { data: m } = await supabaseServer.from('atende_mensagens').select('id, status').eq('conexao_id', conexao.id).eq('wa_id', e.waId).maybeSingle();
  if (!m) return;
  // Só anda para a frente: "lida" não volta para "entregue" se os eventos chegarem fora de ordem.
  if (ORDEM_DO_STATUS[e.status] <= ORDEM_DO_STATUS[m.status as StatusDaMensagem] && e.status !== 'falhou') return;
  await supabaseServer.from('atende_mensagens').update({ status: e.status }).eq('id', m.id);
}

async function aplicarConexao(conexao: ConexaoPorInstancia, e: AtualizacaoDeConexao) {
  const estado = traduzirEstado(e.estado);
  const patch: Record<string, unknown> = { estado, ultimo_evento_em: new Date().toISOString() };
  if (estado === 'conectada') patch.conectado_em = new Date().toISOString();
  if (e.numero) patch.numero = e.numero;
  await supabaseServer.from('atende_conexoes').update(patch).eq('id', conexao.id);
  await supabaseServer.from('atende_eventos').insert({ empresa_id: conexao.empresa_id, tipo: 'conexao', dados: { estado, numero: e.numero } });
}

/**
 * Uma mensagem do WhatsApp vira: cliente (achado ou criado), conversa (a
 * aberta, ou uma nova) e a linha em atende_mensagens. `fromMe` é o que a
 * empresa mandou pelo celular — entra como saída "pelo aparelho". Devolve
 * false quando a mensagem já estava registrada (a Evolution reenvia).
 */
async function registrarMensagem(conexao: ConexaoPorInstancia, e: MensagemDoWhatsApp): Promise<boolean> {
  const { data: repetida } = await supabaseServer.from('atende_mensagens').select('id').eq('conexao_id', conexao.id).eq('wa_id', e.chave.id).maybeSingle();
  if (repetida) return false;

  const agora = e.em.toISOString();
  const empresaId = conexao.empresa_id;

  // ---- Cliente (o mesmo número com e sem o nono dígito é a mesma pessoa)
  // Se houver dois cadastros (com e sem o 9 — de antes de reconhecermos as duas grafias), fica com a grafia
  // exata; empatando, o de contato mais recente. Nunca "o primeiro que o banco devolver".
  const { data: candidatos } = await supabaseServer.from('atende_clientes').select('id, nome, nome_whatsapp, foto_url, telefone, ultimo_contato_em').eq('empresa_id', empresaId).in('telefone', variantesDoTelefone(e.telefone)).order('ultimo_contato_em', { ascending: false, nullsFirst: false }).limit(5);
  let cliente = ((candidatos || []) as any[]).find((c) => c.telefone === e.telefone) ?? ((candidatos || []) as any[])[0] ?? null;
  if (!cliente) {
    const foto = await fotoDoContato(e.telefone, conexao.instancia);
    const { data: novo, error } = await supabaseServer.from('atende_clientes').insert({ empresa_id: empresaId, telefone: e.telefone, nome_whatsapp: e.nomeWhatsapp, foto_url: foto, primeiro_contato_em: agora, ultimo_contato_em: agora }).select('id, nome, nome_whatsapp, foto_url').single();
    if (error || !novo) {
      // Duas mensagens ao mesmo tempo do mesmo número novo: a segunda acha a primeira.
      const { data: existente } = await supabaseServer.from('atende_clientes').select('id, nome, nome_whatsapp, foto_url').eq('empresa_id', empresaId).in('telefone', variantesDoTelefone(e.telefone)).limit(1).maybeSingle();
      if (!existente) throw error ?? new Error('não criou o cliente');
      cliente = existente;
    } else cliente = novo;
  } else {
    const patch: Record<string, unknown> = { ultimo_contato_em: agora };
    if (e.nomeWhatsapp && e.nomeWhatsapp !== cliente.nome_whatsapp) patch.nome_whatsapp = e.nomeWhatsapp;
    await supabaseServer.from('atende_clientes').update(patch).eq('id', cliente.id);
  }

  // ---- É a nota do atendimento encerrado? Grava e agradece, sem reabrir. Olha todas as grafias do número:
  // o pedido pode ter saído por um cadastro e a resposta chegar por outro.
  if (!e.fromMe && (await tratarRespostaDeAvaliacao(empresaId, e))) return true;

  // ---- A conversa do contato: a de sempre, reaberta se estava encerrada, ou a primeira
  // Um contato, um fio: como no WhatsApp. "Encerrar" marca o fim; a próxima mensagem
  // reabre a MESMA conversa (o histórico continua ali), em vez de criar outra. O banco
  // garante um fio por contato (migração 043); antes dela, vale a de abertura mais recente,
  // que é sempre a aberta quando há uma (reabrir move `aberta_em`).
  const COLUNAS = 'id, estado, nao_lidas, primeira_resposta_em, atendente_id, time_id';
  const fioDoContato = async () => (await supabaseServer.from('atende_conversas').select(COLUNAS).eq('cliente_id', cliente.id).order('aberta_em', { ascending: false }).limit(1).maybeSingle()).data;
  let conversa = await fioDoContato();
  let nova = false;
  let reaberta = false;
  // Cliente escreveu: 'nova' para a IA triar (ou direto na fila, se a empresa desligou a triagem).
  // A empresa escreveu primeiro pelo celular: alguém já está atendendo por lá.
  const estadoInicial = async () => (e.fromMe ? 'em_atendimento' : (await triagemAtiva(empresaId)) ? 'nova' : 'na_fila');
  if (conversa?.estado === 'encerrada') {
    // Reabre: novo atendimento (contadores do zero), mesmo fio. Quem atendia antes não é
    // dono de novo automaticamente — a triagem/fila decide; pelo celular, fica sem dono como antes.
    // A conversa passa a andar pela conexão de agora (a empresa pode ter trocado de número).
    const { data: atualizada, error } = await supabaseServer
      .from('atende_conversas')
      .update({ estado: await estadoInicial(), conexao_id: conexao.id, aberta_em: agora, ultima_mensagem_em: agora, primeira_resposta_em: null, encerrada_em: null, encerrada_por: null, motivo_encerramento: null, atendente_id: null, time_id: null, nao_lidas: 0 })
      .eq('id', conversa.id)
      .eq('estado', 'encerrada')
      .select(COLUNAS)
      .maybeSingle();
    if (error) throw error;
    if (atualizada) {
      conversa = atualizada;
      reaberta = true;
    } else {
      // Outra mensagem reabriu no mesmo instante.
      conversa = await fioDoContato();
    }
  }
  if (!conversa) {
    const { data: criada, error } = await supabaseServer
      .from('atende_conversas')
      .insert({ empresa_id: empresaId, cliente_id: cliente.id, conexao_id: conexao.id, estado: await estadoInicial(), aberta_em: agora, ultima_mensagem_em: agora })
      .select(COLUNAS)
      .single();
    if (error || !criada) {
      // Duas mensagens ao mesmo tempo de um contato novo: a segunda acha o fio que a primeira abriu.
      const existente = await fioDoContato();
      if (!existente) throw error ?? new Error('não criou a conversa');
      conversa = existente;
    } else {
      conversa = criada;
      nova = true;
    }
  }

  // ---- A mensagem citada, se a conhecemos
  let respondendoA: string | null = null;
  if (e.respondendoA) {
    const { data: citada } = await supabaseServer.from('atende_mensagens').select('id').eq('conexao_id', conexao.id).eq('wa_id', e.respondendoA).maybeSingle();
    respondendoA = citada?.id ?? null;
  }

  // ---- A linha
  const { data: mensagem, error: erroMsg } = await supabaseServer
    .from('atende_mensagens')
    .insert({
      empresa_id: empresaId,
      conversa_id: conversa.id,
      direcao: e.fromMe ? 'saida' : 'entrada',
      autor_tipo: e.fromMe ? 'aparelho' : 'cliente',
      tipo: e.tipo,
      texto: e.texto,
      midia: e.midia,
      wa_id: e.chave.id,
      conexao_id: conexao.id,
      status: e.fromMe ? 'enviada' : 'entregue',
      respondendo_a: respondendoA,
      criado_em: agora,
    })
    .select('id')
    .single();
  if (erroMsg || !mensagem) {
    if (erroMsg?.code === '23505') return false; // chegou duas vezes ao mesmo tempo
    throw erroMsg ?? new Error('não gravou a mensagem');
  }

  // ---- A conversa reflete a última mensagem
  const patch: Record<string, unknown> = {
    ultima_mensagem_em: agora,
    ultima_mensagem_texto: previaDe(e.tipo, e.texto).slice(0, 200),
    ultima_mensagem_de: e.fromMe ? 'aparelho' : 'cliente',
  };
  if (!e.fromMe) {
    patch.nao_lidas = Number(conversa.nao_lidas ?? 0) + 1;
    patch.ultima_mensagem_do_cliente_em = agora;
    if (conversa.estado === 'aguardando_cliente') patch.estado = 'em_atendimento';
  } else if (!conversa.primeira_resposta_em) {
    patch.primeira_resposta_em = agora;
    // Alguém respondeu pelo celular: a conversa é dessa pessoa, a triagem não precisa continuar.
    if (conversa.estado === 'na_fila' || conversa.estado === 'nova' || conversa.estado === 'em_triagem') patch.estado = 'em_atendimento';
  }
  await supabaseServer.from('atende_conversas').update(patch).eq('id', conversa.id);
  if (nova || reaberta) await supabaseServer.from('atende_eventos').insert({ empresa_id: empresaId, conversa_id: conversa.id, tipo: reaberta ? 'reaberta' : 'aberta', dados: { por: e.fromMe ? 'aparelho' : 'cliente' } });
  // Na linha do tempo, a reabertura aparece entre o "encerrada por…" e a mensagem nova.
  if (reaberta) await supabaseServer.from('atende_mensagens').insert({ empresa_id: empresaId, conversa_id: conversa.id, direcao: 'sistema', autor_tipo: 'sistema', tipo: 'texto', texto: e.fromMe ? 'Conversa reaberta pela empresa (pelo celular).' : 'Conversa reaberta pelo cliente.', status: 'entregue', criado_em: new Date(Date.parse(agora) - 1).toISOString() });

  // ---- O arquivo: a mensagem já existe mesmo que o download falhe.
  if (e.temArquivo) await baixarArquivoDaMensagem(conexao, empresaId, conversa.id, mensagem.id, e);

  // ---- A triagem da IA: só para o que o cliente mandou, e só enquanto ninguém da equipe está na conversa.
  if (!e.fromMe && (conversa.estado === 'nova' || conversa.estado === 'em_triagem')) await triar(conversa.id, mensagem.id);
  // ---- Fora da triagem, o cliente escreveu numa conversa que já é de alguém (ou está na fila): avisa por push.
  else if (!e.fromMe) {
    await avisarSobreConversa(empresaId, { id: conversa.id, atendente_id: conversa.atendente_id === null ? null : Number(conversa.atendente_id), time_id: conversa.time_id ?? null }, { titulo: cliente.nome ?? cliente.nome_whatsapp ?? `+${e.telefone}`, corpo: previaDe(e.tipo, e.texto).slice(0, 140) || 'Nova mensagem' });
  }
  return true;
}

async function baixarArquivoDaMensagem(conexao: ConexaoPorInstancia, empresaId: string, conversaId: string, mensagemId: string, e: MensagemDoWhatsApp) {
  try {
    const arquivo = await baixarMidia(e.chave, conexao.instancia);
    const mimetype = arquivo.mimetype || e.midia?.mimetype || 'application/octet-stream';
    const caminho = caminhoDaMidia(empresaId, conversaId, mensagemId, mimetype, e.midia?.nome);
    const { tamanho } = await guardarMidia(caminho, arquivo.base64, mimetype);
    await supabaseServer.from('atende_mensagens').update({ midia: { ...(e.midia ?? {}), caminho, mimetype, tamanho, pendente: false } }).eq('id', mensagemId);
  } catch (err: any) {
    console.error('[atende webhook] mídia:', err.message);
    await supabaseServer.from('atende_mensagens').update({ midia: { ...(e.midia ?? {}), pendente: true }, erro: `Não foi possível baixar o arquivo: ${String(err.message).slice(0, 200)}` }).eq('id', mensagemId);
  }
}
