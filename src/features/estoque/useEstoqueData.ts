import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useUnidade } from '@/store/unidade';
import type { Acesso, Deposito, Material, MaterialMovement, NivelAcesso, StaffUser, Unidade } from '@/shared/types';
import { toast } from 'sonner';

/** O que o servidor devolve. Os materiais vêm com `saldos` por depósito. */
interface EstoqueResposta {
  materials: Omit<Material, 'saldo_central' | 'saldo_obra' | 'na_unidade'>[];
  materialMovements: MaterialMovement[];
  staff: StaffUser[];
  unidades: Unidade[];
  depositos: Deposito[];
  /** O que ESTA pessoa pode, por depósito. `null` = administrador. */
  acessos: Acesso[] | null;
}

const VAZIO: EstoqueResposta = { materials: [], materialMovements: [], staff: [], unidades: [], depositos: [], acessos: null };

/**
 * Carrega o estoque e o entrega já visto de uma unidade.
 *
 * O servidor manda o saldo de cada material em cada depósito de cada unidade.
 * A interface, porém, fala "Central" e "Obra" — e está falando dos depósitos
 * da unidade que a pessoa escolheu. Aqui a tradução acontece uma vez só:
 * `saldo_central` e `saldo_obra` de cada material passam a ser o saldo nos
 * depósitos desta unidade. Nenhuma tela precisa saber que existe outra.
 *
 * Cada unidade é um estoque próprio: o mínimo se compara com o total DELA
 * (ver stockTotal em utils.ts), e só o que ela tem aparece nas telas.
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

  // Catálogo: todos os materiais da organização, vistos da unidade em uso.
  // Um material ESTÁ na unidade quando tem linha de saldo em algum depósito
  // dela — é o admin quem o coloca lá. Zero é saldo; ausência de linha é
  // "não trabalha com isso aqui".
  const catalogo = useMemo<Material[]>(() => {
    const central = depositosDaUnidade.find((d) => d.tipo === 'CENTRAL');
    const obra = depositosDaUnidade.find((d) => d.tipo === 'OBRA');
    const idsDaUnidade = new Set(depositosDaUnidade.map((d) => d.id));
    return data.materials.map((m) => {
      const saldos = m.saldos ?? {};
      return {
        ...m,
        saldos,
        na_unidade: Object.keys(saldos).some((depositoId) => idsDaUnidade.has(depositoId)),
        saldo_central: central ? Number(saldos[central.id] ?? 0) : 0,
        saldo_obra: obra ? Number(saldos[obra.id] ?? 0) : 0,
      };
    });
  }, [data.materials, depositosDaUnidade]);

  // O que as telas de operação mostram: só o que existe nesta unidade.
  const materials = useMemo(() => catalogo.filter((m) => m.na_unidade), [catalogo]);

  // O nível da pessoa num depósito da unidade em uso. Administrador opera
  // tudo; quem não tem o depósito não o vê — e a tela dele nem aparece.
  const nivelEm = useCallback(
    (tipo: 'CENTRAL' | 'OBRA'): NivelAcesso | null => {
      const deposito = depositosDaUnidade.find((d) => d.tipo === tipo);
      if (!deposito) return null;
      if (data.acessos === null) return 'OPERA';
      return data.acessos.find((a) => a.warehouse_id === deposito.id)?.nivel ?? null;
    },
    [depositosDaUnidade, data.acessos],
  );

  return {
    /** Materiais que existem na unidade em uso. É o que Central, Obra, alertas e dashboard mostram. */
    materials,
    /** Todos os materiais da organização, com `na_unidade` dizendo se estão nesta. */
    catalogo,
    materialMovements: data.materialMovements,
    staff: data.staff,
    unidades: data.unidades,
    depositos: data.depositos,
    /** A unidade cujos depósitos as telas estão mostrando. */
    unidade,
    /** Só os depósitos da unidade em uso. */
    depositosDaUnidade,
    /** Nível da pessoa no Central/Obra da unidade em uso: 'OPERA', 'CONSULTA' ou null (não vê). */
    nivelEm,
    loading,
    refetch,
  };
}
