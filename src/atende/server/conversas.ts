import { randomUUID } from 'crypto';
import { supabaseServer } from '../../lib/supabaseServer';
import { variantesDoTelefone } from '../../server/evolution';
import { escreverDespedida, enviarComoIa, mensagemDeEncerramento } from './avaliacao';
import { assinarRemetente } from '../shared/remetente';
import { enviarTextoComId, enviarMidia, enviarAudio, enviarLocalizacao, enviarContato, marcarLidas, type Enviada } from '../../server/evolution';
import type { ScopedDb } from '../../server/tenant';
import { previaDe } from './eventos';
import { caminhoDaMidia, tipoPeloMimetype, urlAssinada, urlDeUpload, tamanhoDaMidia, MIDIA_MAX_BYTES } from './midias';
import type { RequisicaoAtende } from './auth';
import { pode } from '../shared/papeis';
import { avisarSobreConversa } from './push';
import { ESTADOS_DO_LEAD, type Conversa, type Mensagem, type Cliente, type Delta, type Etiqueta, type TipoDaMensagem, type Filtro, type Triagem, type Lead } from '../shared/tipos';

/**
 * As conversas: quem pode ver qual, listar, abrir, responder, assumir,
 * encerrar, anotar. Tudo passa por `req.dbAtende` (preso à empresa) e pela
 * visão da pessoa — conversa a conversa, não só por papel.
 */

// ---------------------------------------------------------------------------
//  Quem vê o quê
// ---------------------------------------------------------------------------

export interface Visao {
  /** Admin: tudo da empresa. */
  tudo: boolean;
  eu: number;
  /** Times de que a pessoa é membro. */
  meusTimes: string[];
  /** Times que a pessoa supervisiona (supervisor: os dele; admin: irrelevante). */
  supervisiona: string[];
}

export async function visaoDe(req: RequisicaoAtende): Promise<Visao> {
  const s = req.sessao!;
  if (s.papel === 'admin') return { tudo: true, eu: s.id, meusTimes: [], supervisiona: [] };
  const { data } = await req.dbAtende!.from('atende_time_membros').select('time_id, supervisiona').eq('usuario_id', s.id);
  const membros = (data || []) as Array<{ time_id: string; supervisiona: boolean }>;
  return { tudo: false, eu: s.id, meusTimes: membros.map((m) => m.time_id), supervisiona: s.papel === 'supervisor' ? membros.map((m) => m.time_id) : [] };
}

/** A regra, em memória: minha, ou na fila de um time meu (ou sem time), ou de um time que supervisiono. */
export function podeVerConversa(v: Visao, c: { atendente_id: number | null; time_id: string | null; estado: string }): boolean {
  if (v.tudo) return true;
  if (c.atendente_id === v.eu) return true;
  if (c.estado === 'na_fila' || c.estado === 'nova' || c.estado === 'em_triagem') {
    if (!c.time_id || v.meusTimes.includes(c.time_id)) return true;
  }
  return Boolean(c.time_id && v.supervisiona.includes(c.time_id));
}

/** A mesma regra como filtro do PostgREST (ids vêm do banco; nada vindo do navegador entra aqui). */
export function filtroDaVisao(v: Visao): string | null {
  if (v.tudo) return null;
  const partes = [`atendente_id.eq.${v.eu}`, `and(estado.in.(na_fila,nova,em_triagem),time_id.is.null)`];
  if (v.meusTimes.length) partes.push(`and(estado.in.(na_fila,nova,em_triagem),time_id.in.(${v.meusTimes.join(',')}))`);
  if (v.supervisiona.length) partes.push(`time_id.in.(${v.supervisiona.join(',')})`);
  return partes.join(',');
}

// ---------------------------------------------------------------------------
//  Leitura
// ---------------------------------------------------------------------------

const CONVERSA_COLUNAS = 'id, cliente_id, conexao_id, estado, time_id, atendente_id, prioridade, assunto, intencao, resumo, aberta_em, primeira_resposta_em, ultima_mensagem_em, ultima_mensagem_do_cliente_em, ultima_mensagem_texto, ultima_mensagem_de, nao_lidas, encerrada_em, avaliacao_pedida_em, avaliacao_nota, atualizado_em';
const CLIENTE_COLUNAS = 'id, telefone, nome, nome_whatsapp, foto_url, email, observacoes, ia_ativa, primeiro_contato_em, ultimo_contato_em';
const MENSAGEM_COLUNAS = 'id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto, midia, wa_id, status, erro, respondendo_a, criado_em';
const COM_CLIENTE = `${CONVERSA_COLUNAS}, cliente:atende_clientes(${CLIENTE_COLUNAS}), etiquetas:atende_conversa_etiquetas(etiqueta_id)`;

function montarConversa(linha: any): Conversa {
  const { cliente, etiquetas, ...c } = linha;
  return { ...c, atendente_id: c.atendente_id === null ? null : Number(c.atendente_id), cliente: cliente as Cliente, etiquetas: ((etiquetas || []) as any[]).map((e) => e.etiqueta_id) };
}

function montarMensagem(linha: any): Mensagem {
  return { ...linha, autor_id: linha.autor_id === null ? null : Number(linha.autor_id) };
}

export type { Filtro };

/** Nome para mostrar: o que a equipe deu, o do WhatsApp, ou o telefone. */
function nomeDoCliente(c: Cliente): string {
  return c.nome?.trim() || c.nome_whatsapp?.trim() || `+${c.telefone}`;
}

/** Só letras, números e o que cabe num nome ou telefone: nada de vírgula ou parêntese, que são estrutura do filtro. */
export function limparBusca(q: unknown): string {
  return String(q ?? '')
    .replace(/[^\p{L}\p{N} @.+\-]/gu, '')
    .trim()
    .slice(0, 60);
}

export async function listarConversas(req: RequisicaoAtende, opcoes: { filtro: Filtro; timeId?: string | null; busca?: string; limite?: number }): Promise<Conversa[]> {
  const db = req.dbAtende!;
  const visao = await visaoDe(req);
  let q = db.from('atende_conversas').select(COM_CLIENTE).order('ultima_mensagem_em', { ascending: false }).limit(opcoes.limite ?? 100);
  const f = filtroDaVisao(visao);
  if (f) q = q.or(f);
  switch (opcoes.filtro) {
    case 'minhas':
      q = q.eq('atendente_id', visao.eu).neq('estado', 'encerrada');
      break;
    case 'fila':
      q = q.in('estado', ['na_fila', 'nova', 'em_triagem']);
      break;
    case 'aguardando':
      q = q.eq('estado', 'aguardando_cliente');
      break;
    case 'encerradas':
      q = q.eq('estado', 'encerrada');
      break;
    case 'todas':
      break;
    default:
      q = q.neq('estado', 'encerrada');
  }
  if (opcoes.timeId) q = q.eq('time_id', opcoes.timeId);
  const busca = limparBusca(opcoes.busca);
  if (busca) {
    const { data: clientes } = await db.from('atende_clientes').select('id').or(`nome.ilike.%${busca}%,nome_whatsapp.ilike.%${busca}%,telefone.ilike.%${busca.replace(/\D/g, '') || busca}%`).limit(200);
    const ids = ((clientes || []) as any[]).map((c) => c.id);
    if (ids.length === 0) return [];
    q = q.in('cliente_id', ids);
  }
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as any[]).map(montarConversa);
}

export async function conversaPorId(req: RequisicaoAtende, id: string): Promise<Conversa | null> {
  const { data, error } = await req.dbAtende!.from('atende_conversas').select(COM_CLIENTE).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = montarConversa(data);
  return podeVerConversa(await visaoDe(req), c) ? c : null;
}

export async function mensagensDaConversa(req: RequisicaoAtende, conversaId: string, opcoes: { antesDe?: string | null; limite?: number } = {}): Promise<Mensagem[]> {
  let q = req.dbAtende!.from('atende_mensagens').select(MENSAGEM_COLUNAS).eq('conversa_id', conversaId).order('criado_em', { ascending: false }).limit(opcoes.limite ?? 60);
  if (opcoes.antesDe) q = q.lt('criado_em', opcoes.antesDe);
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as any[]).map(montarMensagem).reverse();
}

