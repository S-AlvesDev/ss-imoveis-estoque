import type { RequisicaoAtende } from './auth';
import type { ItemDoFunilDeLeads } from '../shared/tipos';

/**
 * O quadro geral "Gestão de Leads" (supervisor/admin): todo o funil de
 * vendas, de todas as conversas — diferente do funil de MCMV (`mcmv.ts`),
 * que é o recorte restrito que o papel `analista` trabalha. Um lead com
 * `mcmv_status` preenchido aparece aqui na coluna "Em Análise de Crédito",
 * independente do `estado` geral dele por baixo.
 */

const COLUNAS_BASE = 'id, conversa_id, cliente_id, estado, valor, atualizado_em, cliente:atende_clientes(nome, nome_whatsapp, telefone), conversa:atende_conversas(atendente_id)';
const COLUNAS = `${COLUNAS_BASE}, mcmv_status, origem`;

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

export async function listarFunilDeLeads(req: RequisicaoAtende): Promise<ItemDoFunilDeLeads[]> {
  const { data, error } = await req.dbAtende!.from('atende_leads').select(COLUNAS).order('atualizado_em', { ascending: false }).limit(500);
  if (error) {
    if (!/mcmv_status|origem/.test(error.message)) throw error;
    // sem a migração 048 ainda: mostra o funil geral sem a coluna de crédito.
    const { data: basico, error: erroBasico } = await req.dbAtende!.from('atende_leads').select(COLUNAS_BASE).order('atualizado_em', { ascending: false }).limit(500);
    if (erroBasico) throw erroBasico;
    return ((basico || []) as any[]).map(montarItem);
  }
  return ((data || []) as any[]).map(montarItem);
}
