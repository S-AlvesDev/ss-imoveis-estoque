/**
 * O que roda sozinho, uma vez por dia (o cron da Vercel chama
 * /api/cron/lembretes). Três rotinas, todas silenciosas quando não há o
 * que dizer:
 *
 *  - vigiar o WhatsApp: a instância caiu? avisa o operador do Stok Aí;
 *  - avisos do dia: material abaixo do mínimo e empréstimo atrasado, no
 *    WhatsApp dos administradores (plano com o assistente);
 *  - resumo da semana: às segundas, por e-mail, para quem tem o recurso.
 */

import { supabaseServer } from '../lib/supabaseServer';
import { scopedDb } from './tenant';
import { depositosDaOrg, saldosDaOrg, arredondar } from './estoque';
import { evolutionConfigurada, estadoDaInstancia, enviarTexto } from './evolution';
import { getTransporter, remetente, destinatarioAdmin } from './mail';
import { escapeHtml, layoutEmail, p } from './email-layout';
import { siteUrl } from './senha';
import { contaDaOrg } from './planos';
import { planoLibera } from '../shared/planos';
import { stockStatus } from '../features/estoque/utils';

const DIA_MS = 24 * 60 * 60 * 1000;
const valido = (e: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim().toLowerCase());

/** E-mails de quem responde pela conta: o CEO; sem e-mail nele, os administradores. */
export async function emailsDosAdministradores(organizationId: string): Promise<string[]> {
  const { data } = await supabaseServer.from('estoque_users').select('email, role').eq('organization_id', organizationId).in('role', ['CEO', 'ADMINISTRADOR', 'ADMINISTRATIVO']).eq('ativo', true);
  const pessoas = (data || []) as Array<{ email: string | null; role: string }>;
  const doCeo = pessoas.filter((x) => x.role === 'CEO' && valido(x.email)).map((x) => String(x.email).trim().toLowerCase());
  if (doCeo.length) return doCeo;
  return pessoas.filter((x) => valido(x.email)).map((x) => String(x.email).trim().toLowerCase());
}

/** WhatsApps dos administradores (todos os que têm número — aviso é para quem opera). */
export async function whatsappsDosAdministradores(organizationId: string): Promise<string[]> {
  const { data } = await supabaseServer.from('estoque_users').select('whatsapp').eq('organization_id', organizationId).in('role', ['CEO', 'ADMINISTRADOR', 'ADMINISTRATIVO']).eq('ativo', true).not('whatsapp', 'is', null);
  return ((data || []) as Array<{ whatsapp: string }>).map((x) => x.whatsapp);
}

// ---------------------------------------------------------------------------
//  As pendências de uma organização (o mesmo olhar da tela e do assistente)
// ---------------------------------------------------------------------------

export interface Pendencias {
  faltando: Array<{ nome: string; saldo: number; minimo: number; unidade: string; semEstoque: boolean }>;
  atrasados: Array<{ tomador: string; material: string; quantidade: number; venceuEm: string }>;
  vencendo: Array<{ material: string; lote: string; validade: string; quantidade: number; estoque: string }>;
}

