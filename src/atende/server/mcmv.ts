import type { RequisicaoAtende } from './auth';
import { ErroDeConversa, registrarEvento } from './conversas';
import { ESTADOS_MCMV, type ItemDoPipelineMcmv } from '../shared/tipos';

/**
 * O pipeline de análise de financiamento MCMV — paralelo ao funil de vendas.
 * Quem atende encaminha um lead para cá (`iniciarMcmv`, em conversas.ts);
 * daqui em diante é o papel `analista` quem move a etapa e cuida dos
 * documentos, sem abrir a conversa do WhatsApp.
 */

const COLUNAS = 'id, conversa_id, cliente_id, mcmv_status, mcmv_iniciado_em, mcmv_atualizado_em, cliente:atende_clientes(nome, nome_whatsapp, telefone)';

export async function listarPipelineMcmv(req: RequisicaoAtende): Promise<ItemDoPipelineMcmv[]> {
  const { data, error } = await req.dbAtende!.from('atende_leads').select(COLUNAS).not('mcmv_status', 'is', null).order('mcmv_atualizado_em', { ascending: false });
  if (error) {
    if (/mcmv_status/.test(error.message)) return []; // sem a migração 048 ainda
    throw error;
  }
  return ((data || []) as any[]).map((l) => ({
    lead_id: l.id,
    conversa_id: l.conversa_id,
    cliente_id: l.cliente_id,
    cliente_nome: l.cliente?.nome || l.cliente?.nome_whatsapp || `+${l.cliente?.telefone}`,
    telefone: l.cliente?.telefone ?? '',
    mcmv_status: l.mcmv_status,
    mcmv_iniciado_em: l.mcmv_iniciado_em,
    mcmv_atualizado_em: l.mcmv_atualizado_em,
  }));
}

/** Muda a etapa do MCMV de um lead e registra quem fez, quando e por quê. */
export async function atualizarMcmv(req: RequisicaoAtende, leadId: string, dados: { status?: unknown; nota?: unknown }): Promise<ItemDoPipelineMcmv> {
  const db = req.dbAtende!;
  const s = req.sessao!;
  const status = String(dados.status ?? '');
  if (!(ESTADOS_MCMV as readonly string[]).includes(status)) throw new ErroDeConversa('Etapa de MCMV inválida.');
  const nota = dados.nota ? String(dados.nota).trim().slice(0, 1000) : null;

  const { data: atual, error: erroAtual } = await db.from('atende_leads').select('id, conversa_id, mcmv_status').eq('id', leadId).maybeSingle();
  if (erroAtual) throw erroAtual;
  if (!atual) throw new ErroDeConversa('Lead não encontrado.', 404);
  if (!atual.mcmv_status) throw new ErroDeConversa('Este lead não está no pipeline de MCMV.');

  const agora = new Date().toISOString();
  const { error } = await db.from('atende_leads').update({ mcmv_status: status, mcmv_atualizado_em: agora, atualizado_por: s.id }).eq('id', leadId);
  if (error) throw error;
  await registrarEvento(db, atual.conversa_id, s.id, 'mcmv_alterado', { de: atual.mcmv_status, para: status, nota });

  const { data, error: erroFinal } = await db.from('atende_leads').select(COLUNAS).eq('id', leadId).single();
  if (erroFinal || !data) throw erroFinal ?? new Error('não recarregou o lead');
  const l = data as any;
  return {
    lead_id: l.id,
    conversa_id: l.conversa_id,
    cliente_id: l.cliente_id,
    cliente_nome: l.cliente?.nome || l.cliente?.nome_whatsapp || `+${l.cliente?.telefone}`,
    telefone: l.cliente?.telefone ?? '',
    mcmv_status: l.mcmv_status,
    mcmv_iniciado_em: l.mcmv_iniciado_em,
    mcmv_atualizado_em: l.mcmv_atualizado_em,
  };
}
