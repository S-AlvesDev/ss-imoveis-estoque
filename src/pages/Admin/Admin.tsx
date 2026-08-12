import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, CheckSquare, Clock, FileDown, Merge, Pencil, Plus, Search, ShieldAlert, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { StockBar } from '@/shared/ui/StockBar';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { AuditModal } from '@/features/estoque/AuditModal';
import { HistoryModal } from '@/features/estoque/HistoryModal';
import { ManageModal } from './ManageModal';
import { BulkMinimoModal } from './BulkMinimoModal';
import { MergeModal } from './MergeModal';
import { exportMaterialsToWord } from './exportWord';
import { api } from '@/lib/api';
import type { Material, MaterialMovement, StaffUser } from '@/shared/types';
import { formatNumber, isCritical } from '@/features/estoque/utils';
import { CATEGORIES } from '@/shared/constants';

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
  const [filter, setFilter] = useState<'TODOS' | 'CRITICO'>('TODOS');
  const [search, setSearch] = useState('');
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
    if (filter === 'CRITICO') list = list.filter((m) => isCritical(m, 'central'));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.nome.toLowerCase().includes(q) || m.categoria.toLowerCase().includes(q));
    }
    return list;
  }, [materials, filter, search]);

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
      await api.post('/api/materials', {
        nome: form.nome,
        categoria: form.categoria,
        unidade_medida: form.unidade_medida,
        qtd_volumes: Number(form.qtd_volumes),
        fator_multiplicador: Number(form.fator_multiplicador),
        estoque_minimo: Number(form.estoque_minimo),
      });
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
          <h1 className="font-display text-2xl font-bold text-slate-900">Materiais</h1>
          <p className="text-sm text-slate-500">{materials.length} produto(s) cadastrado(s).</p>
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
        <div className="sticky top-[72px] z-30 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
          <span className="text-sm font-bold text-blue-800">{selectedIds.size} selecionado(s)</span>
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
          <p className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800">
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

            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
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
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar material..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              />
            </div>
            <SegmentedControl
              value={filter}
              onChange={setFilter}
              layoutId="admin-filter-pill"
              options={[
                { value: 'TODOS', label: 'Todos' },
                { value: 'CRITICO', label: 'Estoque Crítico', activeClassName: 'text-rose-600' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-h-[640px] overflow-y-auto pr-1">
            {visibleMaterials.map((m) => {
              const critical = isCritical(m, 'central');
              const selected = selectedIds.has(m.id);
              return (
                <Card
                  key={m.id}
                  onClick={selectMode ? () => toggleSelected(m.id) : undefined}
                  className={`p-4 ${selectMode ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-blue-500 border-blue-300' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      {selectMode && (
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                            selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-transparent'
                          }`}
                        >
                          <Check size={13} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{m.nome}</p>
                        <p className="text-[11px] text-slate-400">{m.categoria}</p>
                      </div>
                    </div>
                    {critical && <Badge variant="critical" dot>Crítico</Badge>}
                  </div>

                  <StockBar saldo={m.saldo_central} minimo={m.estoque_minimo} className="mt-3" />

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-slate-400">Central</p>
                      <p className="font-bold text-slate-800">
                        {formatNumber(m.saldo_central)} {m.unidade_medida}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-slate-400">Obra</p>
                      <p className="font-bold text-slate-800">
                        {formatNumber(m.saldo_obra)} {m.unidade_medida}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[11px] text-slate-400">Mín: {formatNumber(m.estoque_minimo)}</p>
                    {!selectMode && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setHistoryMaterial(m)}
                          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Histórico"
                        >
                          <Clock size={15} />
                        </button>
                        <button
                          onClick={() => setManageMaterial(m)}
                          className="rounded-full p-1.5 text-blue-500 hover:bg-blue-50"
                          title="Gerenciar"
                        >
                          <Pencil size={15} />
                        </button>
                        {deletingId === m.id ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold">
                            <button onClick={() => handleDelete(m.id)} className="text-rose-600 hover:underline">
                              Sim
                            </button>
                            <span className="text-slate-300">/</span>
                            <button onClick={() => setDeletingId(null)} className="text-slate-400 hover:underline">
                              Não
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeletingId(m.id)}
                            className="rounded-full p-1.5 text-rose-400 hover:bg-rose-50"
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
            {visibleMaterials.length === 0 && (
              <EmptyState className="col-span-2" icon={<Search size={20} />} title="Nenhum material encontrado" />
            )}
          </div>
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
