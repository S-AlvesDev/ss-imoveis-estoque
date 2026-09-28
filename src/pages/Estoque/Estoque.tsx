import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, ClipboardList, Clock, LayoutGrid, ListChecks, Search, Warehouse } from 'lucide-react';
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
import { MovementForm, type MovimentoPayload } from '@/features/estoque/MovementForm';
import { Recontagem } from '@/features/estoque/Recontagem';
import { NaoRecontados } from '@/features/estoque/NaoRecontados';
import { ManageModal } from '@/pages/Admin/ManageModal';
import { useAuth } from '@/store/auth';
import { ADMIN_ROLES } from '@/shared/constants';
import { api } from '@/lib/api';
import type { Deposito, Material, MaterialMovement, StaffUser } from '@/shared/types';
import { formatNumber, ondeTem, saldoEm, stockStatus } from '@/features/estoque/utils';
import { MODO_LABELS } from '@/shared/constants';
import { buscaInicial } from '@/store/busca';

interface EstoqueProps {
  /** O estoque desta tela. */
  deposito: Deposito;
  /** Todos os estoques ativos da unidade em uso — para transferir e para olhar o saldo dos outros. */
  depositosDaUnidade: Deposito[];
  materials: Material[];
  materialMovements: MaterialMovement[];
  staff: StaffUser[];
  categorias: string[];
  refetch: () => Promise<void>;
  /** Falso = só consulta: vê o estoque, não registra nada. */
  podeOperar: boolean;
}

/**
 * A tela de um estoque no modo almoxarifado. Era "Almoxarifado Central" e
 * "Almoxarifado de Obra", duas telas quase iguais; agora é uma, e o estoque
 * é quem a parametriza: nome, saldo, para onde dá para transferir.
 */
