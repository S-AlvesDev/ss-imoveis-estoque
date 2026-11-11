import { supabaseServer } from '../../lib/supabaseServer';
import { getTransporter } from '../../server/mail';
import { escapeHtml, p, tabela } from '../../server/email-layout';
import { siteUrl } from '../../server/senha';
import { evolutionConfigurada } from '../../server/evolution';
import { layoutAtende, remetenteAtende } from './email';
import { montarDashboard } from './dashboard';
import { situacaoDaConexao } from './whatsapp';
import { dbDaEmpresa } from './tenant';
import { NOME_DO_ESTADO_DO_LEAD } from '../shared/tipos';
import { horasUteisEntre, limiteDeSilencio, DIA_MS, MENSAGENS_QUE_FALTARAM, SILENCIO_MINIMO_H } from '../shared/silencio';
import type { Dashboard, EstadoDoLead } from '../shared/tipos';
import type { RequisicaoAtende } from './auth';
import { ATENDE, atendeUrl } from '../shared/produto';

/**
 * As rotinas diárias do Atende Aí — as mesmas que o Stok Aí tem, com os
 * dados do Atende: o resumo da semana por e-mail (segunda-feira) e o
 * aviso de WhatsApp caído. Chamadas pelo cron em /api/atende/cron.
 */

interface EmpresaBasica {
  id: string;
  nome: string;
}

async function empresasComAdmins(): Promise<Array<EmpresaBasica & { emails: string[] }>> {
  const [{ data: empresas }, { data: admins }] = await Promise.all([supabaseServer.from('atende_empresas').select('id, nome'), supabaseServer.from('atende_usuarios').select('empresa_id, email').eq('papel', 'admin').eq('ativo', true)]);
  return ((empresas || []) as EmpresaBasica[]).map((e) => ({ ...e, emails: ((admins || []) as any[]).filter((a) => a.empresa_id === e.id).map((a) => String(a.email || '')).filter(Boolean) }));
}

/** Um `req` de servidor para reaproveitar o dashboard (que lê pela sessão): visão de administrador. */
function requisicaoDeServidor(empresaId: string): RequisicaoAtende {
  return { sessao: { id: 0, nome: 'cron', email: '', papel: 'admin', empresa_id: empresaId }, dbAtende: dbDaEmpresa(empresaId) } as RequisicaoAtende;
}

