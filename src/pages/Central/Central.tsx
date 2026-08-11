import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, ClipboardList, Clock, LayoutGrid, Warehouse } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { StatCard } from '@/shared/ui/StatCard';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { StockBar } from '@/shared/ui/StockBar';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import { Stripes } from '@/shared/ui/Stripes';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { AuditModal } from '@/features/estoque/AuditModal';
import { HistoryModal } from '@/features/estoque/HistoryModal';
import { MovementForm } from '@/features/estoque/MovementForm';
import { Recontagem } from '@/features/estoque/Recontagem';
import { api } from '@/lib/api';
import type { Material, MaterialMovement, StaffUser } from '@/shared/types';
import { formatNumber, isCritical } from '@/features/estoque/utils';
import { CATEGORIES } from '@/shared/constants';

interface CentralProps {
  materials: Material[];
  materialMovements: MaterialMovement[];
  staff: StaffUser[];
  refetch: () => Promise<void>;
}

const OPERATIONS = [
  { value: 'ENTRADA_CENTRAL', label: 'Receber Compra', color: 'bg-emerald-600 text-white' },
  { value: 'REMESSA_OBRA', label: 'Enviar p/ Obra', color: 'bg-blue-600 text-white' },
  { value: 'DEVOLUCAO_CENTRAL', label: 'Aceitar Devolução', color: 'bg-indigo-600 text-white' },
  { value: 'SAIDA', label: 'Saída / Consumo Adm.', color: 'bg-amber-600 text-white' },
];

export function Central({ materials, materialMovements, staff, refetch }: CentralProps) {
  const [category, setCategory] = useState<string>('TODAS');
  const [view, setView] = useState<'CENTRAL' | 'OBRA'>('CENTRAL');
  const [historyMaterial, setHistoryMaterial] = useState<Material | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [recontagemOpen, setRecontagemOpen] = useState(false);

  const stats = useMemo(() => {
    const criticos = materials.filter((m) => isCritical(m, 'central')).length;
    return { total: materials.length, criticos, movimentos: materialMovements.length };
  }, [materials, materialMovements]);

  const categorized = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      cat,
      items: materials.filter((m) => m.categoria === cat),
      criticos: materials.filter((m) => m.categoria === cat && isCritical(m, 'central')).length,
    }));
  }, [materials]);

  const filteredMaterials = useMemo(
    () => (category === 'TODAS' ? materials : materials.filter((m) => m.categoria === category)),
    [materials, category]
  );

  async function handleMovement(payload: { material_id: number; tipo_operacao: string; quantidade: number; justificativa: string }) {
    await api.post(`/api/materials/${payload.material_id}/movement`, payload);
    await refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Almoxarifado Central</h1>
          <p className="text-sm text-slate-500">Recebimento, remessas para obra e devoluções.</p>
        </div>
        <Button variant="accent" icon={<ClipboardCheck size={16} />} onClick={() => setRecontagemOpen(true)}>
          Recontagem Rápida
        </Button>
      </div>

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <RevealItem>
          <StatCard label="Total de Materiais" value={stats.total} icon={<LayoutGrid size={20} />} accent="blue" />
        </RevealItem>
        <RevealItem>
          <StatCard label="Estoque Crítico" value={stats.criticos} icon={<AlertTriangle size={20} />} accent="rose" />
        </RevealItem>
        <RevealItem>
          <StatCard
            label="Movimentações"
            value={stats.movimentos}
            icon={<ClipboardList size={20} />}
            accent="indigo"
            onClick={() => setAuditOpen(true)}
          />
        </RevealItem>
      </Reveal>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Distribuição por Seções</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categorized.map(({ cat, items, criticos }) => (
            <button
              key={cat}
              onClick={() => setCategory(category === cat ? 'TODAS' : cat)}
              className={`relative overflow-hidden rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                category === cat ? 'border-blue-500 bg-blue-50 shadow-sm shadow-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              {category === cat && <Stripes className="absolute inset-x-0 top-0 h-1" color="rgba(37,99,235,0.9)" dense />}
              <p className="truncate text-xs font-bold text-slate-700">{cat}</p>
              <p className="font-display mt-1 text-lg font-bold text-slate-900">{items.length}</p>
              {criticos > 0 && <Badge variant="critical" dot>{criticos} Crítico(s)</Badge>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-bold text-slate-800">Registrar Movimentação</p>
          <MovementForm materials={filteredMaterials} operations={OPERATIONS} onSubmit={handleMovement} />
        </Card>

        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">Estoque Atual</p>
            <SegmentedControl
              value={view}
              onChange={setView}
              layoutId="central-view-pill"
              options={[
                { value: 'CENTRAL', label: 'Central' },
                { value: 'OBRA', label: 'Obra' },
              ]}
            />
          </div>

          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {filteredMaterials.map((m) => {
              const saldo = view === 'CENTRAL' ? m.saldo_central : m.saldo_obra;
              const critical = isCritical(m, view === 'CENTRAL' ? 'central' : 'obra');
              return (
                <div key={m.id} className="group rounded-lg px-3 py-2.5 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{m.nome}</p>
                      <p className="text-[11px] text-slate-400">{m.categoria}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`text-sm font-bold tabular-nums ${critical ? 'text-rose-600' : 'text-slate-800'}`}>
                        {formatNumber(saldo)} <span className="text-[10px] font-medium text-slate-400">{m.unidade_medida}</span>
                      </span>
                      <button
                        onClick={() => setHistoryMaterial(m)}
                        className="rounded-full p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                        title="Histórico"
                      >
                        <Clock size={15} />
                      </button>
                    </div>
                  </div>
                  <StockBar saldo={saldo} minimo={m.estoque_minimo} className="mt-1.5" />
                </div>
              );
            })}
            {filteredMaterials.length === 0 && (
              <EmptyState icon={<Warehouse size={20} />} title="Nenhum material nesta categoria" />
            )}
          </div>
        </Card>
      </div>

      <HistoryModal material={historyMaterial} movements={materialMovements} staff={staff} onClose={() => setHistoryMaterial(null)} />
      <AuditModal
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        movements={materialMovements}
        materials={materials}
        staff={staff}
        typeOptions={['ENTRADA_CENTRAL', 'REMESSA_OBRA', 'DEVOLUCAO_CENTRAL', 'SAIDA', 'AJUSTE_CENTRAL', 'EXCLUSÃO']}
        exportFilename="auditoria-almoxarifado-central"
        title="Auditoria — Almoxarifado Central"
      />
      <Recontagem
        open={recontagemOpen}
        onClose={() => setRecontagemOpen(false)}
        location="CENTRAL"
        materials={materials}
        refetch={refetch}
      />
    </div>
  );
}