/** A URL assinada da mídia de uma mensagem — depois de conferir que a pessoa vê a conversa. */
export async function urlDaMidia(req: RequisicaoAtende, mensagemId: string, download: boolean): Promise<string | null> {
  const { data: m } = await req.dbAtende!.from('atende_mensagens').select('conversa_id, midia').eq('id', mensagemId).maybeSingle();
  if (!m?.midia?.caminho) return null;
  const conversa = await conversaPorId(req, m.conversa_id);
  if (!conversa) return null;
  return urlAssinada(m.midia.caminho, download ? (m.midia.nome ?? undefined) : undefined);
}

// ---------------------------------------------------------------------------
//  Escrita
// ---------------------------------------------------------------------------

export class ErroDeConversa extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

async function exigirConversa(req: RequisicaoAtende, id: string): Promise<Conversa> {
  const c = await conversaPorId(req, id);
  if (!c) throw new ErroDeConversa('Conversa não encontrada.', 404);
  return c;
}

export async function registrarEvento(db: ScopedDb, conversaId: string, usuarioId: number | null, tipo: string, dados?: Record<string, unknown>) {
  await db.from('atende_eventos').insert({ conversa_id: conversaId, usuario_id: usuarioId, tipo, dados: dados ?? null });
}

async function instanciaDaConversa(req: RequisicaoAtende, c: Conversa): Promise<string> {
  if (c.conexao_id) {
    const { data } = await supabaseServer.from('atende_conexoes').select('instancia').eq('id', c.conexao_id).maybeSingle();
    if (data?.instancia) return data.instancia;
  }
  const { data } = await supabaseServer.from('atende_conexoes').select('instancia').eq('empresa_id', req.sessao!.empresa_id).maybeSingle();
  if (!data?.instancia) throw new ErroDeConversa('A empresa ainda não conectou o WhatsApp.', 409);
  return data.instancia;
}

/**
 * Passo 1 de um arquivo: o servidor reserva o id da mensagem e o caminho no
 * bucket e devolve a URL para o navegador subir direto. Passo 2 é
 * enviarMensagem com `caminho`.
 */
export async function prepararUpload(req: RequisicaoAtende, conversaId: string, dados: { mimetype?: unknown; nome?: unknown; tamanho?: unknown }): Promise<{ mensagemId: string; caminho: string; signedUrl: string; token: string }> {
  const c = await exigirConversa(req, conversaId);
  const mimetype = String(dados.mimetype ?? '').trim().toLowerCase();
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(mimetype)) throw new ErroDeConversa('Tipo de arquivo inválido.');
  const tamanho = Number(dados.tamanho ?? 0);
  if (!Number.isFinite(tamanho) || tamanho <= 0) throw new ErroDeConversa('Arquivo vazio.');
  if (tamanho > MIDIA_MAX_BYTES) throw new ErroDeConversa(`Arquivo grande demais (máximo ${Math.round(MIDIA_MAX_BYTES / 1024 / 1024)} MB).`, 413);
  const mensagemId = randomUUID();
  const caminho = caminhoDaMidia(req.sessao!.empresa_id, c.id, mensagemId, mimetype, typeof dados.nome === 'string' ? dados.nome : null);
  const { signedUrl, token } = await urlDeUpload(caminho);
  return { mensagemId, caminho, signedUrl, token };
}

export interface Envio {
  tipo: 'texto' | 'arquivo' | 'audio' | 'localizacao' | 'contato';
  texto?: string;
  /** arquivo/audio: o caminho devolvido por prepararUpload (o arquivo já está no bucket), o mimetype e `nome` para documentos. */
  caminho?: string;
  mimetype?: string;
  nome?: string;
  latitude?: number;
  longitude?: number;
  contato?: { nome: string; telefone: string };
  respondendo_a?: string | null;
}

/**
 * Manda para o cliente. A linha nasce "enviando", a Evolution devolve o id
 * do WhatsApp, a linha vira "enviada" (entregue/lida chegam pelo webhook).
 * Se falhar, fica "falhou" com o motivo — a pessoa vê e reenvia.
 *
 * Quem responde assume: conversa na fila passa para a pessoa; depois de
 * responder, a bola está com o cliente (aguardando_cliente).
 */
/** O time da conversa pede anonimato? Sem time, não — a assinatura é a regra. */
async function timeEhAnonimo(db: RequisicaoAtende['dbAtende'], timeId: string | null): Promise<boolean> {
  if (!timeId) return false;
  const { data } = await db!.from('atende_times').select('anonimo').eq('id', timeId).maybeSingle();
  return (data as { anonimo?: boolean } | null)?.anonimo === true;
}

