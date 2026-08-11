import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Material, MaterialMovement, StaffUser } from '@/shared/types';
import { toast } from 'sonner';

interface EstoqueData {
  materials: Material[];
  materialMovements: MaterialMovement[];
  staff: StaffUser[];
}

export function useEstoqueData() {
  const [data, setData] = useState<EstoqueData>({ materials: [], materialMovements: [], staff: [] });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const result = await api.get<EstoqueData>('/api/data');
      setData(result);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar dados do estoque.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...data, loading, refetch };
}
