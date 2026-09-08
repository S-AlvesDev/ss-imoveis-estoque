import { useMemo } from 'react';
import { History } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { MovementsTable } from './MovementsTable';
import type { Material, MaterialMovement, StaffUser } from '@/shared/types';

interface HistoryModalProps {
  material: Material | null;
  movements: MaterialMovement[];
  staff: StaffUser[];
  onClose: () => void;
}

export function HistoryModal({ material, movements, staff, onClose }: HistoryModalProps) {
  const items = useMemo(() => movements.filter((m) => m.material_id === material?.id), [movements, material]);

  return (
    <Modal
      open={!!material}
      onClose={onClose}
      title={material?.nome || ''}
      subtitle={`${items.length} movimentação(ões) registrada(s)`}
      maxWidth="max-w-2xl"
    >
      <div className="max-h-[55vh] overflow-y-auto">
        {items.length > 0 ? (
          <MovementsTable movements={items} materials={[]} staff={staff} hideMaterial />
        ) : (
          <EmptyState icon={<History size={20} />} title="Nenhuma movimentação registrada" />
        )}
      </div>
    </Modal>
  );
}