export async function pendenciasDaOrg(organizationId: string, agora: Date = new Date()): Promise<Pendencias> {
  const db = scopedDb(organizationId);
  const [depositos, saldos, { data: materiais }, { data: emprestimos }, { data: lotes }] = await Promise.all([
    depositosDaOrg(db),
    saldosDaOrg(db),
    db.from('materials').select('id, nome, unidade_medida, estoque_minimo').order('nome'),
    db.from('loans').select('tomador_nome, prazo_em, quantidade, quantidade_devolvida, materials(nome)').eq('tipo', 'emprestimo').is('devolvido_em', null).is('encerrado_em', null),
    db.from('lots').select('lote, validade, quantidade, warehouses(nome), materials(nome)').gt('quantidade', 0).not('validade', 'is', null).lte('validade', new Date(agora.getTime() + 30 * DIA_MS).toISOString().slice(0, 10)).order('validade'),
  ]);
  const ativos = new Set(depositos.filter((d) => d.ativo).map((d) => d.id));

  const faltando: Pendencias['faltando'] = [];
  for (const m of (materiais || []) as any[]) {
    const s = saldos.get(m.id) ?? {};
    const saldos_unidade = Object.fromEntries(Object.entries(s).filter(([id]) => ativos.has(id)));
    const saldo = Object.values(saldos_unidade).reduce((a, v) => a + Number(v), 0);
    const status = stockStatus({ saldo_unidade: saldo, saldos_unidade, estoque_minimo: Number(m.estoque_minimo) }, 'empresa');
    if (status === 'RUPTURA' || status === 'ABAIXO') faltando.push({ nome: m.nome, saldo: arredondar(saldo), minimo: Number(m.estoque_minimo), unidade: m.unidade_medida, semEstoque: status === 'RUPTURA' });
  }
  const atrasados: Pendencias['atrasados'] = ((emprestimos || []) as any[])
    .filter((e) => e.prazo_em && new Date(e.prazo_em).getTime() < agora.getTime())
    .map((e) => ({ tomador: e.tomador_nome, material: e.materials?.nome ?? '', quantidade: arredondar(Number(e.quantidade) - Number(e.quantidade_devolvida)), venceuEm: e.prazo_em }));
  const vencendo: Pendencias['vencendo'] = ((lotes || []) as any[]).map((l) => ({ material: l.materials?.nome ?? '', lote: l.lote, validade: l.validade, quantidade: Number(l.quantidade), estoque: l.warehouses?.nome ?? '' }));
  return { faltando, atrasados, vencendo };
}

const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
function data(iso: string): string {
  return fmtData.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
}

/** O texto do aviso do dia, para WhatsApp. Nulo = nada a dizer. */
export function textoDoAvisoDiario(empresa: string, pend: Pendencias): string | null {
  if (!pend.faltando.length && !pend.atrasados.length && !pend.vencendo.length) return null;
  const partes = [`☀️ Bom dia! Pendências de hoje na ${empresa}:`];
  if (pend.faltando.length) {
    partes.push('', `📦 Abaixo do mínimo (${pend.faltando.length}):`);
    for (const f of pend.faltando.slice(0, 10)) partes.push(`• ${f.nome}: ${f.saldo} ${f.unidade} (mín. ${f.minimo})${f.semEstoque ? ' — SEM ESTOQUE' : ''}`);
    if (pend.faltando.length > 10) partes.push(`• …e mais ${pend.faltando.length - 10}`);
  }
  if (pend.atrasados.length) {
    partes.push('', `⏰ Empréstimos atrasados (${pend.atrasados.length}):`);
    for (const a of pend.atrasados.slice(0, 10)) partes.push(`• ${a.tomador} — ${a.quantidade} de ${a.material} (venceu ${data(a.venceuEm)})`);
  }
  if (pend.vencendo.length) {
    partes.push('', `🗓️ Vencendo em 30 dias (${pend.vencendo.length}):`);
    for (const v of pend.vencendo.slice(0, 10)) partes.push(`• ${v.material} lote ${v.lote}: ${v.quantidade} em ${v.estoque}, vence ${data(v.validade)}`);
  }
  partes.push('', 'Pergunte "o que está faltando?" por aqui, ou veja em Alertas no painel.');
  return partes.join('\n');
}

/**
 * Manda o aviso do dia a cada organização com o assistente no plano e
 * administradores com WhatsApp. Devolve quantas mensagens saíram.
 */
export async function avisosDoDiaPorWhatsapp(agora: Date = new Date()): Promise<{ organizacoes: number; mensagens: number }> {
  if (!evolutionConfigurada()) return { organizacoes: 0, mensagens: 0 };
  const { data: orgs } = await supabaseServer.from('organizations').select('id, nome, whatsapp_instancia, ativo').eq('ativo', true);
  let organizacoes = 0;
  let mensagens = 0;
  for (const o of (orgs || []) as any[]) {
    try {
      const conta = await contaDaOrg(o.id);
      if (conta.situacao === 'bloqueada' || !planoLibera(conta.plano, 'whatsapp')) continue;
      const numeros = await whatsappsDosAdministradores(o.id);
      if (!numeros.length) continue;
      const texto = textoDoAvisoDiario(o.nome, await pendenciasDaOrg(o.id, agora));
      if (!texto) continue;
      organizacoes++;
      for (const n of numeros) {
        try {
          await enviarTexto(n, texto, o.whatsapp_instancia ?? null);
          mensagens++;
        } catch (e: any) {
          console.error(`[avisos] ${o.nome} → ${n}:`, e.message);
        }
      }
    } catch (e: any) {
      console.error(`[avisos] ${o.nome}:`, e.message);
    }
  }
  return { organizacoes, mensagens };
}