export async function enviarMensagem(req: RequisicaoAtende, conversaId: string, envio: Envio): Promise<Mensagem> {
  const db = req.dbAtende!;
  const s = req.sessao!;
  const c = await exigirConversa(req, conversaId);
  const instancia = await instanciaDaConversa(req, c);
  const autorTipo = s.papel === 'supervisor' ? 'supervisor' : 'atendente';
  // Time anônimo: o cliente recebe só o texto, sem "Fulano:" na frente. Dentro
  // do Atende Aí a mensagem continua gravada com o autor de sempre.
  const remetente = (await timeEhAnonimo(db, c.time_id)) ? null : s.nome;

  let tipo: TipoDaMensagem = 'texto';
  let texto: string | null = null;
  let midia: Record<string, unknown> | null = null;
  const id = randomUUID();

  if (envio.tipo === 'texto') {
    texto = String(envio.texto ?? '').trim().slice(0, 4000);
    if (!texto) throw new ErroDeConversa('Escreva a mensagem.');
  } else if (envio.tipo === 'arquivo' || envio.tipo === 'audio') {
    const caminho = String(envio.caminho ?? '');
    const mimetype = String(envio.mimetype ?? '').trim().toLowerCase();
    // O caminho tem que ser desta empresa e desta conversa — nunca se aponta para o arquivo de outra.
    if (!caminho.startsWith(`${s.empresa_id}/${c.id}/`) || caminho.includes('..') || !mimetype) throw new ErroDeConversa('Arquivo inválido.');
    const tamanho = await tamanhoDaMidia(caminho);
    if (tamanho === null) throw new ErroDeConversa('O arquivo não chegou ao Storage. Envie de novo.');
    tipo = envio.tipo === 'audio' ? 'audio' : tipoPeloMimetype(mimetype);
    texto = envio.texto ? String(envio.texto).trim().slice(0, 1000) || null : null;
    midia = { caminho, mimetype, nome: envio.nome ? String(envio.nome).slice(0, 120) : null, tamanho, pendente: false };
  } else if (envio.tipo === 'localizacao') {
    const lat = Number(envio.latitude);
    const lon = Number(envio.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ErroDeConversa('Localização inválida.');
    tipo = 'localizacao';
    texto = envio.texto ? String(envio.texto).trim().slice(0, 200) || null : null;
    midia = { latitude: lat, longitude: lon };
  } else if (envio.tipo === 'contato') {
    const nome = String(envio.contato?.nome ?? '').trim().slice(0, 80);
    const tel = String(envio.contato?.telefone ?? '').replace(/\D/g, '');
    if (!nome || tel.length < 10) throw new ErroDeConversa('Contato precisa de nome e telefone.');
    tipo = 'contato';
    texto = nome;
    midia = { contato: { nome, telefone: tel } };
  } else throw new ErroDeConversa('Tipo de mensagem desconhecido.');

  const { data: linha, error } = await db
    .from('atende_mensagens')
    .insert({ id, conversa_id: c.id, direcao: 'saida', autor_tipo: autorTipo, autor_id: s.id, tipo, texto, midia, conexao_id: c.conexao_id, status: 'enviando', respondendo_a: envio.respondendo_a ?? null })
    .select(MENSAGEM_COLUNAS)
    .single();
  if (error || !linha) throw error ?? new Error('não gravou a mensagem');

  // A conversa já reflete a resposta, mesmo antes de a Evolution confirmar.
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = { ultima_mensagem_em: agora, ultima_mensagem_texto: previaDe(tipo, texto).slice(0, 200), ultima_mensagem_de: autorTipo, estado: 'aguardando_cliente' };
  if (!c.primeira_resposta_em) patch.primeira_resposta_em = agora;
  if (!c.atendente_id) patch.atendente_id = s.id;
  if (c.estado === 'encerrada') patch.encerrada_em = null;
  await db.from('atende_conversas').update(patch).eq('id', c.id);
  if (!c.atendente_id) await registrarEvento(db, c.id, s.id, 'assumida', { ao_responder: true });
  if (c.estado === 'encerrada') await registrarEvento(db, c.id, s.id, 'reaberta', { ao_responder: true });

  // ---- Evolution
  // No WhatsApp, a mensagem sai assinada por quem a escreveu ("Samuel Alves:" e o texto na linha de baixo).
  // Só no que vai para o cliente: a linha gravada acima é o texto como foi escrito.
  let enviada: Enviada;
  try {
    const cit = envio.respondendo_a ? await chaveDaMensagem(db, envio.respondendo_a) : null;
    if (envio.tipo === 'texto') enviada = await enviarTextoComId(c.cliente.telefone, assinarRemetente(remetente, texto!), instancia, cit ? { citando: cit } : {});
    else if (envio.tipo === 'audio' || envio.tipo === 'arquivo') {
      // A Evolution baixa o arquivo direto do bucket, por uma URL assinada de 10 min.
      const url = await urlAssinada(midia!.caminho as string);
      if (envio.tipo === 'audio') enviada = await enviarAudio(c.cliente.telefone, url, instancia);
      else enviada = await enviarMidia(c.cliente.telefone, { tipo: tipo === 'imagem' ? 'image' : tipo === 'video' ? 'video' : 'document', conteudo: url, mimetype: midia!.mimetype as string, nomeArquivo: (midia!.nome as string | null) ?? undefined, legenda: texto ? assinarRemetente(remetente, texto) : undefined }, instancia);
    }
    else if (envio.tipo === 'localizacao') enviada = await enviarLocalizacao(c.cliente.telefone, { latitude: Number(envio.latitude), longitude: Number(envio.longitude), nome: texto ?? undefined }, instancia);
    else enviada = await enviarContato(c.cliente.telefone, midia!.contato as { nome: string; telefone: string }, instancia);
  } catch (e: any) {
    console.error('[atende enviar]', e.message);
    const { data: falhou } = await db.from('atende_mensagens').update({ status: 'falhou', erro: String(e.message).slice(0, 300) }).eq('id', id).select(MENSAGEM_COLUNAS).single();
    return montarMensagem(falhou ?? { ...linha, status: 'falhou', erro: e.message });
  }
  const { data: ok } = await db.from('atende_mensagens').update({ status: 'enviada', wa_id: enviada.waId }).eq('id', id).select(MENSAGEM_COLUNAS).single();
  return montarMensagem(ok ?? { ...linha, status: 'enviada', wa_id: enviada.waId });
}

async function chaveDaMensagem(db: ScopedDb, mensagemId: string): Promise<{ id: string; remoteJid: string; fromMe: boolean } | null> {
  const { data } = await db.from('atende_mensagens').select('wa_id, direcao, conversa:atende_conversas(cliente:atende_clientes(telefone))').eq('id', mensagemId).maybeSingle();
  const telefone = (data as any)?.conversa?.cliente?.telefone;
  if (!data?.wa_id || !telefone) return null;
  return { id: data.wa_id, remoteJid: `${telefone}@s.whatsapp.net`, fromMe: data.direcao === 'saida' };
}

/** Mensagem que só a equipe vê. Vale para orientação do supervisor também. */
export async function notaInterna(req: RequisicaoAtende, conversaId: string, texto: string): Promise<Mensagem> {
  const c = await exigirConversa(req, conversaId);
  const t = String(texto ?? '').trim().slice(0, 4000);
  if (!t) throw new ErroDeConversa('Escreva a nota.');
  const s = req.sessao!;
  const { data, error } = await req.dbAtende!.from('atende_mensagens').insert({ conversa_id: c.id, direcao: 'interna', autor_tipo: s.papel === 'supervisor' ? 'supervisor' : 'atendente', autor_id: s.id, tipo: 'texto', texto: t, status: 'entregue' }).select(MENSAGEM_COLUNAS).single();
  if (error || !data) throw error ?? new Error('não gravou a nota');
  await req.dbAtende!.from('atende_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', c.id);
  // Supervisor anotando na conversa de outra pessoa: é orientação, e fica na auditoria.
  if (pode(s.papel, 'conversas.supervisionar') && c.atendente_id && c.atendente_id !== s.id) {
    await registrarEvento(req.dbAtende!, c.id, s.id, 'orientacao', { para: c.atendente_id, mensagem_id: data.id });
    await avisarSobreConversa(s.empresa_id, { id: c.id, atendente_id: c.atendente_id, time_id: c.time_id }, { titulo: `Orientação de ${s.nome}`, corpo: `${nomeDoCliente(c.cliente)}: ${t.slice(0, 140)}` }, s.id);
  }
  return montarMensagem(data);
}

export async function assumir(req: RequisicaoAtende, conversaId: string): Promise<Conversa> {
  const c = await exigirConversa(req, conversaId);
  const s = req.sessao!;
  if (c.atendente_id === s.id && c.estado !== 'encerrada') return c;
  const patch: Record<string, unknown> = { atendente_id: s.id };
  if (['na_fila', 'nova', 'em_triagem', 'encerrada'].includes(c.estado)) patch.estado = 'em_atendimento';
  if (c.estado === 'encerrada') patch.encerrada_em = null;
  const { error } = await req.dbAtende!.from('atende_conversas').update(patch).eq('id', c.id);
  if (error) throw error;
  await registrarEvento(req.dbAtende!, c.id, s.id, c.atendente_id && c.atendente_id !== s.id ? 'transferida' : 'assumida', { de: c.atendente_id, para: s.id });
  return (await conversaPorId(req, c.id))!;
}

/** ATD-21: nome que veio do WhatsApp TUDO EM MAIÚSCULAS fica estranho na despedida ("TESTE!"); nomes com
 * maiúscula e minúscula misturadas (a maioria) não mudam — só o que já era só-caixa-alta é normalizado. */
export function primeiroNomeApresentavel(nome: string | null | undefined): string | null {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0];
  if (!primeiro) return null;
  const temMinuscula = /\p{Ll}/u.test(primeiro);
  if (temMinuscula) return primeiro;
  return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR');
}

/**
 * Encerra pedindo a nota: a IA escreve a despedida (no tom da conversa), a
 * mensagem sai com a pergunta de 0 a 10, e a conversa fica marcada como
 * "avaliação pedida" — o webhook reconhece a resposta do cliente.
 */
