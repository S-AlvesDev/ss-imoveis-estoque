import type { RequisicaoAtende } from './auth';
import type { ItemDoFunilDeLeads } from '../shared/tipos';

/**
 * O quadro geral "Gestão de Leads" (supervisor/admin): todo o funil de
 * vendas, de todas as conversas — diferente do funil de MCMV (`mcmv.ts`),
 * que é o recorte restrito que o papel `analista` trabalha. Um lead com
 * `mcmv_status` preenchido aparece aqui na coluna "Em Análise de Crédito",
 * independente do `estado` geral dele por baixo.
 */

const COLUNAS = 'id, conversa_id, cliente_id, estado, mcmv_status, valor, origem, atualizado_em, cliente:atende_clientes(nome, nome_whatsapp, telefone), conversa:atende_conversas(atendente_id)';

export async function listarFunilDeLeads(req: RequisicaoAtende): Promise<ItemDoFunilDeLeads[]> {
  const { data, error } = await req.dbAtende!.from('atende_leads').select(COLUNAS).order('atualizado_em', { ascending: false }).limit(500);
  if (error) throw error;
  return ((data || []) as any[]).map((l) => ({
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
  }));
}