// ---------------------------------------------------------------------------
//  Resumo da semana, por e-mail
// ---------------------------------------------------------------------------

export interface ResumoSemanal {
  de: string;
  ate: string;
  movimentos: number;
  porTipo: Record<string, number>;
  maisConsumidos: Array<{ nome: string; quantidade: number; unidade: string }>;
  pendencias: Pendencias;
}

const NOME_DO_TIPO: Record<string, string> = {
  ENTRADA: 'Entradas',
  SAIDA: 'Saídas',
  CONSUMO: 'Consumos',
  TRANSFERENCIA: 'Transferências',
  AJUSTE: 'Ajustes',
  EMPRESTIMO: 'Empréstimos',
  DEVOLUCAO_EMPRESTIMO: 'Devoluções',
  ENTREGA: 'Entregas',
};

export async function resumoSemanalDaOrg(organizationId: string, agora: Date = new Date()): Promise<ResumoSemanal> {
  const db = scopedDb(organizationId);
  const de = new Date(agora.getTime() - 7 * DIA_MS);
  const { data: movs } = await db.from('material_movements').select('tipo_operacao, quantidade, materials(nome, unidade_medida)').gte('created_at', de.toISOString()).lt('created_at', agora.toISOString()).limit(5000);
  const porTipo: Record<string, number> = {};
  const consumo = new Map<string, { nome: string; quantidade: number; unidade: string }>();
  for (const m of (movs || []) as any[]) {
    porTipo[m.tipo_operacao] = (porTipo[m.tipo_operacao] ?? 0) + 1;
    if (m.tipo_operacao === 'SAIDA' || m.tipo_operacao === 'CONSUMO' || m.tipo_operacao === 'ENTREGA') {
      const nome = m.materials?.nome ?? '?';
      const atual = consumo.get(nome) ?? { nome, quantidade: 0, unidade: m.materials?.unidade_medida ?? '' };
      atual.quantidade = arredondar(atual.quantidade + Number(m.quantidade));
      consumo.set(nome, atual);
    }
  }
  const maisConsumidos = [...consumo.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5);
  return { de: de.toISOString(), ate: agora.toISOString(), movimentos: (movs || []).length, porTipo, maisConsumidos, pendencias: await pendenciasDaOrg(organizationId, agora) };
}