export function Estoque({ deposito, depositosDaUnidade, materials, materialMovements, staff, categorias, refetch, podeOperar }: EstoqueProps) {
  const [category, setCategory] = useState<string>('TODAS');
  const [olhando, setOlhando] = useState<string>(deposito.id);
  const [stockSearch, setStockSearch] = useState(buscaInicial); // preenchido pela busca ⌘K
  const [historyMaterial, setHistoryMaterial] = useState<Material | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [recontagemOpen, setRecontagemOpen] = useState(false);
  // O que falta conferir é pergunta de gestão: CEO, Administrador, Administrativo.
  const usuario = useAuth((s) => s.user);
  const ehGestao = !!usuario && ADMIN_ROLES.includes(usuario.role);
  const [naoRecontadosOpen, setNaoRecontadosOpen] = useState(false);
  const [editando, setEditando] = useState<Material | null>(null);

  const outros = useMemo(() => depositosDaUnidade.filter((d) => d.id !== deposito.id && d.ativo), [depositosDaUnidade, deposito.id]);
  const olhandoDeposito = depositosDaUnidade.find((d) => d.id === olhando) ?? deposito;

  // Movimentações que encostaram neste estoque (as antigas, sem depósito, ficam de fora).
  const movimentosDaqui = useMemo(
    () =>
      materialMovements.filter((m) => {
        const mm = m as MaterialMovement & { warehouse_origem_id?: string | null; warehouse_destino_id?: string | null };
        return mm.warehouse_origem_id === deposito.id || mm.warehouse_destino_id === deposito.id;
      }),
    [materialMovements, deposito.id],
  );

  const stats = useMemo(() => {
    const semEstoque = materials.filter((m) => stockStatus(m, deposito.id) === 'RUPTURA').length;
    const temEmOutro = materials.filter((m) => stockStatus(m, deposito.id) === 'TRANSFERIR').length;
    return { total: materials.length, semEstoque, temEmOutro, movimentos: movimentosDaqui.length };
  }, [materials, movimentosDaqui, deposito.id]);

  const categorized = useMemo(
    () =>
      categorias.map((cat) => ({
        cat,
        items: materials.filter((m) => m.categoria === cat),
        criticos: materials.filter((m) => m.categoria === cat && stockStatus(m, deposito.id) === 'RUPTURA').length,
      })),
    [materials, categorias, deposito.id],
  );

  const filteredMaterials = useMemo(() => (category === 'TODAS' ? materials : materials.filter((m) => m.categoria === category)), [materials, category]);

  const stockListMaterials = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    return q ? filteredMaterials.filter((m) => m.nome.toLowerCase().includes(q)) : filteredMaterials;
  }, [filteredMaterials, stockSearch]);

  async function handleMovement(payload: MovimentoPayload) {
    await api.post(`/api/estoques/${deposito.id}/movimentacoes`, payload);
    await refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-[var(--text)]">{deposito.nome}</h1>
          <p className="text-sm text-[var(--text-muted)]">{MODO_LABELS[deposito.modo]?.descricao}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ehGestao && deposito.modo === 'almoxarifado' && (
            <Button variant="outline" icon={<ListChecks size={16} />} onClick={() => setNaoRecontadosOpen(true)}>
              Falta recontar
            </Button>
          )}
          {podeOperar ? (
            <Button variant="accent" icon={<ClipboardCheck size={16} />} onClick={() => setRecontagemOpen(true)}>
              Recontagem Rápida
            </Button>
          ) : (
            <Badge variant="neutral">Só consulta</Badge>
          )}
        </div>
      </div>

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <RevealItem>
          <StatCard label="Materiais" value={stats.total} icon={<LayoutGrid size={20} />} accent="blue" sublabel="que esta unidade trabalha" />
        </RevealItem>
        <RevealItem>
          <StatCard
            label="Sem estoque aqui"
            value={stats.semEstoque}
            icon={<AlertTriangle size={20} />}
            accent="red"
            sublabel={stats.temEmOutro > 0 ? `+${stats.temEmOutro} disponíveis em outro estoque` : 'zerados em toda a unidade'}
          />
        </RevealItem>
        <RevealItem>
          <StatCard label="Movimentações" value={stats.movimentos} icon={<ClipboardList size={20} />} accent="violet" sublabel="neste estoque" onClick={() => setAuditOpen(true)} />
        </RevealItem>
      </Reveal>

      {categorized.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Categorias</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categorized.map(({ cat, items, criticos }) => (
              <button
                key={cat}
                onClick={() => setCategory(category === cat ? 'TODAS' : cat)}
                className={`relative overflow-hidden rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                  category === cat ? 'border-[var(--brand)] bg-[var(--brand)]/10' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]/50'
                }`}
              >
                {category === cat && <Stripes className="absolute inset-x-0 top-0 h-1" color="var(--brand)" dense />}
                <p className="truncate text-xs font-bold text-[var(--text)]">{cat}</p>
                <p className="mt-1 text-lg font-bold text-[var(--text)]">{items.length}</p>
                {criticos > 0 && (
                  <Badge variant="critical" dot>
                    {criticos} Crítico(s)
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-bold text-[var(--text)]">Registrar movimentação</p>
          {podeOperar ? (
            <MovementForm materials={filteredMaterials} deposito={deposito} outrosEstoques={outros.filter((d) => d.modo !== 'patrimonio')} onSubmit={handleMovement} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Você tem acesso de consulta a este estoque. Para registrar movimentações, peça ao administrador o nível “Opera” em Configurações.
            </p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-[var(--text)]">Estoque atual</p>
            {depositosDaUnidade.length > 1 && (
              <SegmentedControl
                value={olhando}
                onChange={setOlhando}
                layoutId={`estoque-${deposito.id}-view`}
                options={depositosDaUnidade.filter((d) => d.ativo).map((d) => ({ value: d.id, label: d.nome }))}
              />
            )}
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

          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {stockListMaterials.map((m) => {
              const saldo = saldoEm(m, olhandoDeposito.id);
              const status = stockStatus(m, olhandoDeposito.id);
              return (
                <div key={m.id} className="group rounded-lg px-3 py-2.5 hover:bg-[var(--bg-2)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">{m.nome}</p>
                    <span className={`shrink-0 text-sm font-bold tabular-nums ${status === 'RUPTURA' ? 'text-[var(--vermelho)]' : 'text-[var(--text)]'}`}>
                      {formatNumber(saldo)} <span className="text-[10px] font-medium text-[var(--text-muted)]">{m.unidade_medida}</span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-[11px] text-[var(--text-muted)]">{m.categoria}</p>
                      <StockStatusBadge status={status} scope={olhandoDeposito.id} ondeTem={status === 'TRANSFERIR' ? ondeTem(m, depositosDaUnidade, olhandoDeposito.id) : undefined} />
                    </div>
                    <button
                      onClick={() => setHistoryMaterial(m)}
                      className="shrink-0 rounded-full p-1.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-2)] hover:text-[var(--text)] group-hover:opacity-100"
                      title="Histórico"
                    >
                      <Clock size={15} />
                    </button>
                  </div>
                  {/* O mínimo é da unidade, então a barra mede o total dela, não só este estoque —
                      o marcador mostra onde o saldo local cai nessa mesma escala (BUG-12). */}
                  <StockBar saldo={m.saldo_unidade} minimo={m.estoque_minimo} marker={saldo} className="mt-1.5" />
                </div>
              );
            })}
            {stockListMaterials.length === 0 && <EmptyState icon={<Warehouse size={20} />} title="Nenhum material encontrado" />}
          </div>
        </Card>
      </div>

      <HistoryModal material={historyMaterial} movements={materialMovements} staff={staff} onClose={() => setHistoryMaterial(null)} />
      <AuditModal
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        movements={movimentosDaqui}
        materials={materials}
        staff={staff}
        typeOptions={['ENTRADA', 'SAIDA', 'CONSUMO', 'TRANSFERENCIA', 'AJUSTE', 'ENTRADA_CENTRAL', 'REMESSA_OBRA', 'DEVOLUCAO_CENTRAL', 'CONSUMO_OBRA', 'AJUSTE_CENTRAL', 'AJUSTE_OBRA', 'EXCLUSÃO']}
        exportFilename={`auditoria-${deposito.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        title={`Auditoria — ${deposito.nome}`}
      />
      {ehGestao && (
        <NaoRecontados
          open={naoRecontadosOpen}
          onClose={() => setNaoRecontadosOpen(false)}
          deposito={deposito}
          materials={materials}
          onEditar={(m) => setEditando(m)}
          refetch={refetch}
        />
      )}
      {editando && <ManageModal material={editando} categorias={categorias} depositos={depositosDaUnidade} onClose={() => setEditando(null)} onUpdated={refetch} />}
      <Recontagem open={recontagemOpen} onClose={() => setRecontagemOpen(false)} deposito={deposito} categorias={categorias} materials={materials} refetch={refetch} />
    </div>
  );
}
