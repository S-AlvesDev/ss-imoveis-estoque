import { supabaseServer } from '../../lib/supabaseServer';
import { notificar } from './push';

/**
 * SLA com escalonamento — o dashboard media o tempo sem resposta; aqui se
 * age sobre ele. Por empresa: depois de `sla_aviso_min` minutos com o
 * cliente esperando, avisa (push) quem atende e quem supervisiona; depois
 * de `sla_escalonar_min`, a conversa vai para a fila geral com prioridade
 * alta, e todos os supervisores e administradores são avisados.
 *
 * "Esperando" = a última mensagem da conversa é do cliente. A espera conta
 * da PRIMEIRA mensagem dele desde a última resposta da equipe (pessoa, IA
 * ou celular). Os carimbos sla_avisada_em / sla_escalonada_em são comparados
 * com o início da espera: uma espera nova avisa de novo, sem zerar nada.
 *
 * Quem chama: o /sync da central (no máximo uma vez por minuto por empresa,
 * enquanto alguém está online) e o cron diário (para o que ficou de um dia
 * para o outro). Na Vercel Pro dá para chamar de minuto em minuto.
 */

const MIN_MS = 60_000;
const ESTADOS_ESPERANDO = ['nova', 'em_triagem', 'na_fila', 'em_atendimento'];

interface EmpresaSla {
  sla_aviso_min: number | null;
  sla_escalonar_min: number | null;
}

interface ConversaEsperando {
  id: string;
  estado: string;
  time_id: string | null;
  atendente_id: number | null;
  prioridade: string;
  ultima_mensagem_do_cliente_em: string | null;
  ultima_mensagem_de: string | null;
  sla_avisada_em: string | null;
  sla_escalonada_em: string | null;
  cliente: { nome: string | null; nome_whatsapp: string | null; telefone: string } | null;
}

export interface ResultadoDoSla {
  avisadas: number;
  escalonadas: number;
}

/** A conta é pura para dar para testar: o que fazer com uma conversa que espera há `esperaMs`. */
export function decidirSla(c: Pick<ConversaEsperando, 'sla_avisada_em' | 'sla_escalonada_em'>, esperaDesde: Date, agora: Date, cfg: EmpresaSla): 'escalonar' | 'avisar' | null {
  const esperaMin = (agora.getTime() - esperaDesde.getTime()) / MIN_MS;
  const jaFez = (carimbo: string | null) => Boolean(carimbo && new Date(carimbo).getTime() >= esperaDesde.getTime());
  if (cfg.sla_escalonar_min && esperaMin >= cfg.sla_escalonar_min && !jaFez(c.sla_escalonada_em)) return 'escalonar';
  if (cfg.sla_aviso_min && esperaMin >= cfg.sla_aviso_min && !jaFez(c.sla_avisada_em)) return 'avisar';
  return null;
}

/** Desde quando o cliente espera: a primeira mensagem dele depois da última resposta da equipe. */
async function inicioDaEspera(conversaId: string, ultimaDoCliente: string | null): Promise<Date | null> {
  const { data: resposta } = await supabaseServer.from('atende_mensagens').select('criado_em').eq('conversa_id', conversaId).eq('direcao', 'saida').order('criado_em', { ascending: false }).limit(1).maybeSingle();
  let q = supabaseServer.from('atende_mensagens').select('criado_em').eq('conversa_id', conversaId).eq('direcao', 'entrada').order('criado_em', { ascending: true }).limit(1);
  if (resposta?.criado_em) q = q.gt('criado_em', resposta.criado_em);
  const { data: primeira } = await q.maybeSingle();
  const inicio = primeira?.criado_em ?? ultimaDoCliente;
  return inicio ? new Date(inicio) : null;
}

/**
 * O dono da conversa já falou com o cliente nela?
 *
 * Escalonar tira a conversa de quem a tem (zera time e atendente) e devolve
 * para a fila geral. Isso faz sentido para quem assumiu e sumiu — mas não
 * para quem já está tocando o atendimento e só demorou nesta resposta.
 * Quando o dono já falou, o SLA cobra por push e deixa a conversa com ele.
 */
async function donoJaFalou(conversaId: string, atendenteId: number | null): Promise<boolean> {
  if (!atendenteId) return false;
  const { count } = await supabaseServer
    .from('atende_mensagens')
    .select('id', { count: 'exact', head: true })
    .eq('conversa_id', conversaId)
    .eq('autor_id', atendenteId)
    .in('autor_tipo', ['atendente', 'supervisor']);
  return (count ?? 0) > 0;
}

async function supervisoresDe(empresaId: string, timeId: string | null): Promise<number[]> {
  const { data: gestores } = await supabaseServer.from('atende_usuarios').select('id, papel').eq('empresa_id', empresaId).eq('ativo', true).in('papel', ['admin', 'supervisor']);
  const admins = ((gestores || []) as any[]).filter((u) => u.papel === 'admin').map((u) => Number(u.id));
  if (!timeId) return [...new Set(((gestores || []) as any[]).map((u) => Number(u.id)))];
  const { data: doTime } = await supabaseServer.from('atende_time_membros').select('usuario_id').eq('time_id', timeId).eq('supervisiona', true);
  return [...new Set([...admins, ...((doTime || []) as any[]).map((m) => Number(m.usuario_id))])];
}

const nomeDo = (c: ConversaEsperando) => c.cliente?.nome ?? c.cliente?.nome_whatsapp ?? (c.cliente ? `+${c.cliente.telefone}` : 'cliente');