function duracao(s: number | null): string {
  if (s === null) return '—';
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

export function emailDoResumoSemanal(empresa: string, d: Dashboard, nomes: Record<number, string> = {}): { subject: string; html: string } {
  const a = d.atendimentos;
  const funil = (Object.entries(d.leads.funil) as Array<[EstadoDoLead, number]>).filter(([, n]) => n > 0).map(([k, n]) => `${NOME_DO_ESTADO_DO_LEAD[k]}: ${n}`).join(' · ');
  const porPessoa = d.por_pessoa.slice(0, 5).map((x) => [escapeHtml(nomes[x.usuario_id] ?? `#${x.usuario_id}`), `${x.conversas} conversa(s), 1ª resposta ${duracao(x.primeira_resposta_mediana_s)}`] as [string, string]);
  return {
    subject: `${ATENDE.nome}: a semana da ${empresa} (${fmtData.format(new Date(d.periodo.de))} a ${fmtData.format(new Date(d.periodo.ate))})`,
    html: layoutAtende({
      titulo: `A semana da ${escapeHtml(empresa)} no atendimento.`,
      corpo:
        tabela([
          ['Conversas abertas', String(a.abertas_no_periodo)],
          ['Encerradas', String(a.encerradas_no_periodo)],
          ['Sem resposta humana', String(a.sem_resposta_humana)],
          ['1ª resposta (mediana)', duracao(a.primeira_resposta_mediana_s)],
          ['Resolução (mediana)', duracao(a.resolucao_mediana_s)],
          ['Mensagens', `${a.mensagens_do_cliente} do cliente · ${a.mensagens_da_equipe} da equipe · ${a.mensagens_da_ia} da IA`],
          ['Leads', `${d.leads.total} no período${funil ? ` (${funil})` : ''}`],
          ['Conversão', d.leads.taxa_de_conversao === null ? 'sem decisões ainda' : `${Math.round(d.leads.taxa_de_conversao * 100)}%`],
        ]) +
        (porPessoa.length ? p('<strong>Por pessoa</strong>') + tabela(porPessoa) : '') +
        p('Os números vêm do dashboard do Atende Aí, do período de 7 dias até hoje.'),
      botao: { texto: 'Abrir o dashboard', href: `${atendeUrl(siteUrl())}/dashboard` },
    }),
  };
}

/** Às segundas: um e-mail por empresa que teve conversa na semana, para os administradores. */
export async function resumosSemanaisDoAtende(agora: Date = new Date()): Promise<{ empresas: number; enviados: number }> {
  const t = await getTransporter();
  if (!t) return { empresas: 0, enviados: 0 };
  let empresas = 0;
  let enviados = 0;
  for (const e of await empresasComAdmins()) {
    if (!e.emails.length) continue;
    try {
      const d = await montarDashboard(requisicaoDeServidor(e.id), '7d', agora);
      if (d.atendimentos.abertas_no_periodo === 0 && d.atendimentos.encerradas_no_periodo === 0) continue;
      empresas++;
      const { data: pessoas } = await supabaseServer.from('atende_usuarios').select('id, nome').eq('empresa_id', e.id);
      const nomes = Object.fromEntries(((pessoas || []) as any[]).map((u) => [Number(u.id), String(u.nome)]));
      const { subject, html } = emailDoResumoSemanal(e.nome, d, nomes);
      await t.sendMail({ from: remetenteAtende(), to: e.emails.join(', '), subject, html });
      enviados++;
    } catch (err: any) {
      console.error(`[atende resumo semanal] ${e.nome}:`, err.message);
    }
  }
  return { empresas, enviados };
}

/**
 * O WhatsApp de cada empresa está de pé? Pergunta à Evolution (grava o estado
 * de volta, como a tela faz) e, caído, avisa os administradores uma vez por
 * queda. Quando volta, o aviso é zerado para a próxima.
 */
export async function vigiarConexoesDoAtende(): Promise<Array<{ empresa: string; estado: string }>> {
  if (!evolutionConfigurada()) return [];
  const t = await getTransporter();
  const caidas: Array<{ empresa: string; estado: string }> = [];
  const { data: conexoes, error } = await supabaseServer.from('atende_conexoes').select('id, empresa_id, estado, conectado_em, aviso_queda_em').not('conectado_em', 'is', null);
  if (error) {
    if (/aviso_queda_em/.test(error.message)) return [];
    throw error;
  }
  const empresas = await empresasComAdmins();
  for (const c of (conexoes || []) as Array<{ id: string; empresa_id: string; estado: string; aviso_queda_em: string | null }>) {
    const empresa = empresas.find((e) => e.id === c.empresa_id);
    if (!empresa) continue;
    let estado: string;
    try {
      estado = (await situacaoDaConexao(c.empresa_id)).conexao?.estado ?? 'desconectada';
    } catch {
      estado = 'desconectada';
    }
    if (estado === 'conectada') {
      if (c.aviso_queda_em) await supabaseServer.from('atende_conexoes').update({ aviso_queda_em: null }).eq('id', c.id);
      continue;
    }
    caidas.push({ empresa: empresa.nome, estado });
    if (c.aviso_queda_em || !t || !empresa.emails.length) continue;
    try {
      await t.sendMail({
        from: remetenteAtende(),
        to: empresa.emails.join(', '),
        subject: `${ATENDE.nome}: o WhatsApp da ${empresa.nome} está desconectado`,
        html: layoutAtende({
          titulo: 'O WhatsApp da empresa caiu.',
          corpo: p(`A conexão do WhatsApp da <strong>${escapeHtml(empresa.nome)}</strong> com o ${escapeHtml(ATENDE.nome)} está <strong>${escapeHtml(estado)}</strong>. Enquanto isso, as mensagens dos clientes não chegam à central.`) + p('Abra o Atende Aí em WhatsApp e leia o QR de novo com o celular da empresa.'),
          botao: { texto: 'Reconectar o WhatsApp', href: `${atendeUrl(siteUrl())}/whatsapp` },
        }),
      });
      await supabaseServer.from('atende_conexoes').update({ aviso_queda_em: new Date().toISOString() }).eq('id', c.id);
    } catch (err: any) {
      console.error(`[atende vigiar] ${empresa.nome}:`, err.message);
    }
  }
  return caidas;
}

// ---------------------------------------------------------------------------
//  O vigia do silêncio
//
//  O vigia de cima pergunta "a conexão está de pé?". Serve para a queda
//  honesta — o aparelho desligou, o QR venceu, a sessão caiu e avisou.
//
//  Não serve para a pior das falhas, que foi a que aconteceu: a sessão
//  continua dizendo "conectada", a Evolution continua respondendo, e
//  simplesmente nada mais chega. Para esse caso o estado mente, e o único
//  sinal honesto é o silêncio — uma instância que recebia e parou de
//  receber está quebrada, jure ela o que jurar.
//
//  Duas dificuldades, e o que se faz com cada uma:
//
//  1. Silêncio normal existe. Ninguém escreve para a imobiliária às 3h da
//     manhã, nem no domingo. Por isso não se conta o relógio, contam-se as
//     HORAS ÚTEIS — e de madrugada o contador simplesmente não anda.
//
//  2. Empresa movimentada e empresa parada têm silêncios normais muito
//     diferentes. Três horas caladas numa que recebe de dez em dez minutos
//     é uma emergência; na que recebe duas mensagens por semana é terça-
//     feira. Então o limite não é fixo: sai do próprio movimento de cada
//     uma, medido nas duas semanas anteriores ao silêncio.
// ---------------------------------------------------------------------------

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function horas(h: number): string {
  return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1).replace('.', ',')} h`;
}

export function emailDoSilencio(empresa: string, args: { desde: Date; horasUteis: number; limite: number; estado: string }): { subject: string; html: string } {
  const deAcordo = args.estado === 'conectada';
  return {
    subject: `${ATENDE.nome}: o WhatsApp da ${empresa} parou de receber mensagens`,
    html: layoutAtende({
      titulo: 'O WhatsApp parou de receber.',
      corpo:
        p(`Nada chega pelo WhatsApp da <strong>${escapeHtml(empresa)}</strong> desde <strong>${fmtDataHora.format(args.desde)}</strong> — ${escapeHtml(horas(args.horasUteis))} de expediente em silêncio, quando o normal para vocês é algo chegar a cada ${escapeHtml(horas(args.limite / MENSAGENS_QUE_FALTARAM))}.`) +
        tabela([
          ['Última coisa que chegou', fmtDataHora.format(args.desde)],
          ['Silêncio (horário comercial)', horas(args.horasUteis)],
          ['A conexão diz estar', args.estado],
        ]) +
        (deAcordo
          ? p('A conexão <strong>diz que está de pé</strong>, e é justamente esse o problema: a ligação com o aparelho caiu sem avisar. Quem escreve para vocês vê a mensagem sair normalmente, mas ela não chega à central.')
          : p('A conexão também já não se diz conectada, então as mensagens dos clientes não estão chegando à central.')) +
        p('<strong>O que fazer:</strong> no Atende Aí, abra <strong>WhatsApp</strong> → <strong>Desconectar</strong> e depois <strong>Conectar</strong>, lendo o QR com o celular da empresa. É o único caminho que resolve este caso: <strong>"Reiniciar sessão" não basta</strong> — a conexão volta a dizer que está de pé e continua sem entregar. Leva dois minutos, e o histórico não se perde.'),
      botao: { texto: 'Abrir o diagnóstico', href: `${atendeUrl(siteUrl())}/whatsapp` },
    }),
  };
}

interface ConexaoCalada {
  id: string;
  empresa_id: string;
  ultimo_evento_em: string;
  aviso_silencio_em: string | null;
}

/** Quantas mensagens de cliente entraram nas duas semanas ANTES do silêncio começar. */
async function entradasAntesDoSilencio(empresaId: string, ate: Date): Promise<number> {
  const de = new Date(ate.getTime() - 14 * DIA_MS);
  const { count } = await supabaseServer
    .from('atende_mensagens')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('direcao', 'entrada')
    .gte('criado_em', de.toISOString())
    .lt('criado_em', ate.toISOString());
  return count ?? 0;
}

/**
 * Guarda o limite na conexão, para a tela poder avisar sem consultar nada.
 * Coluna nova (migração 058): se não existir ainda, segue em silêncio.
 */
async function guardarLimite(conexaoId: string, limite: number): Promise<void> {
  const valor = Number.isFinite(limite) ? Number(limite.toFixed(2)) : null;
  const { error } = await supabaseServer.from('atende_conexoes').update({ limite_silencio_h: valor }).eq('id', conexaoId);
  if (error && !/limite_silencio_h/.test(error.message)) console.warn('[atende silêncio] guardar limite:', error.message);
}

/**
 * Recalcula o limite de todas as conexões, uma vez por dia.
 *
 * É uma contagem por empresa — barato de madrugada, caro se a tela tivesse
 * de fazer a cada sincronização. Por isso fica guardado.
 */
export async function atualizarLimitesDeSilencio(agora: Date = new Date()): Promise<number> {
  const { data } = await supabaseServer.from('atende_conexoes').select('id, empresa_id').not('conectado_em', 'is', null);
  let feitos = 0;
  for (const c of (data || []) as Array<{ id: string; empresa_id: string }>) {
    try {
      await guardarLimite(c.id, limiteDeSilencio(await entradasAntesDoSilencio(c.empresa_id, agora)));
      feitos++;
    } catch (err: any) {
      console.warn('[atende silêncio] limite:', err.message);
    }
  }
  return feitos;
}

/**
 * Procura instâncias que pararam de receber e avisa os administradores —
 * uma vez por episódio. O aviso se apaga sozinho quando qualquer evento
 * volta a chegar (ver `ouvimosAEvolution`, no webhook).
 */
export async function vigiarSilenciosDoAtende(agora: Date = new Date()): Promise<Array<{ empresa: string; horas: number; estado: string }>> {
  if (!evolutionConfigurada()) return [];
  const caladas: Array<{ empresa: string; horas: number; estado: string }> = [];

  const { data, error } = await supabaseServer
    .from('atende_conexoes')
    .select('id, empresa_id, ultimo_evento_em, aviso_silencio_em')
    .not('conectado_em', 'is', null)
    .not('ultimo_evento_em', 'is', null)
    .is('aviso_silencio_em', null)
    .lt('ultimo_evento_em', new Date(agora.getTime() - SILENCIO_MINIMO_H * 3600_000).toISOString());
  if (error) {
    // Migração 057 ainda não aplicada: o vigia fica quieto em vez de quebrar o cron.
    if (/aviso_silencio_em/.test(error.message)) return [];
    throw error;
  }
  const candidatas = ((data || []) as ConexaoCalada[]).map((c) => ({ c, horasUteis: horasUteisEntre(new Date(c.ultimo_evento_em), agora) })).filter((x) => x.horasUteis >= SILENCIO_MINIMO_H);
  if (!candidatas.length) return [];

  const t = await getTransporter();
  const empresas = await empresasComAdmins();
  for (const { c, horasUteis } of candidatas) {
    const empresa = empresas.find((e) => e.id === c.empresa_id);
    if (!empresa) continue;
    try {
      const desde = new Date(c.ultimo_evento_em);
      const limite = limiteDeSilencio(await entradasAntesDoSilencio(c.empresa_id, desde));
      await guardarLimite(c.id, limite);
      if (horasUteis < limite) continue;

      // Só agora se pergunta à Evolution — para contar no e-mail o que ela acha
      // que está acontecendo, que é metade do diagnóstico.
      let estado = 'não respondeu';
      try {
        estado = (await situacaoDaConexao(c.empresa_id)).conexao?.estado ?? 'desconectada';
      } catch {
        /* a Evolution não respondeu; o e-mail sai assim mesmo */
      }

      caladas.push({ empresa: empresa.nome, horas: horasUteis, estado });
      console.warn(`[atende silêncio] ${empresa.nome}: nada desde ${c.ultimo_evento_em} (${horasUteis.toFixed(1)}h úteis, limite ${limite.toFixed(1)}h, conexão "${estado}").`);
      if (!t || !empresa.emails.length) continue;

      const { subject, html } = emailDoSilencio(empresa.nome, { desde, horasUteis, limite, estado });
      await t.sendMail({ from: remetenteAtende(), to: empresa.emails.join(', '), subject, html });
      // Marca depois de enviar: falhou o e-mail, a próxima varredura tenta de novo.
      await supabaseServer.from('atende_conexoes').update({ aviso_silencio_em: new Date().toISOString() }).eq('id', c.id);
    } catch (err: any) {
      console.error(`[atende silêncio] ${empresa.nome}:`, err.message);
    }
  }
  return caladas;
}

/**
 * De onde o vigia é chamado no dia a dia: o cron roda uma vez por dia, e
 * esperar até amanhã para descobrir que hoje ninguém foi atendido não serve.
 * Então a varredura pega carona em dois movimentos que acontecem o tempo
 * todo — o webhook de qualquer empresa e o sync de quem está com o painel
 * aberto — com um teto de uma varredura a cada dez minutos.
 *
 * Carona é de propósito: a empresa calada, por definição, não gera tráfego
 * próprio. Quem a encontra é o movimento das outras.
 */
const VARREDURA_MS = 10 * 60 * 1000;
let ultimaVarredura = 0;

export function vigiarSilencioSePassouDezMinutos(agora = Date.now()): void {
  if (agora - ultimaVarredura < VARREDURA_MS) return;
  ultimaVarredura = agora;
  void vigiarSilenciosDoAtende(new Date(agora)).catch((err: any) => console.error('[atende silêncio]', err.message));
}
