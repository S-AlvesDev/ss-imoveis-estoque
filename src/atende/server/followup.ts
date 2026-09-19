import { supabaseServer } from '../../lib/supabaseServer';
import { conversar, claudeConfigurado, type MensagemDoChat } from '../../server/claude';
import { notificar, destinatariosDaConversa } from './push';
import { NOME_DO_ESTADO_DO_LEAD, type EstadoDoLead } from '../shared/tipos';

/**
 * Follow-up do lead — onde o dinheiro vaza: a equipe respondeu, o cliente
 * sumiu. Depois de `SILENCIO_H` horas sem resposta do cliente, a IA escreve
 * UMA sugestão de retomada, curta e no assunto da conversa, e guarda no
 * lead. Quem atende vê, edita se quiser, e envia — ou descarta. Nada sai
 * sem uma pessoa apertar o botão.
 *
 * Quem chama: o cron diário e o /sync (uma vez por hora por empresa).
 */

export const SILENCIO_H = 24;
const H_MS = 3600_000;
const ESTADOS_ABERTOS: EstadoDoLead[] = ['novo', 'em_atendimento', 'em_negociacao', 'aguardando_cliente'];

interface LeadParaRetomar {
  id: string;
  conversa_id: string;
  estado: EstadoDoLead;
  followup_sugestao: string | null;
  followup_sugerido_em: string | null;
  followup_enviado_em: string | null;
  followup_descartado_em: string | null;
  conversa: {
    id: string;
    estado: string;
    atendente_id: number | null;
    time_id: string | null;
    assunto: string | null;
    resumo: string | null;
    ultima_mensagem_em: string;
    ultima_mensagem_de: string | null;
    cliente: { nome: string | null; nome_whatsapp: string | null } | null;
  } | null;
}

interface EmpresaParaRetomar {
  nome: string;
  segmento: string | null;
  descricao: string | null;
  produtos_servicos: string | null;
  regras_atendimento: string | null;
}

/** Pura: este lead merece uma sugestão agora? */
export function precisaDeFollowup(l: LeadParaRetomar, agora: Date): boolean {
  const c = l.conversa;
  if (!c || c.estado === 'encerrada') return false;
  if (!ESTADOS_ABERTOS.includes(l.estado)) return false;
  // A última palavra tem que ser nossa (pessoa, IA ou celular) — cliente esperando é caso do SLA, não daqui.
  if (!c.ultima_mensagem_de || c.ultima_mensagem_de === 'cliente') return false;
  const silencio = agora.getTime() - new Date(c.ultima_mensagem_em).getTime();
  if (silencio < SILENCIO_H * H_MS) return false;
  // Já existe sugestão viva, ou uma decisão (enviada/descartada) depois da última mensagem: não insiste.
  const ultima = new Date(c.ultima_mensagem_em).getTime();
  const depoisDaUltima = (t: string | null) => Boolean(t && new Date(t).getTime() >= ultima);
  if (l.followup_sugestao && depoisDaUltima(l.followup_sugerido_em)) return false;
  if (depoisDaUltima(l.followup_enviado_em) || depoisDaUltima(l.followup_descartado_em)) return false;
  return true;
}

const primeiroNome = (nome: string | null | undefined) => (nome ? nome.trim().split(/\s+/)[0] : null);

/** Sem IA configurada: uma retomada simples, honesta, no assunto. */
export function sugestaoPadrao(cliente: string | null, assunto: string | null): string {
  const oi = cliente ? `Oi, ${cliente}!` : 'Oi!';
  return assunto ? `${oi} Passando para saber se posso ajudar com ${assunto.toLowerCase()}. Ficou alguma dúvida?` : `${oi} Passando para saber se ficou alguma dúvida. Posso ajudar em algo?`;
}

