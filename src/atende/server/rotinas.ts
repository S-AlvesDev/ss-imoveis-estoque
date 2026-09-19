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
