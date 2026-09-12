import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, CheckSquare, Clock, FileDown, Merge, Pencil, Plus, Search, ShieldAlert, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { AuditModal } from '@/features/estoque/AuditModal';
import { HistoryModal } from '@/features/estoque/HistoryModal';
import { MaterialsTable } from '@/features/estoque/MaterialsTable';
import { ManageModal } from './ManageModal';
import { BulkMinimoModal } from './BulkMinimoModal';
import { MergeModal } from './MergeModal';
import { exportMaterialsToWord } from './exportWord';
import { api } from '@/lib/api';
import { naUnidade } from '@/store/unidade';
import type { Material, MaterialMovement, StaffUser } from '@/shared/types';
import { formatNumber, stockStatus } from '@/features/estoque/utils';
import { CATEGORIES } from '@/shared/constants';
import { buscaInicial } from '@/store/busca';

/**
 * Filtros por situação. TRANSFERIR é avaliado da ótica da Obra: são os itens
 * que faltam lá mas existem na Central — resolvem-se com remessa, não com compra.
 */
type StatusFilter = 'TODOS' | 'RUPTURA' | 'ABAIXO' | 'TRANSFERIR';

const STATUS_FILTERS: { value: StatusFilter; label: string; tone: string }[] = [
  { value: 'TODOS', label: 'Todos', tone: 'text-[var(--text)]' },
  { value: 'RUPTURA', label: 'Sem estoque', tone: 'text-rose-500' },
  { value: 'ABAIXO', label: 'Abaixo do mínimo', tone: 'text-[var(--brand)]' },
  { value: 'TRANSFERIR', label: 'Tem na Central', tone: 'text-sky-500' },
];

function matchesStatusFilter(m: Material, filter: StatusFilter): boolean {
  if (filter === 'TODOS') return true;
  if (filter === 'TRANSFERIR') return stockStatus(m, 'obra') === 'TRANSFERIR';
  return stockStatus(m, 'empresa') === filter;
}

interface AdminProps {
  materials: Material[];
  materialMovements: MaterialMovement[];
  staff: StaffUser[];
  refetch: () => Promise<void>;
}

const emptyForm = {
  nome: '',
  categoria: CATEGORIES[0] as string,
  unidade_medida: '',
  qtd_volumes: '',
  fator_multiplicador: '1',
  estoque_minimo: '0',
};