/** A IA escreve a retomada a partir do contexto da conversa. Cai no padrão se a IA falhar. */
export async function escreverSugestao(empresa: EmpresaParaRetomar, l: LeadParaRetomar, mensagens: Array<{ direcao: string; texto: string | null; tipo: string }>): Promise<{ texto: string; modelo: string | null }> {
  const c = l.conversa!;
  const cliente = primeiroNome(c.cliente?.nome ?? c.cliente?.nome_whatsapp);
  if (!claudeConfigurado()) return { texto: sugestaoPadrao(cliente, c.assunto), modelo: null };
  const historico: MensagemDoChat[] = [
    {
      role: 'user',
      content:
        `Você escreve mensagens de WhatsApp para a equipe de atendimento da empresa "${empresa.nome}"${empresa.segmento ? ` (${empresa.segmento})` : ''}.\n` +
        (empresa.descricao ? `Sobre a empresa: ${empresa.descricao}\n` : '') +
        (empresa.produtos_servicos ? `Produtos e serviços: ${empresa.produtos_servicos}\n` : '') +
        (empresa.regras_atendimento ? `Regras de atendimento: ${empresa.regras_atendimento}\n` : '') +
        `\nO cliente${cliente ? ` ${cliente}` : ''} conversou com a equipe e está há mais de ${SILENCIO_H} horas sem responder. Estágio no funil: ${NOME_DO_ESTADO_DO_LEAD[l.estado]}.` +
        (c.assunto ? ` Assunto: ${c.assunto}.` : '') +
        (c.resumo ? ` Resumo da triagem: ${c.resumo}` : '') +
        `\n\nÚltimas mensagens (mais antigas primeiro):\n` +
        mensagens.map((m) => `${m.direcao === 'entrada' ? 'Cliente' : m.direcao === 'saida' ? 'Equipe' : 'Sistema'}: ${m.texto?.trim() || `[${m.tipo}]`}`).join('\n') +
        `\n\nEscreva UMA mensagem curta de retomada (até 280 caracteres) que a equipe vai mandar ao cliente pelo WhatsApp, em português do Brasil, no tom da conversa: gentil, direta, no assunto, sem prometer preço ou prazo que não apareceu na conversa, sem emoji em excesso, terminando com uma pergunta simples. Responda só com o texto da mensagem, sem aspas nem explicações.`,
    },
  ];
  try {
    const r = await conversar({ system: 'Você é um redator de mensagens de atendimento. Responde só com a mensagem pedida.', historico, tools: [], executar: async () => '', maxTokens: 200, maxRodadas: 1 });
    const texto = r.texto.trim().replace(/^["“”']+|["“”']+$/g, '').slice(0, 400);
    if (!texto) throw new Error('resposta vazia');
    return { texto, modelo: r.uso.modelo };
  } catch (e: any) {
    console.warn('[atende followup] IA falhou, usando o padrão:', e.message);
    return { texto: sugestaoPadrao(cliente, c.assunto), modelo: null };
  }
}

/** Gera as sugestões pendentes de uma empresa e avisa quem atende. Nunca lança. */
export async function gerarFollowups(empresaId: string, agora: Date = new Date()): Promise<{ sugeridos: number }> {
  const r = { sugeridos: 0 };
  try {
    const { data: emp, error: e0 } = await supabaseServer.from('atende_empresas').select('nome, segmento, descricao, produtos_servicos, regras_atendimento').eq('id', empresaId).maybeSingle();
    if (e0 || !emp) return r;
    const { data, error } = await supabaseServer
      .from('atende_leads')
      .select('id, conversa_id, estado, followup_sugestao, followup_sugerido_em, followup_enviado_em, followup_descartado_em, conversa:atende_conversas(id, estado, atendente_id, time_id, assunto, resumo, ultima_mensagem_em, ultima_mensagem_de, cliente:atende_clientes(nome, nome_whatsapp))')
      .eq('empresa_id', empresaId)
      .in('estado', ESTADOS_ABERTOS)
      .limit(200);
    if (error) {
      if (/followup_/.test(error.message)) return r; // sem a migração 038
      throw error;
    }
    for (const l of (data || []) as unknown as LeadParaRetomar[]) {
      if (!precisaDeFollowup(l, agora)) continue;
      const { data: msgs } = await supabaseServer.from('atende_mensagens').select('direcao, texto, tipo').eq('conversa_id', l.conversa_id).neq('direcao', 'sistema').order('criado_em', { ascending: false }).limit(8);
      const { texto, modelo } = await escreverSugestao(emp as EmpresaParaRetomar, l, ((msgs || []) as any[]).reverse());
      const carimbo = agora.toISOString();
      await supabaseServer.from('atende_leads').update({ followup_sugestao: texto, followup_sugerido_em: carimbo, followup_enviado_em: null, followup_descartado_em: null }).eq('id', l.id);
      await supabaseServer.from('atende_eventos').insert({ empresa_id: empresaId, conversa_id: l.conversa_id, tipo: 'followup_sugerido', dados: { modelo, horas: SILENCIO_H } });
      const c = l.conversa!;
      const nome = c.cliente?.nome ?? c.cliente?.nome_whatsapp ?? 'o cliente';
      const ids = await destinatariosDaConversa(empresaId, { atendente_id: c.atendente_id === null ? null : Number(c.atendente_id), time_id: c.time_id });
      await notificar(empresaId, ids, { titulo: `Retomar contato com ${nome}?`, corpo: `Sem resposta há ${SILENCIO_H} h. A IA sugeriu uma mensagem — você aprova antes de enviar.`, url: `/atende/central/${c.id}`, tag: `followup-${c.id}`, conversaId: c.id });
      r.sugeridos++;
    }
  } catch (e: any) {
    console.error('[atende followup]', e.message);
  }
  return r;
}

const ultimaRodada = new Map<string, number>();

/** Para o /sync: no máximo uma vez por hora por empresa, sem segurar a resposta. */
export function gerarFollowupsSePassouUmaHora(empresaId: string, agora = Date.now()): void {
  const ultima = ultimaRodada.get(empresaId) ?? 0;
  if (agora - ultima < H_MS) return;
  ultimaRodada.set(empresaId, agora);
  void gerarFollowups(empresaId, new Date(agora));
}

/** Para o cron: todas as empresas. */
export async function gerarFollowupsDeTodas(agora: Date = new Date()): Promise<{ sugeridos: number }> {
  let sugeridos = 0;
  const { data } = await supabaseServer.from('atende_empresas').select('id');
  for (const e of (data || []) as Array<{ id: string }>) sugeridos += (await gerarFollowups(e.id, agora)).sugeridos;
  return { sugeridos };
}