export async function encerrarComAvaliacao(req: RequisicaoAtende, conversaId: string, motivo?: string): Promise<Conversa> {
  const db = req.dbAtende!;
  const s = req.sessao!;
  const c = await exigirConversa(req, conversaId);
  if (c.estado === 'encerrada') throw new ErroDeConversa('A conversa já está encerrada.');
  const [{ data: emp }, { data: msgs }] = await Promise.all([
    db.from('atende_empresas').select('nome, segmento, regras_atendimento').eq('id', s.empresa_id).maybeSingle(),
    db.from('atende_mensagens').select('direcao, texto, tipo').eq('conversa_id', c.id).neq('direcao', 'sistema').order('criado_em', { ascending: false }).limit(8),
  ]);
  const cliente = primeiroNomeApresentavel(c.cliente.nome ?? c.cliente.nome_whatsapp);
  const { texto: despedida, modelo } = await escreverDespedida({ empresa: { nome: emp?.nome ?? '', segmento: emp?.segmento ?? null, regras_atendimento: emp?.regras_atendimento ?? null }, cliente, atendente: s.nome, assunto: c.assunto, resumo: c.resumo, mensagens: ((msgs || []) as any[]).reverse() });
  const enviou = await enviarComoIa({ empresaId: s.empresa_id, conversaId: c.id, conexaoId: c.conexao_id, telefone: c.cliente.telefone, texto: mensagemDeEncerramento(despedida) });
  if (!enviou) throw new ErroDeConversa('Não foi possível enviar a mensagem de encerramento pelo WhatsApp. Confira a conexão e tente de novo, ou encerre sem mensagem.', 502);
  const agora = new Date().toISOString();
  const { error } = await db.from('atende_conversas').update({ avaliacao_pedida_em: agora, avaliacao_nota: null, avaliacao_em: null, avaliacao_comentario: null }).eq('id', c.id);
  if (error) throw error;
  // ATD-01: uma linha por atendimento, com quem atendia AGORA — não muda se o fio for reaberto depois.
  const { error: erroAvaliacao } = await db
    .from('atende_avaliacoes')
    .insert({ empresa_id: s.empresa_id, conversa_id: c.id, cliente_id: c.cliente.id, atendente_id: c.atendente_id, time_id: c.time_id, assunto: c.assunto, modelo, pedida_em: agora });
  if (erroAvaliacao && !/atende_avaliacoes/.test(erroAvaliacao.message)) throw erroAvaliacao; // sem a migração 044, segue só com a coluna antiga
  await registrarEvento(db, c.id, s.id, 'avaliacao_pedida', { modelo });
  return encerrar(req, conversaId, motivo);
}

export async function encerrar(req: RequisicaoAtende, conversaId: string, motivo?: string): Promise<Conversa> {
  const c = await exigirConversa(req, conversaId);
  const s = req.sessao!;
  const agora = new Date().toISOString();
  const { error } = await req.dbAtende!.from('atende_conversas').update({ estado: 'encerrada', encerrada_em: agora, encerrada_por: s.id, motivo_encerramento: motivo ? String(motivo).trim().slice(0, 300) : null, nao_lidas: 0 }).eq('id', c.id);
  if (error) throw error;
  await registrarEvento(req.dbAtende!, c.id, s.id, 'encerrada', { motivo: motivo ?? null });
  await req.dbAtende!.from('atende_mensagens').insert({ conversa_id: c.id, direcao: 'sistema', autor_tipo: 'sistema', tipo: 'texto', texto: `Conversa encerrada por ${s.nome}${motivo ? ` — ${String(motivo).trim().slice(0, 300)}` : ''}.`, status: 'entregue' });
  return (await conversaPorId(req, c.id))!;
}

export async function reabrir(req: RequisicaoAtende, conversaId: string): Promise<Conversa> {
  const c = await exigirConversa(req, conversaId);
  if (c.estado !== 'encerrada') return c;
  const s = req.sessao!;
  const { error } = await req.dbAtende!.from('atende_conversas').update({ estado: 'em_atendimento', encerrada_em: null, encerrada_por: null, atendente_id: c.atendente_id ?? s.id }).eq('id', c.id);
  if (error) throw error;
  await registrarEvento(req.dbAtende!, c.id, s.id, 'reaberta');
  return (await conversaPorId(req, c.id))!;
}

/** Zera o contador e avisa o WhatsApp (tracinhos azuis) das últimas mensagens recebidas. */
export async function marcarComoLida(req: RequisicaoAtende, conversaId: string): Promise<void> {
  const c = await exigirConversa(req, conversaId);
  if (c.nao_lidas > 0) await req.dbAtende!.from('atende_conversas').update({ nao_lidas: 0 }).eq('id', c.id);
  const { data } = await req.dbAtende!.from('atende_mensagens').select('wa_id').eq('conversa_id', c.id).eq('direcao', 'entrada').not('wa_id', 'is', null).order('criado_em', { ascending: false }).limit(20);
  const chaves = ((data || []) as any[]).map((m) => ({ id: m.wa_id as string, remoteJid: `${c.cliente.telefone}@s.whatsapp.net`, fromMe: false }));
  if (chaves.length) {
    const instancia = await instanciaDaConversa(req, c).catch(() => null);
    if (instancia) void marcarLidas(chaves, instancia);
  }
}

export async function atualizarCliente(req: RequisicaoAtende, clienteId: string, dados: { nome?: unknown; email?: unknown; observacoes?: unknown; ia_ativa?: unknown }): Promise<Cliente> {
  const patch: Record<string, unknown> = {};
  if (dados.nome !== undefined) patch.nome = String(dados.nome ?? '').trim().slice(0, 80) || null;
  if (dados.email !== undefined) patch.email = String(dados.email ?? '').trim().toLowerCase().slice(0, 120) || null;
  if (dados.observacoes !== undefined) patch.observacoes = String(dados.observacoes ?? '').trim().slice(0, 2000) || null;
  if (dados.ia_ativa !== undefined) patch.ia_ativa = dados.ia_ativa !== false && dados.ia_ativa !== 'false';
  if (!Object.keys(patch).length) throw new ErroDeConversa('Nada para alterar.');
  const { data, error } = await req.dbAtende!.from('atende_clientes').update(patch).eq('id', clienteId).select(CLIENTE_COLUNAS).single();
  if (error || !data) throw error ?? new ErroDeConversa('Cliente não encontrado.', 404);
  return data as Cliente;
}

/** Busca rápida de clientes por nome/telefone — para escolher um proprietário no Inventário, por exemplo. */
export async function buscarClientes(req: RequisicaoAtende, busca: string): Promise<Array<{ id: string; nome: string; telefone: string }>> {
  const alvo = busca.trim();
  if (!alvo) return [];
  const { data, error } = await req.dbAtende!.from('atende_clientes').select('id, nome, nome_whatsapp, telefone').or(`nome.ilike.%${alvo}%,nome_whatsapp.ilike.%${alvo}%,telefone.ilike.%${alvo}%`).order('ultimo_contato_em', { ascending: false }).limit(10);
  if (error) throw error;
  return ((data || []) as any[]).map((c) => ({ id: c.id, nome: c.nome || c.nome_whatsapp || `+${c.telefone}`, telefone: c.telefone }));
}

export async function conversasDoCliente(req: RequisicaoAtende, clienteId: string): Promise<Conversa[]> {
  const { data, error } = await req.dbAtende!.from('atende_conversas').select(COM_CLIENTE).eq('cliente_id', clienteId).order('aberta_em', { ascending: false }).limit(20);
  if (error) throw error;
  const visao = await visaoDe(req);
  return ((data || []) as any[]).map(montarConversa).filter((c) => podeVerConversa(visao, c));
}

// ---------------------------------------------------------------------------
//  Etiquetas
// ---------------------------------------------------------------------------

export async function listarEtiquetas(req: RequisicaoAtende): Promise<Etiqueta[]> {
  const { data, error } = await req.dbAtende!.from('atende_etiquetas').select('id, nome, cor').order('nome');
  if (error) throw error;
  return (data || []) as Etiqueta[];
}

export async function criarEtiqueta(req: RequisicaoAtende, nome: unknown, cor: unknown): Promise<Etiqueta[]> {
  const n = String(nome ?? '').trim().slice(0, 40);
  const c = /^#[0-9a-fA-F]{6}$/.test(String(cor ?? '')) ? String(cor) : '#7c3aed';
  if (!n) throw new ErroDeConversa('Dê um nome à etiqueta.');
  const { error } = await req.dbAtende!.from('atende_etiquetas').insert({ nome: n, cor: c });
  if (error && error.code !== '23505') throw error;
  return listarEtiquetas(req);
}