export function Admin({ materials, materialMovements, staff, refetch }: AdminProps) {
  const [form, setForm] = useState(emptyForm);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('TODOS');
  const [categoria, setCategoria] = useState('TODAS');
  // Vem preenchido quando a pessoa escolheu um material na busca ⌘K.
  const [search, setSearch] = useState(buscaInicial);
  const [manageMaterial, setManageMaterial] = useState<Material | null>(null);
  const [historyMaterial, setHistoryMaterial] = useState<Material | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMinimoOpen, setBulkMinimoOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const similarMaterials = useMemo(() => {
    const q = form.nome.trim().toLowerCase();
    if (q.length <= 2) return [];
    return materials.filter((m) => m.nome.toLowerCase().includes(q));
  }, [materials, form.nome]);

  const visibleMaterials = useMemo(() => {
    let list = materials;
    if (categoria !== 'TODAS') list = list.filter((m) => m.categoria === categoria);
    list = list.filter((m) => matchesStatusFilter(m, filter));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.nome.toLowerCase().includes(q) || m.categoria.toLowerCase().includes(q));
    }
    return list;
  }, [materials, filter, categoria, search]);

  /** Contagem por situação, respeitando a categoria escolhida mas não o filtro atual. */
  const statusCounts = useMemo(() => {
    const base = categoria === 'TODAS' ? materials : materials.filter((m) => m.categoria === categoria);
    return {
      TODOS: base.length,
      RUPTURA: base.filter((m) => stockStatus(m, 'empresa') === 'RUPTURA').length,
      ABAIXO: base.filter((m) => stockStatus(m, 'empresa') === 'ABAIXO').length,
      TRANSFERIR: base.filter((m) => stockStatus(m, 'obra') === 'TRANSFERIR').length,
    } satisfies Record<StatusFilter, number>;
  }, [materials, categoria]);

  const saldoCalculado = (Number(form.qtd_volumes) || 0) * (Number(form.fator_multiplicador) || 0);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome || !form.unidade_medida || form.qtd_volumes === '') {
      return toast.error('Preencha nome, unidade e quantidade de volumes.');
    }
    if (similarMaterials.length > 0 && !allowDuplicate) {
      return toast.error('Existem materiais parecidos cadastrados. Marque a confirmação para prosseguir.');
    }
    setCreating(true);
    try {
      await api.post('/api/materials', naUnidade({
        nome: form.nome,
        categoria: form.categoria,
        unidade_medida: form.unidade_medida,
        qtd_volumes: Number(form.qtd_volumes),
        fator_multiplicador: Number(form.fator_multiplicador),
        estoque_minimo: Number(form.estoque_minimo),
      }));
      toast.success('Material cadastrado com sucesso.');
      setForm(emptyForm);
      setAllowDuplicate(false);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar material.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/api/materials/${id}`);
      toast.success('Material excluído.');
      setDeletingId(null);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir material.');
    }
  }

  const selectedMaterials = useMemo(() => materials.filter((m) => selectedIds.has(m.id)), [materials, selectedIds]);

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelection() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function handleBulkActionDone() {
    await refetch();
    exitSelection();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Materiais</h1>
          <p className="text-sm text-[var(--text-muted)]">{materials.length} produto(s) cadastrado(s).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectMode ? 'secondary' : 'outline'}
            icon={selectMode ? <X size={15} /> : <CheckSquare size={15} />}
            onClick={toggleSelectMode}
          >
            {selectMode ? 'Cancelar Seleção' : 'Selecionar Múltiplos'}
          </Button>
          <Button variant="outline" icon={<FileDown size={15} />} onClick={() => exportMaterialsToWord(materials)}>
            Exportar Word
          </Button>
          <Button variant="outline" icon={<Clock size={15} />} onClick={() => setAuditOpen(true)}>
            Auditoria Geral
          </Button>
        </div>
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="sticky top-[72px] z-30 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-4 py-3 shadow-sm">
          <span className="text-sm font-bold text-[var(--brand)]">{selectedIds.size} selecionado(s)</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={<SlidersHorizontal size={14} />} onClick={() => setBulkMinimoOpen(true)}>
              Definir Mínimo
            </Button>
            <Button
              variant="accent"
              size="sm"
              icon={<Merge size={14} />}
              disabled={selectedIds.size < 2}
              onClick={() => setMergeOpen(true)}
            >
              Unificar
            </Button>
            <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={exitSelection}>
              Limpar
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2 h-fit">
          <p className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <Plus size={16} /> Cadastrar Material
          </p>
          <form onSubmit={handleCreate} className="space-y-4">
            <Input label="Nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />

            {similarMaterials.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="flex items-center gap-1.5 font-bold">
                  <ShieldAlert size={14} /> Materiais parecidos encontrados
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {similarMaterials.slice(0, 3).map((m) => (
                    <li key={m.id}>
                      &bull; {m.nome} (Saldo Central: {formatNumber(m.saldo_central)})
                    </li>
                  ))}
                  {similarMaterials.length > 3 && <li>+{similarMaterials.length - 3} mais</li>}
                </ul>
                <label className="mt-2 flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} />
                  Estou ciente e desejo cadastrar mesmo assim
                </label>
              </div>
            )}

            <Select label="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>

            <Input
              label="Unidade de Medida"
              required
              placeholder="UN, CX, KG..."
              value={form.unidade_medida}
              onChange={(e) => setForm({ ...form, unidade_medida: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Qtd. Volumes"
                required
                type="number"
                step="0.01"
                value={form.qtd_volumes}
                onChange={(e) => setForm({ ...form, qtd_volumes: e.target.value })}
              />
              <Input
                label="Fator Multiplicador"
                type="number"
                step="0.01"
                value={form.fator_multiplicador}
                onChange={(e) => setForm({ ...form, fator_multiplicador: e.target.value })}
              />
            </div>

            <Input
              label="Estoque Mínimo"
              type="number"
              step="0.01"
              value={form.estoque_minimo}
              onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
            />

            <div className="rounded-lg bg-[var(--brand)]/10 px-3 py-2 text-xs font-semibold text-[var(--brand)]">
              Saldo Calculado: {formatNumber(saldoCalculado)} {form.unidade_medida}
            </div>

            <Button type="submit" fullWidth loading={creating}>
              Cadastrar Material
            </Button>
          </form>
        </Card>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar material..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
              />
            </div>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
            >
              <option value="TODAS">Todas as categorias</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => {
              const active = filter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    active
                      ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                      : `border-[var(--border)] bg-[var(--surface)] ${f.tone} hover:border-[var(--brand)]/50`
                  }`}
                >
                  {f.label}
                  <span className={active ? 'ml-1.5 opacity-80' : 'ml-1.5 text-[var(--text-muted)]'}>
                    {statusCounts[f.value]}
                  </span>
                </button>
              );
            })}
          </div>

          <Card className="max-h-[640px] overflow-y-auto">
            {visibleMaterials.length > 0 ? (
              <MaterialsTable
                materials={visibleMaterials}
                // Com o filtro de remessa ativo, o status faz sentido pela ótica da Obra.
                scope={filter === 'TRANSFERIR' ? 'obra' : 'empresa'}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelected}
                onHistory={setHistoryMaterial}
                onManage={setManageMaterial}
                onDelete={handleDelete}
              />
            ) : (
              <EmptyState
                icon={<Search size={20} />}
                title="Nenhum material encontrado"
                subtitle="Ajuste a busca, a categoria ou o filtro de situação."
              />
            )}
          </Card>
        </div>
      </div>

      <ManageModal key={manageMaterial?.id ?? 'none'} material={manageMaterial} onClose={() => setManageMaterial(null)} onUpdated={refetch} />
      <HistoryModal material={historyMaterial} movements={materialMovements} staff={staff} onClose={() => setHistoryMaterial(null)} />
      <AuditModal
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        movements={materialMovements}
        materials={materials}
        staff={staff}
        typeOptions={['ENTRADA_CENTRAL', 'SAIDA', 'REMESSA_OBRA', 'DEVOLUCAO_CENTRAL', 'CONSUMO_OBRA', 'AJUSTE_CENTRAL', 'AJUSTE_OBRA', 'UNIFICACAO', 'EXCLUSÃO']}
        exportFilename="auditoria-geral-estoque"
        title="Auditoria Geral"
      />
      <BulkMinimoModal
        open={bulkMinimoOpen}
        materials={selectedMaterials}
        onClose={() => setBulkMinimoOpen(false)}
        onDone={handleBulkActionDone}
      />
      <MergeModal open={mergeOpen} materials={selectedMaterials} onClose={() => setMergeOpen(false)} onDone={handleBulkActionDone} />
    </div>
  );
}
