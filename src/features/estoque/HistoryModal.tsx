import { useMemo } from 'react';
import { History } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Badge } from '@/shared/ui/Badge';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import type { Material, MaterialMovement, StaffUser } from '@/shared/types';
import { formatDateTime, formatNumber, staffName } from './utils';
import { OPERATION_LABELS } from '@/shared/constants';

interface HistoryModalProps {
  material: Material | null;
  movements: MaterialMovement[];
  staff: StaffUser[];
  onClose: () => void;
}

function badgeVariant(tipo: string): 'success' | 'critical' | 'info' | 'indigo' | 'neutral' {
  if (tipo.includes('ENTRADA') || tipo.includes('DEVOLUCAO')) return 'success';
  if (tipo.includes('SAIDA') || tipo.includes('CONSUMO')) return 'critical';
  if (tipo.includes('AJUSTE')) return 'indigo';
  if (tipo.includes('REMESSA')) return 'info';
  return 'neutral';
}

export function HistoryModal({ material, movements, staff, onClose }: HistoryModalProps) {
  const items = useMemo(
    () => movements.filter((m) => m.material_id === material?.id),
    [movements, material]
  );

  return (
    <Modal open={!!material} onClose={onClose} title={material?.nome || ''} subtitle="Histórico de movimentações" maxWidth="max-w-2xl">
      <Reveal className="max-h-[55vh] overflow-y-auto space-y-2">
        {items.map((m) => (
          <RevealItem key={m.id}>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 transition-colors hover:border-slate-200 hover:bg-slate-50/60">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={badgeVariant(m.tipo_operacao)}>{OPERATION_LABELS[m.tipo_operacao] || m.tipo_operacao}</Badge>
                  <span className="font-mono text-[11px] text-slate-400">{formatDateTime(m.created_at)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{m.justificativa}</p>
                <p className="text-[11px] text-slate-400">Responsável: {staffName(m.funcionario_matricula, staff)}</p>
              </div>
              <span className="font-display shrink-0 text-lg font-bold tabular-nums text-slate-800">{formatNumber(m.quantidade)}</span>
            </div>
          </RevealItem>
        ))}
        {items.length === 0 && <EmptyState icon={<History size={20} />} title="Nenhuma movimentação registrada" />}
      </Reveal>
    </Modal>
  );
}