export async function definirEtiquetas(req: RequisicaoAtende, conversaId: string, etiquetas: unknown): Promise<Conversa> {
  const c = await exigirConversa(req, conversaId);
  const ids = Array.isArray(etiquetas) ? [...new Set(etiquetas.map(String))] : [];
  const db = req.dbAtende!;
  await db.from('atende_conversa_etiquetas').delete().eq('conversa_id', c.id);
  let ok: string[] = [];
  if (ids.length) {
    const { data: validas } = await db.from('atende_etiquetas').select('id').in('id', ids);
    ok = ((validas || []) as any[]).map((e) => e.id);
    if (ok.length) await db.from('atende_conversa_etiquetas').insert(ok.map((etiqueta_id: string) => ({ conversa_id: c.id, etiqueta_id })));
  }
  // Espelha no cliente — é dali que um disparo em massa por etiqueta lê,
  // porque uma etiqueta é de quem a pessoa É, não da conversa de hoje.
  const { error: erroClienteEt } = await db.from('atende_cliente_etiquetas').delete().eq('cliente_id', c.cliente_id);
  if (erroClienteEt && !/atende_cliente_etiquetas/.test(erroClienteEt.message)) throw erroClienteEt; // sem a migração 045 ainda
  if (!erroClienteEt && ok.length) {
    const { error: erroInsereEt } = await db.from('atende_cliente_etiquetas').insert(ok.map((etiqueta_id: string) => ({ cliente_id: c.cliente_id, etiqueta_id })));
    if (erroInsereEt && !/atende_cliente_etiquetas/.test(erroInsereEt.message)) throw erroInsereEt;
  }
  await db.from('atende_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', c.id);
  return (await conversaPorId(req, c.id))!;
}

// ---------------------------------------------------------------------------
//  Sincronização incremental
// ---------------------------------------------------------------------------

/**
 * O que mudou desde `desde`: conversas (com cliente), mensagens novas ou com
 * status novo, presença da equipe, e a conexão. Serve de heartbeat da
 * presença de quem pergunta.
 *
 * O cursor é o relógio do BANCO, não o do servidor: o maior `atualizado_em`
 * que veio nesta rodada (ver cursorDoDelta). Um relógio de servidor
 * adiantado — aconteceu no desenvolvimento, 22 s — faria cada mudança
 * nascer "no passado" do cursor e nunca chegar.
 */
export async function delta(req: RequisicaoAtende, desde: string | null): Promise<Delta> {
  const db = req.dbAtende!;
  const s = req.sessao!;
  const inicio = Date.now();
  const visao = await visaoDe(req);
  const f = filtroDaVisao(visao);

  const [conversasRes, mensagensRes, equipeRes, conexaoRes] = await Promise.all([
    (() => {
      let q = db.from('atende_conversas').select(COM_CLIENTE).order('atualizado_em', { ascending: false }).limit(200);
      if (f) q = q.or(f);
      if (desde) q = q.gte('atualizado_em', desde);
      else q = q.neq('estado', 'encerrada');
      return q;
    })(),
    desde ? db.from('atende_mensagens').select(`${MENSAGEM_COLUNAS}, atualizado_em`).gte('atualizado_em', desde).order('atualizado_em', { ascending: true }).limit(300) : Promise.resolve({ data: [], error: null }),
    db.from('atende_usuarios').select('id, presenca, presenca_em').eq('ativo', true),
    supabaseServer.from('atende_conexoes').select('id, instancia, numero, estado, conectado_em, ultimo_evento_em').eq('empresa_id', s.empresa_id).maybeSingle(),
  ]);
  if (conversasRes.error) throw conversasRes.error;
  if (mensagensRes.error) throw mensagensRes.error;

  const conversas = ((conversasRes.data || []) as any[]).map(montarConversa);
  const cursor = cursorDoDelta([...((conversasRes.data || []) as any[]), ...((mensagensRes.data || []) as any[])].map((l) => l.atualizado_em), desde, inicio);
  const visiveis = new Set(conversas.map((c) => c.id));
  let mensagens = ((mensagensRes.data || []) as any[]).map(({ atualizado_em: _carimbo, ...m }) => montarMensagem(m));

  // Mensagem de conversa que não veio no delta (não mudou): confere se a pessoa vê aquela conversa.
  const faltando = [...new Set(mensagens.map((m) => m.conversa_id).filter((id) => !visiveis.has(id)))];
  if (faltando.length) {
    let q = db.from('atende_conversas').select('id, atendente_id, time_id, estado').in('id', faltando);
    if (f) q = q.or(f);
    const { data } = await q;
    for (const c of (data || []) as any[]) visiveis.add(c.id);
    mensagens = mensagens.filter((m) => visiveis.has(m.conversa_id));
  }

  // Heartbeat: quem sincroniza está aqui. 'ausente' é escolha da pessoa e fica; o resto vira 'online'.
  const batida = new Date().toISOString();
  void db.from('atende_usuarios').update({ presenca: 'online', presenca_em: batida }).eq('id', s.id).neq('presenca', 'ausente').then(() => undefined, () => undefined);
  void db.from('atende_usuarios').update({ presenca_em: batida }).eq('id', s.id).eq('presenca', 'ausente').then(() => undefined, () => undefined);

  return {
    cursor,
    conversas,
    mensagens,
    equipe: ((equipeRes.data || []) as any[]).map((u) => ({ id: Number(u.id), presenca: u.presenca, presenca_em: u.presenca_em })),
    conexao: (conexaoRes.data as any) ?? null,
  };
}

/**
 * O maior carimbo visto (a consulta seguinte usa >=, então a linha da
 * fronteira volta uma vez — a tela deduplica — e nada que nasça com o mesmo
 * carimbo se perde). Sem nada novo, o cursor anterior fica; na primeira vez
 * sem nada, 5 min atrás do relógio do servidor: repetir é barato, perder não.
 */
