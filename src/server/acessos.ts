import type { ScopedDb } from './tenant';
import { ADMIN_ROLES } from '../shared/constants';

/**
 * Quem pode o quê, por depósito.
 *
 * O cargo deixou de decidir. A pessoa é atribuída a depósitos, com um nível
 * em cada, e tudo deriva daí. Administrador não tem atribuição: vê e faz tudo.
 */

export type Nivel = 'OPERA' | 'CONSULTA';

/** depósito -> nível. `null` significa administrador: sem restrição. */
export type Acessos = Map<string, Nivel> | null;

export function ehAdmin(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

export async function acessosDoUsuario(db: ScopedDb, userId: number, role: string): Promise<Acessos> {
  if (ehAdmin(role)) return null;
  const { data, error } = await db
    .from('estoque_user_warehouses')
    .select('warehouse_id, nivel')
    .eq('user_id', userId);
  if (error) throw error;
  const mapa = new Map<string, Nivel>();
  for (const a of data || []) mapa.set(a.warehouse_id, a.nivel);
  return mapa;
}

/** Pode ver o depósito (qualquer nível). */
export function podeVer(acessos: Acessos, warehouseId: string): boolean {
  return acessos === null || acessos.has(warehouseId);
}

/** Pode registrar movimentação no depósito. */
export function podeOperar(acessos: Acessos, warehouseId: string): boolean {
  return acessos === null || acessos.get(warehouseId) === 'OPERA';
}

/**
 * De que lado da operação a pessoa precisa operar.
 *
 * Preserva o que valia por cargo: quem manda a remessa é a Central (origem);
 * quem consome é a Obra (origem); entrada e ajuste são de quem recebe
 * (destino); devolução pode ser registrada por qualquer um dos dois lados,
 * como sempre foi.
 */
export type QuemOpera = 'origem' | 'destino' | 'qualquer';

export function podeExecutar(
  acessos: Acessos,
  lados: { origem_id?: string; destino_id?: string },
  quem: QuemOpera,
): boolean {
  if (acessos === null) return true;
  const origem = lados.origem_id ? podeOperar(acessos, lados.origem_id) : false;
  const destino = lados.destino_id ? podeOperar(acessos, lados.destino_id) : false;
  if (quem === 'origem') return origem;
  if (quem === 'destino') return destino;
  return origem || destino;
}
