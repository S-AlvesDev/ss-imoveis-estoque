import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useUnidade } from '@/store/unidade';
import type { Deposito, Material, MaterialMovement, StaffUser, Unidade } from '@/shared/types';
import { toast } from 'sonner';

/** O que o servidor devolve. Os materiais vêm com `saldos` por depósito. */
interface EstoqueResposta {
  materials: Omit<Material, 'saldo_central' | 'saldo_obra'>[];
  materialMovements: MaterialMovement[];
  staff: StaffUser[];
  unidades: Unidade[];
  depositos: Deposito[];
}

const VAZIO: EstoqueResposta = { materials: [], materialMovements: [], staff: [], unidades: [], depositos: [] };

/**
 * Carrega o estoque e o entrega já visto de uma unidade.
 *
 * O servidor manda o saldo de cada material em cada depósito de cada unidade.
 * A interface, porém, fala "Central" e "Obra" — e está falando dos depósitos
 * da unidade que a pessoa escolheu. Aqui a tradução acontece uma vez só:
 * `saldo_central` e `saldo_obra` de cada material passam a ser o saldo nos
 * depósitos desta unidade. Nenhuma tela precisa saber que existe outra.
 *
 * O total da empresa (alertas, mínimo) continua somando TODAS as unidades:
 * ver stockTotal em utils.ts, que usa `saldos` inteiro.
 */
export function useEstoqueData() {
  const [data, setData] = useState<EstoqueResposta>(VAZIO);
  const [loading, setLoading] = useState(true);
  const unidadeEscolhida = useUnidade((s) => s.unidadeId);
  const setUnidade = useUnidade((s) => s.setUnidade);

  const refetch = useCallback(async () => {
    try {
      const result = await api.get<EstoqueResposta>('/api/data');
      setData({ ...VAZIO, ...result });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar dados do estoque.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // A unidade em uso: a escolhida, se ainda existir; senão a primeira. Uma
  // escolha salva no navegador pode apontar para uma unidade desativada.
  const unidade = useMemo<Unidade | null>(() => {
    if (data.unidades.length === 0) return null;
    return data.unidades.find((u) => u.id === unidadeEscolhida) ?? data.unidades[0];
  }, [data.unidades, unidadeEscolhida]);

  // Corrige a escolha salva quando ela não vale mais, para o seletor e os
  // pedidos ao servidor concordarem sobre qual unidade é.
  useEffect(() => {
    if (unidade && unidade.id !== unidadeEscolhida) setUnidade(unidade.id);
  }, [unidade, unidadeEscolhida, setUnidade]);

  const depositosDaUnidade = useMemo(
    () => (unidade ? data.depositos.filter((d) => d.unit_id === unidade.id) : []),
    [data.depositos, unidade],
  );

  const materials = useMemo<Material[]>(() => {
    const central = depositosDaUnidade.find((d) => d.tipo === 'CENTRAL');
    const obra = depositosDaUnidade.find((d) => d.tipo === 'OBRA');
    return data.materials.map((m) => ({
      ...m,
      saldos: m.saldos ?? {},
      // Depósito sem linha ainda (unidade recém-criada) é zero, não ausência.
      saldo_central: central ? Number(m.saldos?.[central.id] ?? 0) : 0,
      saldo_obra: obra ? Number(m.saldos?.[obra.id] ?? 0) : 0,
    }));
  }, [data.materials, depositosDaUnidade]);

  return {
    materials,
    materialMovements: data.materialMovements,
    staff: data.staff,
    unidades: data.unidades,
    depositos: data.depositos,
    /** A unidade cujos depósitos as telas estão mostrando. */
    unidade,
    /** Só os depósitos da unidade em uso. */
    depositosDaUnidade,
    loading,
    refetch,
  };
}
