import { scopedDb, type Escopo, type ScopedDb } from '../../server/tenant';

/**
 * O acesso a dados do Atende Aí, preso à empresa. Mesmo mecanismo do Stok Aí
 * (ver src/server/tenant.ts), com o escopo do segundo produto: a coluna é
 * `empresa_id`, a claim do PostgREST é `empresa_id`, e as tabelas são as
 * `atende_*`. O código de rota usa `dbDaEmpresa(id)` e não consegue
 * escrever uma consulta sem o filtro.
 */
export const TABELAS_DO_ATENDE: ReadonlySet<string> = new Set([
  'atende_usuarios',
  'atende_times',
  'atende_time_membros',
  // Etapa 2 em diante (a lista cresce com as migrações):
  'atende_conexoes',
  'atende_clientes',
  'atende_conversas',
  'atende_mensagens',
  'atende_triagens',
  'atende_leads',
  'atende_etiquetas',
  'atende_conversa_etiquetas',
  'atende_cliente_etiquetas',
  'atende_disparos_lote',
  'atende_inventario_itens',
  'atende_modelos_mensagem',
  'atende_eventos',
  'atende_push_inscricoes',
  'atende_assinaturas',
]);

export const ESCOPO_DA_EMPRESA: Escopo = { coluna: 'empresa_id', claim: 'empresa_id', tabelas: TABELAS_DO_ATENDE };

/**
 * `atende_empresas` não está na lista de propósito: o dono é a própria linha
 * (`id`, não `empresa_id`). As rotas leem a empresa com `.eq('id', empresaId)`
 * explícito — e, no modo RLS, a política `id = atende_empresa_atual()` fecha
 * qualquer outra.
 */
export function dbDaEmpresa(empresaId: string, agora = Date.now()): ScopedDb {
  return scopedDb(empresaId, agora, ESCOPO_DA_EMPRESA);
}
