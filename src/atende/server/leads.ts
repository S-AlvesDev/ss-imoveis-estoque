import type { RequisicaoAtende } from './auth';
import type { ItemDoFunilDeLeads } from '../shared/tipos';

/**
 * O quadro geral "Gestão de Leads" (supervisor/admin): todo o funil de
 * vendas, de todas as conversas — diferente do funil de MCMV (`mcmv.ts`),
 * que é o recorte restrito que o papel `analista` trabalha.
 *
 * Um lead só entra no funil depois de aprovado (migração 052). Enquanto
 * `aprovado` é NULL ele fica na fila da aba "Aprovar Leads"; reprovado
 * (false) sai da frente sem apagar a conversa. Um lead por conversa e uma
 * conversa por contato, então a fila nunca repete a mesma pessoa.
 */

const COLUNAS_BASE = 'id, conversa_id, cliente_id, estado, valor, atualizado_em, cliente:atende_clientes(nome, nome_whatsapp, telefone), conversa:atende_conversas(atendente_id)';
const COLUNAS = `${COLUNAS_BASE}, mcmv_status, origem`;
const COLUNAS_COM_APROVACAO = `${COLUNAS}, criado_em`;

/** Colunas que dependem de migração: sem elas, o funil ainda abre (só mais pobre). */
const COLUNA_FALTANDO = /mcmv_status|origem|aprovado/;

function montarItem(l: any): ItemDoFunilDeLeads {
  return {
    lead_id: l.id,
    conversa_id: l.conversa_id,
    cliente_id: l.cliente_id,
    cliente_nome: l.cliente?.nome || l.cliente?.nome_whatsapp || `+${l.cliente?.telefone}`,
    telefone: l.cliente?.telefone ?? '',
    estado: l.estado,
    mcmv_status: l.mcmv_status ?? null,
    valor: l.valor === null ? null : Number(l.valor),
    origem: l.origem ?? 'whatsapp',
    atendente_id: l.conversa?.atendente_id ?? null,
    atualizado_em: l.atualizado_em,
  };
}

/** O funil: só o que já foi aprovado. */
export async function listarFunilDeLeads(req: RequisicaoAtende): Promise<ItemDoFunilDeLeads[]> {
  const { data, error } = await req.dbAtende!.from('atende_leads').select(COLUNAS).eq('aprovado', true).order('atualizado_em', { ascending: false }).limit(500);
  if (error) {
    if (!COLUNA_FALTANDO.test(error.message)) throw error;
    // Sem a 048/052 ainda: mostra o funil inteiro, como era antes delas.
    const { data: basico, error: erroBasico } = await req.dbAtende!.from('atende_leads').select(COLUNAS_BASE).order('atualizado_em', { ascending: false }).limit(500);
    if (erroBasico) throw erroBasico;
    return ((basico || []) as any[]).map(montarItem);
  }
  return ((data || []) as any[]).map(montarItem);
}

/** A fila de aprovação: quem chegou e ainda não foi julgado. Mais novo primeiro. */
export async function listarLeadsPendentes(req: RequisicaoAtende): Promise<ItemDoFunilDeLeads[]> {
  const { data, error } = await req.dbAtende!.from('atende_leads').select(COLUNAS_COM_APROVACAO).is('aprovado', null).order('criado_em', { ascending: false }).limit(200);
  // Sem a migração 052 não existe fila: ninguém fica pendente, e o funil segue como antes.
  if (error) {
    if (COLUNA_FALTANDO.test(error.message)) return [];
    throw error;
  }
  return ((data || []) as any[]).map(montarItem);
}

/**
 * Aprova (entra no funil, na coluna Novo) ou reprova (sai da frente) um lead
 * pendente. Só mexe em quem está pendente: aprovar duas vezes não reabre nem
 * rebaixa um lead que a equipe já está trabalhando.
 */
export async function decidirSobreLead(req: RequisicaoAtende, leadId: string, aprovado: boolean): Promise<void> {
  const { error } = await req
    .dbAtende!.from('atende_leads')
    .update({ aprovado, atualizado_por: req.sessao!.id, atualizado_em: new Date().toISOString() })
    .eq('id', leadId)
    .is('aprovado', null);
  if (error) throw error;
}