/** Confere as conversas de uma empresa e age. Nunca lança: falha vira log. */
export async function vigiarSla(empresaId: string, agora: Date = new Date()): Promise<ResultadoDoSla> {
  const r: ResultadoDoSla = { avisadas: 0, escalonadas: 0 };
  try {
    const { data: emp, error } = await supabaseServer.from('atende_empresas').select('sla_aviso_min, sla_escalonar_min').eq('id', empresaId).maybeSingle();
    if (error) {
      if (/sla_aviso_min/.test(error.message)) return r; // sem a migração 038
      throw error;
    }
    const cfg = (emp as EmpresaSla | null) ?? { sla_aviso_min: null, sla_escalonar_min: null };
    if (!cfg.sla_aviso_min && !cfg.sla_escalonar_min) return r;

    const { data } = await supabaseServer
      .from('atende_conversas')
      .select('id, estado, time_id, atendente_id, prioridade, ultima_mensagem_do_cliente_em, ultima_mensagem_de, sla_avisada_em, sla_escalonada_em, cliente:atende_clientes(nome, nome_whatsapp, telefone)')
      .eq('empresa_id', empresaId)
      .in('estado', ESTADOS_ESPERANDO)
      .eq('ultima_mensagem_de', 'cliente')
      .limit(200);
    for (const c of (data || []) as unknown as ConversaEsperando[]) {
      const desde = await inicioDaEspera(c.id, c.ultima_mensagem_do_cliente_em);
      if (!desde) continue;
      let acao = decidirSla(c, desde, agora, cfg);
      if (!acao) continue;
      // Quem já respondeu nesta conversa não a perde: o estouro vira aviso.
      if (acao === 'escalonar' && (await donoJaFalou(c.id, c.atendente_id === null ? null : Number(c.atendente_id)))) {
        const jaAvisou = Boolean(c.sla_avisada_em && new Date(c.sla_avisada_em).getTime() >= desde.getTime());
        if (jaAvisou) continue;
        acao = 'avisar';
      }
      const minutos = Math.round((agora.getTime() - desde.getTime()) / MIN_MS);
      const carimbo = agora.toISOString();
      if (acao === 'escalonar') {
        await supabaseServer.from('atende_conversas').update({ estado: 'na_fila', time_id: null, atendente_id: null, prioridade: c.prioridade === 'urgente' ? 'urgente' : 'alta', sla_escalonada_em: carimbo, sla_avisada_em: c.sla_avisada_em ?? carimbo }).eq('id', c.id);
        await supabaseServer.from('atende_eventos').insert({ empresa_id: empresaId, conversa_id: c.id, tipo: 'sla_escalonada', dados: { minutos, de_time: c.time_id, de_atendente: c.atendente_id, limite: cfg.sla_escalonar_min } });
        await supabaseServer.from('atende_mensagens').insert({ empresa_id: empresaId, conversa_id: c.id, direcao: 'sistema', autor_tipo: 'sistema', tipo: 'texto', texto: `SLA: ${minutos} min sem resposta — a conversa foi para a fila geral com prioridade alta.`, status: 'entregue' });
        const ids = [...new Set([...(await supervisoresDe(empresaId, null)), ...(c.atendente_id ? [Number(c.atendente_id)] : [])])];
        await notificar(empresaId, ids, { titulo: `SLA estourado: ${nomeDo(c)}`, corpo: `${minutos} min sem resposta. A conversa foi para a fila geral.`, url: `/atende/central/${c.id}`, tag: `sla-${c.id}`, conversaId: c.id });
        r.escalonadas++;
      } else {
        await supabaseServer.from('atende_conversas').update({ sla_avisada_em: carimbo }).eq('id', c.id);
        await supabaseServer.from('atende_eventos').insert({ empresa_id: empresaId, conversa_id: c.id, tipo: 'sla_aviso', dados: { minutos, limite: cfg.sla_aviso_min } });
        const ids = [...new Set([...(await supervisoresDe(empresaId, c.time_id)), ...(c.atendente_id ? [Number(c.atendente_id)] : [])])];
        await notificar(empresaId, ids, { titulo: `${nomeDo(c)} espera há ${minutos} min`, corpo: c.atendente_id ? 'A conversa tem dono e continua sem resposta.' : 'Ninguém assumiu a conversa ainda.', url: `/atende/central/${c.id}`, tag: `sla-${c.id}`, conversaId: c.id });
        r.avisadas++;
      }
    }
  } catch (e: any) {
    console.error('[atende sla]', e.message);
  }
  return r;
}

const ultimaVigilia = new Map<string, number>();

/** Para o /sync: no máximo uma vez por minuto por empresa, sem segurar a resposta. */
export function vigiarSlaSePassouUmMinuto(empresaId: string, agora = Date.now()): void {
  const ultima = ultimaVigilia.get(empresaId) ?? 0;
  if (agora - ultima < MIN_MS) return;
  ultimaVigilia.set(empresaId, agora);
  void vigiarSla(empresaId, new Date(agora));
}

/** Para o cron: todas as empresas. */
export async function vigiarSlaDeTodas(agora: Date = new Date()): Promise<ResultadoDoSla> {
  const total: ResultadoDoSla = { avisadas: 0, escalonadas: 0 };
  const { data } = await supabaseServer.from('atende_empresas').select('id');
  for (const e of (data || []) as Array<{ id: string }>) {
    const r = await vigiarSla(e.id, agora);
    total.avisadas += r.avisadas;
    total.escalonadas += r.escalonadas;
  }
  return total;
}