export function cursorDoDelta(carimbos: Array<string | null | undefined>, desde: string | null, agora: number): string {
  let maior: number | null = null;
  for (const c of carimbos) {
    const t = c ? Date.parse(c) : NaN;
    if (Number.isFinite(t) && (maior === null || t > maior)) maior = t;
  }
  if (maior !== null) return new Date(maior).toISOString();
  return desde ?? new Date(agora - 5 * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
//  Etapa 3: a triagem da IA e o lead, vistos pela equipe
// ---------------------------------------------------------------------------

const TRIAGEM_COLUNAS = 'id, conversa_id, rodada, assunto, intencao, time_sugerido_id, atendente_sugerido_id, prioridade, confianca, resumo, pediu_esclarecimento, resposta_enviada, desfecho, modelo, corrigido_por, time_corrigido_id, corrigido_em, motivo_correcao, criado_em';
export const LEAD_COLUNAS = 'id, conversa_id, cliente_id, estado, sugestao_ia, valor, atualizado_por, criado_em, atualizado_em, followup_sugestao, followup_sugerido_em, followup_enviado_em, followup_descartado_em, mcmv_status, mcmv_iniciado_em, mcmv_atualizado_em, origem';

function montarTriagem(linha: any): Triagem {
  return { ...linha, atendente_sugerido_id: linha.atendente_sugerido_id === null ? null : Number(linha.atendente_sugerido_id), corrigido_por: linha.corrigido_por === null ? null : Number(linha.corrigido_por), confianca: linha.confianca === null ? null : Number(linha.confianca) };
}

export function montarLead(linha: any): Lead {
  return {
    ...linha,
    atualizado_por: linha.atualizado_por === null ? null : Number(linha.atualizado_por),
    valor: linha.valor === null ? null : Number(linha.valor),
    origem: linha.origem ?? 'whatsapp',
    mcmv_status: linha.mcmv_status ?? null,
    mcmv_iniciado_em: linha.mcmv_iniciado_em ?? null,
    mcmv_atualizado_em: linha.mcmv_atualizado_em ?? null,
  };
}

/** As rodadas da IA nesta conversa (a mais recente primeiro) e o lead. */
export async function triagemDaConversa(req: RequisicaoAtende, conversaId: string): Promise<{ triagens: Triagem[]; lead: Lead | null }> {
  const c = await exigirConversa(req, conversaId);
  const [{ data: triagens, error }, { data: lead, error: erroLead }] = await Promise.all([
    req.dbAtende!.from('atende_triagens').select(TRIAGEM_COLUNAS).eq('conversa_id', c.id).order('criado_em', { ascending: false }).limit(10),
    req.dbAtende!.from('atende_leads').select(LEAD_COLUNAS).eq('conversa_id', c.id).maybeSingle(),
  ]);
  if (error) throw error;
  if (erroLead) throw erroLead;
  return { triagens: ((triagens || []) as any[]).map(montarTriagem), lead: lead ? montarLead(lead) : null };
}

/**
 * O supervisor corrige o setor que a IA escolheu. A conversa muda de time;
 * se quem estava atendendo não é do novo time, volta para a fila desse time.
 * A correção fica na última triagem (quem, para onde, por quê) — é o dado
 * que depois mostra onde a IA erra.
 */
export async function corrigirTriagem(req: RequisicaoAtende, conversaId: string, dados: { time_id?: unknown; motivo?: unknown }): Promise<Conversa> {
  const c = await exigirConversa(req, conversaId);
  const s = req.sessao!;
  const db = req.dbAtende!;
  const timeId = String(dados.time_id ?? '').trim();
  if (!timeId) throw new ErroDeConversa('Escolha o setor certo.');
  const { data: time } = await db.from('atende_times').select('id, nome').eq('id', timeId).eq('ativo', true).maybeSingle();
  if (!time) throw new ErroDeConversa('Setor não encontrado.', 404);
  if (c.time_id === time.id) throw new ErroDeConversa('A conversa já está neste setor.');
  const motivo = String(dados.motivo ?? '').trim().slice(0, 300) || null;

  const patch: Record<string, unknown> = { time_id: time.id };
  let voltouParaFila = false;
  if (c.atendente_id && c.estado !== 'encerrada') {
    const { data: membro } = await db.from('atende_time_membros').select('usuario_id').eq('time_id', time.id).eq('usuario_id', c.atendente_id).maybeSingle();
    if (!membro) {
      patch.atendente_id = null;
      patch.estado = 'na_fila';
      voltouParaFila = true;
    }
  } else if (c.estado === 'nova' || c.estado === 'em_triagem') patch.estado = 'na_fila';
  const { error } = await db.from('atende_conversas').update(patch).eq('id', c.id);
  if (error) throw error;

  const { data: ultima } = await db.from('atende_triagens').select('id, time_sugerido_id').eq('conversa_id', c.id).order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (ultima) await db.from('atende_triagens').update({ corrigido_por: s.id, time_corrigido_id: time.id, corrigido_em: new Date().toISOString(), motivo_correcao: motivo }).eq('id', ultima.id);
  await registrarEvento(db, c.id, s.id, 'triagem_corrigida', { de: c.time_id, para: time.id, triagem_id: ultima?.id ?? null, motivo, voltou_para_fila: voltouParaFila });
  await db.from('atende_mensagens').insert({ conversa_id: c.id, direcao: 'sistema', autor_tipo: 'sistema', tipo: 'texto', texto: `${s.nome} corrigiu a triagem: setor ${time.nome}${voltouParaFila ? ' (voltou para a fila do setor)' : ''}${motivo ? ` — ${motivo}` : ''}.`, status: 'entregue' });
  // Voltou para a fila de outro setor: o setor novo fica sabendo.
  if (voltouParaFila || !c.atendente_id) await avisarSobreConversa(s.empresa_id, { id: c.id, atendente_id: null, time_id: time.id }, { titulo: `Conversa na fila de ${time.nome}`, corpo: `${nomeDoCliente(c.cliente)} · setor corrigido por ${s.nome}` }, s.id);
  return (await conversaPorId(req, c.id))!;
}

/** A equipe move o lead no funil. A IA só sugere; aqui é gente decidindo. */
export async function atualizarLead(req: RequisicaoAtende, conversaId: string, dados: { estado?: unknown; valor?: unknown }): Promise<Lead> {
  const c = await exigirConversa(req, conversaId);
  const s = req.sessao!;
  const db = req.dbAtende!;
  const patch: Record<string, unknown> = { atualizado_por: s.id };
  if (dados.estado !== undefined) {
    if (!(ESTADOS_DO_LEAD as readonly string[]).includes(String(dados.estado))) throw new ErroDeConversa('Estado do lead inválido.');
    patch.estado = dados.estado;
  }
  if (dados.valor !== undefined) {
    if (dados.valor === null || dados.valor === '') patch.valor = null;
    else {
      const v = Number(dados.valor);
      if (!Number.isFinite(v) || v < 0 || v > 999_999_999) throw new ErroDeConversa('Valor inválido.');
      patch.valor = Math.round(v * 100) / 100;
    }
  }
  if (Object.keys(patch).length === 1) throw new ErroDeConversa('Nada para alterar.');
  const { data: atual } = await db.from('atende_leads').select(LEAD_COLUNAS).eq('conversa_id', c.id).maybeSingle();
  let linha: any;
  if (atual) {
    const { data, error } = await db.from('atende_leads').update(patch).eq('id', atual.id).select(LEAD_COLUNAS).single();
    if (error || !data) throw error ?? new Error('não atualizou o lead');
    linha = data;
  } else {
    // Conversa que nasceu sem triagem (IA desligada, ou a empresa começou pelo celular): o lead nasce agora.
    const { data, error } = await db.from('atende_leads').insert({ conversa_id: c.id, cliente_id: c.cliente_id, estado: 'novo', aprovado: true, ...patch }).select(LEAD_COLUNAS).single();
    if (error || !data) throw error ?? new Error('não criou o lead');
    linha = data;
  }
  await registrarEvento(db, c.id, s.id, 'lead_alterado', { de: atual?.estado ?? null, para: linha.estado, valor: linha.valor });
  await db.from('atende_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', c.id);
  return montarLead(linha);
}

/**
 * Quem atende decide que este lead vai entrar no pipeline de MCMV — a
 * partir daqui, é trabalho de quem analisa (papel `analista`), na tela
 * "Gestão de MCMV". Não muda o funil de vendas geral (`estado`): as duas
 * coisas correm em paralelo.
 */
export async function iniciarMcmv(req: RequisicaoAtende, conversaId: string): Promise<Lead> {
  const c = await exigirConversa(req, conversaId);
  const s = req.sessao!;
  const db = req.dbAtende!;
  const agora = new Date().toISOString();
  const { data: atual } = await db.from('atende_leads').select(LEAD_COLUNAS).eq('conversa_id', c.id).maybeSingle();
  if (atual?.mcmv_status) throw new ErroDeConversa('Este lead já está no pipeline de MCMV.');
  const patch = { mcmv_status: 'em_analise', mcmv_iniciado_em: agora, mcmv_atualizado_em: agora, atualizado_por: s.id };
  let linha: any;
  if (atual) {
    const { data, error } = await db.from('atende_leads').update(patch).eq('id', atual.id).select(LEAD_COLUNAS).single();
    if (error || !data) throw error ?? new Error('não encaminhou para o MCMV');
    linha = data;
  } else {
    const { data, error } = await db.from('atende_leads').insert({ conversa_id: c.id, cliente_id: c.cliente_id, estado: 'novo', aprovado: true, ...patch }).select(LEAD_COLUNAS).single();
    if (error || !data) throw error ?? new Error('não criou o lead');
    linha = data;
  }
  await registrarEvento(db, c.id, s.id, 'mcmv_alterado', { de: null, para: 'em_analise' });
  return montarLead(linha);
}

/**
 * Um lead que não veio pelo WhatsApp (Instagram, indicação…): cadastrado à
 * mão, sempre com telefone — isso cria uma conversa de verdade (mesma
 * regra "um contato, um fio" de quem chega pelo WhatsApp). Se o telefone já
 * é um contato desta empresa, reaproveita o cliente/conversa/lead que já
 * existem em vez de duplicar.
 */
export async function criarLeadManual(req: RequisicaoAtende, dados: { nome?: unknown; telefone?: unknown }): Promise<{ lead: Lead; conversa_id: string; reaproveitado: boolean }> {
  const db = req.dbAtende!;
  const nome = String(dados.nome ?? '').trim().slice(0, 80);
  if (!nome) throw new ErroDeConversa('Dê um nome ao lead.');
  const telefone = String(dados.telefone ?? '').replace(/\D/g, '');
  if (telefone.length < 10 || telefone.length > 15) throw new ErroDeConversa('Telefone inválido.');

  const { data: clienteExistente } = await db.from('atende_clientes').select('id').in('telefone', variantesDoTelefone(telefone)).maybeSingle();
  let clienteId: string;
  let reaproveitado = false;
  if (clienteExistente) {
    clienteId = clienteExistente.id;
    reaproveitado = true;
  } else {
    const agora = new Date().toISOString();
    const { data: novoCliente, error } = await db.from('atende_clientes').insert({ telefone, nome, primeiro_contato_em: agora, ultimo_contato_em: agora }).select('id').single();
    if (error || !novoCliente) throw error ?? new Error('não criou o cliente');
    clienteId = novoCliente.id;
  }

  const { data: conversaExistente } = await db.from('atende_conversas').select('id').eq('cliente_id', clienteId).neq('estado', 'encerrada').maybeSingle();
  let conversaId: string;
  if (conversaExistente) {
    conversaId = conversaExistente.id;
  } else {
    const { data: novaConversa, error } = await db.from('atende_conversas').insert({ cliente_id: clienteId, estado: 'nova' }).select('id').single();
    if (error || !novaConversa) throw error ?? new Error('não criou a conversa');
    conversaId = novaConversa.id;
  }

  const { data: leadExistente } = await db.from('atende_leads').select(LEAD_COLUNAS).eq('conversa_id', conversaId).maybeSingle();
  let linha: any;
  if (leadExistente) {
    linha = leadExistente;
    reaproveitado = true;
  } else {
    const { data, error } = await db.from('atende_leads').insert({ conversa_id: conversaId, cliente_id: clienteId, estado: 'novo', origem: 'manual', aprovado: true }).select(LEAD_COLUNAS).single();
    if (error || !data) throw error ?? new Error('não criou o lead');
    linha = data;
  }
  return { lead: montarLead(linha), conversa_id: conversaId, reaproveitado };
}

// ---------------------------------------------------------------------------
//  Etapa 4: supervisão — transferir, orientar, auditar, presença
// ---------------------------------------------------------------------------

/**
 * Transfere para uma pessoa (a conversa passa a ser dela) ou para um setor
 * (volta para a fila daquele time, sem atendente). Quem pode: o dono da
 * conversa, quem supervisiona, ou qualquer um se ela está na fila.
 */
export async function transferir(req: RequisicaoAtende, conversaId: string, dados: { atendente_id?: unknown; time_id?: unknown; motivo?: unknown }): Promise<Conversa> {
  const c = await exigirConversa(req, conversaId);
  const s = req.sessao!;
  const db = req.dbAtende!;
  if (c.estado === 'encerrada') throw new ErroDeConversa('Reabra a conversa antes de transferir.');
  const naFila = c.estado === 'na_fila' || c.estado === 'nova' || c.estado === 'em_triagem';
  if (!pode(s.papel, 'conversas.supervisionar') && c.atendente_id !== s.id && !naFila) throw new ErroDeConversa('Só quem está atendendo (ou um supervisor) pode transferir esta conversa.', 403);
  const motivo = String(dados.motivo ?? '').trim().slice(0, 300) || null;

  const patch: Record<string, unknown> = {};
  let texto: string;
  let para: { atendente_id: number | null; time_id: string | null };
  if (dados.atendente_id !== undefined && dados.atendente_id !== null && dados.atendente_id !== '') {
    const alvoId = Number(dados.atendente_id);
    if (!Number.isInteger(alvoId)) throw new ErroDeConversa('Pessoa inválida.');
    if (alvoId === c.atendente_id) throw new ErroDeConversa('A conversa já está com essa pessoa.');
    const { data: alvo } = await db.from('atende_usuarios').select('id, nome, ativo').eq('id', alvoId).maybeSingle();
    if (!alvo || !alvo.ativo) throw new ErroDeConversa('Pessoa não encontrada ou desativada.', 404);
    patch.atendente_id = alvoId;
    patch.estado = 'em_atendimento';
    // Se a pessoa é de um setor só, a conversa herda o setor; se já tem setor, fica.
    if (!c.time_id) {
      const { data: times } = await db.from('atende_time_membros').select('time_id').eq('usuario_id', alvoId);
      if (times && times.length === 1) patch.time_id = times[0].time_id;
    }
    para = { atendente_id: alvoId, time_id: (patch.time_id as string | undefined) ?? c.time_id };
    texto = `${s.nome} transferiu a conversa para ${alvo.nome}${motivo ? ` — ${motivo}` : ''}.`;
  } else if (typeof dados.time_id === 'string' && dados.time_id) {
    const { data: time } = await db.from('atende_times').select('id, nome').eq('id', dados.time_id).eq('ativo', true).maybeSingle();
    if (!time) throw new ErroDeConversa('Setor não encontrado.', 404);
    if (time.id === c.time_id && !c.atendente_id) throw new ErroDeConversa('A conversa já está na fila deste setor.');
    patch.time_id = time.id;
    patch.atendente_id = null;
    patch.estado = 'na_fila';
    para = { atendente_id: null, time_id: time.id };
    texto = `${s.nome} transferiu a conversa para a fila de ${time.nome}${motivo ? ` — ${motivo}` : ''}.`;
  } else throw new ErroDeConversa('Escolha uma pessoa ou um setor.');

  const { error } = await db.from('atende_conversas').update(patch).eq('id', c.id);
  if (error) throw error;
  await registrarEvento(db, c.id, s.id, 'transferida', { de: { atendente_id: c.atendente_id, time_id: c.time_id }, para, motivo });
  await db.from('atende_mensagens').insert({ conversa_id: c.id, direcao: 'sistema', autor_tipo: 'sistema', tipo: 'texto', texto, status: 'entregue' });
  // Push para quem recebeu: a pessoa, ou o time (menos quem transferiu).
  await avisarSobreConversa(s.empresa_id, { id: c.id, atendente_id: para.atendente_id, time_id: para.time_id }, { titulo: para.atendente_id ? 'Conversa transferida para você' : 'Conversa transferida para a fila do seu setor', corpo: `${nomeDoCliente(c.cliente)} · por ${s.nome}${motivo ? ` — ${motivo}` : ''}` }, s.id);
  return (await conversaPorId(req, c.id))!;
}

export interface EventoDaConversa {
  id: string;
  tipo: string;
  usuario_id: number | null;
  dados: Record<string, unknown> | null;
  criado_em: string;
}

/** A auditoria de uma conversa: quem fez o quê, em ordem. */
export async function eventosDaConversa(req: RequisicaoAtende, conversaId: string): Promise<EventoDaConversa[]> {
  const c = await exigirConversa(req, conversaId);
  const { data, error } = await req.dbAtende!.from('atende_eventos').select('id, tipo, usuario_id, dados, criado_em').eq('conversa_id', c.id).order('criado_em', { ascending: true }).limit(200);
  if (error) throw error;
  return ((data || []) as any[]).map((e) => ({ ...e, usuario_id: e.usuario_id === null ? null : Number(e.usuario_id) }));
}

/**
 * A pessoa escolhe ficar ausente (não recebe conversa da triagem) ou voltar.
 * 'offline' é o que a tela manda ao sair. O batimento do sync não desfaz
 * 'ausente' — só a própria pessoa.
 */
export async function definirPresenca(req: RequisicaoAtende, presenca: unknown): Promise<void> {
  if (presenca !== 'online' && presenca !== 'ausente' && presenca !== 'offline') throw new ErroDeConversa('Presença inválida.');
  const { error } = await req.dbAtende!.from('atende_usuarios').update({ presenca, presenca_em: new Date().toISOString() }).eq('id', req.sessao!.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
//  Follow-up do lead: a sugestão da IA só sai pela mão de alguém
// ---------------------------------------------------------------------------

/** Envia a retomada (o texto pode ter sido editado) e marca o lead. */
export async function enviarFollowup(req: RequisicaoAtende, conversaId: string, textoBruto: unknown): Promise<{ mensagem: Mensagem; lead: Lead }> {
  const db = req.dbAtende!;
  const c = await exigirConversa(req, conversaId);
  const { data: lead } = await db.from('atende_leads').select(LEAD_COLUNAS).eq('conversa_id', c.id).maybeSingle();
  if (!lead) throw new ErroDeConversa('Esta conversa não tem lead.', 404);
  const texto = String(textoBruto ?? lead.followup_sugestao ?? '').trim().slice(0, 1000);
  if (!texto) throw new ErroDeConversa('Escreva a mensagem de retomada.');
  const mensagem = await enviarMensagem(req, c.id, { tipo: 'texto', texto } as Envio);
  const agora = new Date().toISOString();
  const { data: atualizado, error } = await db.from('atende_leads').update({ followup_enviado_em: agora, followup_descartado_em: null, atualizado_por: req.sessao!.id }).eq('id', lead.id).select(LEAD_COLUNAS).single();
  if (error || !atualizado) throw error ?? new Error('não marcou o follow-up');
  await registrarEvento(db, c.id, req.sessao!.id, 'followup_enviado', { editado: texto !== (lead.followup_sugestao ?? '').trim() });
  return { mensagem, lead: montarLead(atualizado) };
}

/** Descarta a sugestão: não insiste até o cliente ou a equipe falarem de novo. */
export async function descartarFollowup(req: RequisicaoAtende, conversaId: string): Promise<Lead> {
  const db = req.dbAtende!;
  const c = await exigirConversa(req, conversaId);
  const { data: lead } = await db.from('atende_leads').select(LEAD_COLUNAS).eq('conversa_id', c.id).maybeSingle();
  if (!lead) throw new ErroDeConversa('Esta conversa não tem lead.', 404);
  const { data: atualizado, error } = await db.from('atende_leads').update({ followup_descartado_em: new Date().toISOString(), atualizado_por: req.sessao!.id }).eq('id', lead.id).select(LEAD_COLUNAS).single();
  if (error || !atualizado) throw error ?? new Error('não descartou o follow-up');
  await registrarEvento(db, c.id, req.sessao!.id, 'followup_descartado');
  return montarLead(atualizado);
}

// ---------------------------------------------------------------------------
//  Fundir contatos: dois cadastros da mesma pessoa viram um
// ---------------------------------------------------------------------------

/**
 * Move tudo do contato `de` para o contato `em` (conversas e leads; as
 * mensagens seguem as conversas), guarda o que `em` não tinha (nome,
 * e-mail, observações, foto) e apaga `de`. Serve para o mesmo número com e
 * sem o nono dígito, ou para um cliente que trocou de número. Irreversível
 * — só administrador.
 */
export async function fundirClientes(req: RequisicaoAtende, deId: string, emId: string): Promise<Cliente> {
  const db = req.dbAtende!;
  if (deId === emId) throw new ErroDeConversa('Escolha dois contatos diferentes.');
  const [{ data: de }, { data: em }] = await Promise.all([db.from('atende_clientes').select(CLIENTE_COLUNAS).eq('id', deId).maybeSingle(), db.from('atende_clientes').select(CLIENTE_COLUNAS).eq('id', emId).maybeSingle()]);
  if (!de || !em) throw new ErroDeConversa('Contato não encontrado.', 404);

  // Um contato, um fio: se os dois já têm conversa, a do que sai entra na do que fica
  // (mensagens, eventos, etiquetas e lead — função da migração 043). Só o que sobrar muda de dono.
  const [{ data: fiosDe }, { data: fiosEm }] = await Promise.all([
    db.from('atende_conversas').select('id, ultima_mensagem_em, aberta_em').eq('cliente_id', de.id).order('aberta_em', { ascending: false }),
    db.from('atende_conversas').select('id, ultima_mensagem_em, aberta_em').eq('cliente_id', em.id).order('aberta_em', { ascending: false }),
  ]);
  const alvo = ((fiosEm || []) as Array<{ id: string }>)[0] ?? null;
  if (alvo) {
    for (const fio of (fiosDe || []) as Array<{ id: string }>) {
      const { error: eF } = await supabaseServer.rpc('atende_fundir_conversas', { p_alvo: alvo.id, p_origem: fio.id });
      // Sem a migração 043 ainda, a função não existe: os fios só mudam de dono, como antes.
      if (eF && !/atende_fundir_conversas/.test(eF.message ?? '')) throw eF;
      if (eF) break;
    }
  }
  const { error: e1 } = await db.from('atende_conversas').update({ cliente_id: em.id }).eq('cliente_id', de.id);
  if (e1) throw e1;
  const { error: e2 } = await db.from('atende_leads').update({ cliente_id: em.id }).eq('cliente_id', de.id);
  if (e2) throw e2;

  // O que o contato que fica não tinha, herda do que sai; as datas de contato viram o intervalo dos dois.
  const patch: Record<string, unknown> = {};
  for (const campo of ['nome', 'nome_whatsapp', 'foto_url', 'email', 'observacoes'] as const) if (!em[campo] && de[campo]) patch[campo] = de[campo];
  if (de.primeiro_contato_em < em.primeiro_contato_em) patch.primeiro_contato_em = de.primeiro_contato_em;
  if (de.ultimo_contato_em > em.ultimo_contato_em) patch.ultimo_contato_em = de.ultimo_contato_em;
  if (Object.keys(patch).length) await db.from('atende_clientes').update(patch).eq('id', em.id);

  const { error: e3 } = await db.from('atende_clientes').delete().eq('id', de.id);
  if (e3) throw e3;

  // Fica no histórico das conversas que vieram: quem fundiu, de que número.
  const { data: vindas } = await db.from('atende_conversas').select('id').eq('cliente_id', em.id).limit(50);
  for (const c of (vindas || []) as Array<{ id: string }>) await registrarEvento(db, c.id, req.sessao!.id, 'contato_fundido', { de_telefone: de.telefone, em_telefone: em.telefone });

  const { data: final } = await db.from('atende_clientes').select(CLIENTE_COLUNAS).eq('id', em.id).single();
  return final as Cliente;
}

/** Contatos parecidos com este (mesmo número em outra grafia, mesmo nome): os candidatos a fundir. */
export async function contatosParecidos(req: RequisicaoAtende, clienteId: string): Promise<Cliente[]> {
  const db = req.dbAtende!;
  const { data: c } = await db.from('atende_clientes').select(CLIENTE_COLUNAS).eq('id', clienteId).maybeSingle();
  if (!c) throw new ErroDeConversa('Contato não encontrado.', 404);
  const variantes = variantesDoTelefone(c.telefone).filter((t) => t !== c.telefone);
  const nome = (c.nome ?? c.nome_whatsapp ?? '').trim();
  let q = db.from('atende_clientes').select(CLIENTE_COLUNAS).neq('id', c.id).limit(10);
  if (variantes.length && nome) q = q.or(`telefone.in.(${variantes.join(',')}),nome.ilike.${limparBusca(nome)},nome_whatsapp.ilike.${limparBusca(nome)}`);
  else if (variantes.length) q = q.in('telefone', variantes);
  else if (nome) q = q.or(`nome.ilike.${limparBusca(nome)},nome_whatsapp.ilike.${limparBusca(nome)}`);
  else return [];
  const { data } = await q;
  return (data || []) as Cliente[];
}
