import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, ClipboardList, Clock, HardHat, LayoutGrid, Search } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { StatCard } from '@/shared/ui/StatCard';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { StockBar } from '@/shared/ui/StockBar';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import { Stripes } from '@/shared/ui/Stripes';
import { EmptyState } from '@/shared/ui/EmptyState';
import { StockStatusBadge } from '@/shared/ui/StockStatusBadge';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { AuditModal } from '@/features/estoque/AuditModal';
import { HistoryModal } from '@/features/estoque/HistoryModal';
import { MovementForm } from '@/features/estoque/MovementForm';
import { Recontagem } from '@/features/estoque/Recontagem';
import { api } from '@/lib/api';
import { naUnidade } from '@/store/unidade';
import type { Material, MaterialMovement, StaffUser } from '@/shared/types';
import { formatNumber, stockStatus } from '@/features/estoque/utils';
import { CATEGORIES } from '@/shared/constants';

interface ObraProps {
  materials: Material[];
  materialMovements: MaterialMovement[];
  staff: StaffUser[];
  refetch: () => Promise<void>;
}

const OPERATIONS = [
  { value: 'CONSUMO_OBRA', label: 'Consumo', color: 'bg-amber-600 text-white' },
  { value: 'DEVOLUCAO_CENTRAL', label: 'Devolver p/ Central', color: 'bg-indigo-600 text-white' },
];

export function Obra({ materials, materialMovements, staff, refetch }: ObraProps) {
  const [category, setCategory] = useState<string>('TODAS');
  const [view, setView] = useState<'OBRA' | 'CENTRAL'>('OBRA');
  const [stockSearch, setStockSearch] = useState('');
  const [onlyTransfer, setOnlyTransfer] = useState(false);
  const [historyMaterial, setHistoryMaterial] = useState<Material | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [recontagemOpen, setRecontagemOpen] = useState(false);

  const stats = useMemo(() => {
    // Falta de verdade é o que não existe em lugar nenhum. O resto é remessa.
    const semEstoque = materials.filter((m) => stockStatus(m, 'obra') === 'RUPTURA').length;
    const temNaCentral = materials.filter((m) => stockStatus(m, 'obra') === 'TRANSFERIR').length;
    return { total: materials.length, semEstoque, temNaCentral, movimentos: materialMovements.length };
  }, [materials, materialMovements]);

  const categorized = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      cat,
      items: materials.filter((m) => m.categoria === cat),
      criticos: materials.filter((m) => m.categoria === cat && stockStatus(m, 'obra') === 'RUPTURA').length,
    }));
  }, [materials]);

  const filteredMaterials = useMemo(
    () => (category === 'TODAS' ? materials : materials.filter((m) => m.categoria === category)),
    [materials, category]
  );

  const stockListMaterials = useMemo(() => {
    let list = filteredMaterials;
    if (onlyTransfer) list = list.filter((m) => stockStatus(m, 'obra') === 'TRANSFERIR');
    const q = stockSearch.trim().toLowerCase();
    return q ? list.filter((m) => m.nome.toLowerCase().includes(q)) : list;
  }, [filteredMaterials, stockSearch, onlyTransfer]);

  async function handleMovement(payload: { material_id: number; tipo_operacao: string; quantidade: number; justificativa: string }) {
    await api.post(`/api/materials/${payload.material_id}/movement`, naUnidade(payload));
    await refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Almoxarifado de Obra</h1>
          <p className="text-sm text-[var(--text-muted)]">Consumo de materiais e devoluções para a central.</p>
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
          <StatCard
            label="Sem Estoque"
            value={stats.semEstoque}
            icon={<AlertTriangle size={20} />}
            accent="rose"
            sublabel={stats.temNaCentral > 0 ? `+${stats.temNaCentral} disponíveis na Central` : undefined}
          />
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
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Distribuição por Seções</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categorized.map(({ cat, items, criticos }) => (
            <button
              key={cat}
              onClick={() => setCategory(category === cat ? 'TODAS' : cat)}
              className={`relative overflow-hidden rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                category === cat ? 'border-[var(--brand)] bg-[var(--brand)]/10 shadow-sm shadow-blue-500/10' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]/50'
              }`}
            >
              {category === cat && <Stripes className="absolute inset-x-0 top-0 h-1" color="rgba(37,99,235,0.9)" dense />}
              <p className="truncate text-xs font-bold text-[var(--text)]">{cat}</p>
              <p className="font-display mt-1 text-lg font-bold text-[var(--text)]">{items.length}</p>
              {criticos > 0 && <Badge variant="critical" dot>{criticos} Crítico(s)</Badge>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-bold text-[var(--text)]">Registrar Movimentação</p>
          <MovementForm materials={filteredMaterials} operations={OPERATIONS} onSubmit={handleMovement} />
        </Card>

        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-bold text-[var(--text)]">Estoque Atual</p>
            <SegmentedControl
              value={view}
              onChange={setView}
              layoutId="obra-view-pill"
              options={[
                { value: 'OBRA', label: 'Obra' },
                { value: 'CENTRAL', label: 'Central' },
              ]}
            />
          </div>

          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              placeholder="Buscar material no estoque..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
            />
          </div>

          {stats.temNaCentral > 0 && (
            <button
              onClick={() => setOnlyTransfer((v) => !v)}
              className={`mb-3 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                onlyTransfer
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-[var(--border)] bg-[var(--surface)] text-sky-500 hover:border-sky-500/50'
              }`}
            >
              Não tem na Obra, tem na Central
              <span className={onlyTransfer ? 'ml-1.5 opacity-80' : 'ml-1.5 text-[var(--text-muted)]'}>
                {stats.temNaCentral}
              </span>
            </button>
          )}

          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {stockListMaterials.map((m) => {
              const scope = view === 'OBRA' ? 'obra' : 'central';
              const saldo = view === 'OBRA' ? m.saldo_obra : m.saldo_central;
              const status = stockStatus(m, scope);
              return (
                <div key={m.id} className="group rounded-lg px-3 py-2.5 hover:bg-[var(--bg-2)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{m.nome}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{m.categoria}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StockStatusBadge status={status} scope={scope} />
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          status === 'RUPTURA' ? 'text-rose-500' : 'text-[var(--text)]'
                        }`}
                      >
                        {formatNumber(saldo)} <span className="text-[10px] font-medium text-[var(--text-muted)]">{m.unidade_medida}</span>
                      </span>
                      <button
                        onClick={() => setHistoryMaterial(m)}
                        className="rounded-full p-1.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-2)] hover:text-[var(--text)] group-hover:opacity-100"
                        title="Histórico"
                      >
                        <Clock size={15} />
                      </button>
                    </div>
                  </div>
                  {/* O mínimo é da empresa, então a barra mede o total, não só este local. */}
                  <StockBar saldo={m.saldo_central + m.saldo_obra} minimo={m.estoque_minimo} className="mt-1.5" />
                </div>
              );
            })}
            {stockListMaterials.length === 0 && (
              <EmptyState icon={<HardHat size={20} />} title="Nenhum material encontrado" />
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
        typeOptions={['CONSUMO_OBRA', 'REMESSA_OBRA', 'DEVOLUCAO_CENTRAL', 'AJUSTE_OBRA']}
        exportFilename="auditoria-almoxarifado-obra"
        title="Auditoria — Almoxarifado de Obra"
      />
      <Recontagem
        open={recontagemOpen}
        onClose={() => setRecontagemOpen(false)}
        location="OBRA"
        materials={materials}
        refetch={refetch}
      />
    </div>
  );
}