export function emailDoResumoSemanal(empresa: string, r: ResumoSemanal, env: Record<string, string | undefined> = process.env): { subject: string; html: string } {
  const lista = (itens: string[]) => (itens.length ? `<ul style="margin:0 0 12px;padding-left:20px">${itens.map((i) => `<li>${i}</li>`).join('')}</ul>` : '');
  const tipos = Object.entries(r.porTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${escapeHtml(NOME_DO_TIPO[t] ?? t)}: <strong>${n}</strong>`)
    .join(' · ');
  const corpo =
    p(`Entre ${data(r.de)} e ${data(r.ate)}, a <strong>${escapeHtml(empresa)}</strong> registrou <strong>${r.movimentos}</strong> movimentação(ões).${tipos ? ` ${tipos}.` : ''}`) +
    (r.maisConsumidos.length ? p('<strong>O que mais saiu:</strong>') + lista(r.maisConsumidos.map((m) => `${escapeHtml(m.nome)} — ${m.quantidade} ${escapeHtml(m.unidade)}`)) : '') +
    (r.pendencias.faltando.length ? p(`<strong>Abaixo do mínimo (${r.pendencias.faltando.length}):</strong>`) + lista(r.pendencias.faltando.slice(0, 15).map((f) => `${escapeHtml(f.nome)}: ${f.saldo} ${escapeHtml(f.unidade)} (mín. ${f.minimo})${f.semEstoque ? ' — <strong>sem estoque</strong>' : ''}`)) : p('Nenhum material abaixo do mínimo. 👏')) +
    (r.pendencias.atrasados.length ? p(`<strong>Empréstimos atrasados (${r.pendencias.atrasados.length}):</strong>`) + lista(r.pendencias.atrasados.slice(0, 15).map((a) => `${escapeHtml(a.tomador)} — ${a.quantidade} de ${escapeHtml(a.material)}, venceu ${data(a.venceuEm)}`)) : '') +
    (r.pendencias.vencendo.length ? p(`<strong>Vencendo em 30 dias (${r.pendencias.vencendo.length}):</strong>`) + lista(r.pendencias.vencendo.slice(0, 15).map((v) => `${escapeHtml(v.material)} lote ${escapeHtml(v.lote)}: ${v.quantidade} em ${escapeHtml(v.estoque)}, vence ${data(v.validade)}`)) : '');
  return {
    subject: `Resumo da semana — ${empresa}`,
    html: layoutEmail({ titulo: 'Sua semana no estoque', corpo, botao: { rotulo: 'Abrir o painel', url: `${siteUrl(env)}/entrar` }, observacao: 'Você recebe este resumo toda segunda-feira porque o plano da sua empresa inclui relatórios automáticos. Para parar, fale com a gente.' }),
  };
}

/** Às segundas: manda o resumo a cada organização com o recurso. Devolve quantos e-mails saíram. */
export async function resumosSemanais(agora: Date = new Date()): Promise<{ organizacoes: number; enviados: number }> {
  const t = await getTransporter();
  if (!t) return { organizacoes: 0, enviados: 0 };
  const { data: orgs } = await supabaseServer.from('organizations').select('id, nome, ativo').eq('ativo', true);
  let organizacoes = 0;
  let enviados = 0;
  for (const o of (orgs || []) as any[]) {
    try {
      const conta = await contaDaOrg(o.id);
      if (conta.situacao === 'bloqueada' || !planoLibera(conta.plano, 'relatorios-automaticos')) continue;
      const emails = await emailsDosAdministradores(o.id);
      if (!emails.length) continue;
      const r = await resumoSemanalDaOrg(o.id, agora);
      if (r.movimentos === 0 && !r.pendencias.faltando.length && !r.pendencias.atrasados.length && !r.pendencias.vencendo.length) continue;
      organizacoes++;
      const { subject, html } = emailDoResumoSemanal(o.nome, r);
      await t.sendMail({ from: remetente(), to: emails.join(', '), subject, html });
      enviados++;
    } catch (e: any) {
      console.error(`[resumo] ${o.nome}:`, e.message);
    }
  }
  return { organizacoes, enviados };
}

// ---------------------------------------------------------------------------
//  Vigiar o WhatsApp
// ---------------------------------------------------------------------------

/**
 * A instância do Stok Aí está conectada? Se não, avisa o operador por
 * e-mail (o WhatsApp está justamente fora). Devolve o estado visto.
 */
export async function vigiarWhatsapp(): Promise<{ estado: string | null; avisou: boolean }> {
  if (!evolutionConfigurada()) return { estado: null, avisou: false };
  let estado: string;
  try {
    estado = await estadoDaInstancia();
  } catch (e: any) {
    estado = `erro: ${String(e.message).slice(0, 120)}`;
  }
  if (estado === 'open') return { estado, avisou: false };
  const t = await getTransporter();
  if (!t) return { estado, avisou: false };
  try {
    await t.sendMail({
      from: remetente(),
      to: destinatarioAdmin(),
      subject: `⚠️ WhatsApp do Stok Aí fora do ar (${estado})`,
      html: layoutEmail({
        titulo: 'O WhatsApp do Stok Aí não está conectado',
        corpo: p(`A verificação diária encontrou a instância <strong>${escapeHtml(process.env.EVOLUTION_INSTANCE ?? '')}</strong> no estado <strong>${escapeHtml(estado)}</strong>. Enquanto isso, a equipe dos clientes e os fornecedores não recebem resposta.`) + p('Abra o painel da Evolution e reconecte o número (QR code). Depois, confira em Configurações → Stok Aí no WhatsApp.'),
      }),
    });
    return { estado, avisou: true };
  } catch (e: any) {
    console.error('[vigiar whatsapp] e-mail:', e.message);
    return { estado, avisou: false };
  }
}
