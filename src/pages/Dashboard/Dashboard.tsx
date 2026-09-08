import { useMemo } from 'react';
import { AlertTriangle, ArrowLeftRight, Boxes, Warehouse } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/shared/ui/Card';
import { StatCard } from '@/shared/ui/StatCard';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import type { Material, MaterialMovement } from '@/shared/types';
import { formatNumber, needsPurchase, stockStatus } from '@/features/estoque/utils';
import { CATEGORIES } from '@/shared/constants';
import { useTheme } from '@/store/theme';

const PIE_COLORS = ['#ff8e29', '#27d095', '#67cadf', '#dc2626', '#4f46e5', '#6f757e'];

export function Dashboard({ materials, materialMovements }: { materials: Material[]; materialMovements: MaterialMovement[] }) {
  const dark = useTheme((s) => s.theme === 'dark');
  const grid = dark ? '#353c56' : '#e2e8f0';
  const axis = dark ? '#c7cad0' : '#64748b';
  const tooltipStyle = {
    borderRadius: 10,
    fontSize: 12,
    background: dark ? '#292f45' : '#ffffff',
    border: `1px solid ${dark ? '#353c56' : '#e2e8f0'}`,
    color: dark ? '#f3f4f7' : '#0f172a',
  };

  const totals = useMemo(() => {
    const saldoCentral = materials.reduce((s, m) => s + Number(m.saldo_central), 0);
    const saldoObra = materials.reduce((s, m) => s + Number(m.saldo_obra), 0);
    // Comprar e transferir são problemas diferentes: só o primeiro é falta de verdade.
    const comprar = materials.filter(needsPurchase).length;
    const remessa = materials.filter((m) => stockStatus(m, 'obra') === 'TRANSFERIR').length;
    return { saldoCentral, saldoObra, comprar, remessa };
  }, [materials]);

  const movementChart = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const m of materialMovements) {
      if (m.tipo_operacao.includes('ENTRADA') || m.tipo_operacao.includes('DEVOLUCAO')) entradas += Math.abs(m.quantidade);
      if (m.tipo_operacao.includes('SAIDA') || m.tipo_operacao.includes('CONSUMO')) saidas += Math.abs(m.quantidade);
    }
    return [
      { name: 'Entradas', valor: entradas },
      { name: 'Saídas / Consumo', valor: saidas },
    ];
  }, [materialMovements]);

  const categoryChart = useMemo(() => {
    return CATEGORIES.map((cat) => ({ name: cat, value: materials.filter((m) => m.categoria === cat).length })).filter(
      (c) => c.value > 0
    );
  }, [materials]);

  const topMaterials = useMemo(() => {
    const totalsByMaterial = new Map<number, number>();
    for (const m of materialMovements) {
      if (!m.material_id) continue;
      totalsByMaterial.set(m.material_id, (totalsByMaterial.get(m.material_id) || 0) + Math.abs(m.quantidade));
    }
    return [...totalsByMaterial.entries()]
      .map(([id, total]) => ({ material: materials.find((m) => m.id === id), total }))
      .filter((x) => x.material)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [materialMovements, materials]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Dashboard</h1>
        <p className="text-sm text-[var(--text-muted)]">Visão geral do estoque de materiais.</p>
      </div>

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RevealItem>
          <StatCard label="Itens Cadastrados" value={materials.length} icon={<Boxes size={20} />} accent="amber" />
        </RevealItem>
        <RevealItem>
          <StatCard label="Saldo Central" value={totals.saldoCentral} icon={<Warehouse size={20} />} accent="cyan" />
        </RevealItem>
        <RevealItem>
          <StatCard label="Saldo Obra" value={totals.saldoObra} icon={<ArrowLeftRight size={20} />} accent="emerald" />
        </RevealItem>
        <RevealItem>
          <StatCard
            label="Precisa Comprar"
            value={totals.comprar}
            icon={<AlertTriangle size={20} />}
            accent="rose"
            sublabel={totals.remessa > 0 ? `+${totals.remessa} só precisam de remessa` : undefined}
          />
        </RevealItem>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-bold text-[var(--text)]">Entradas vs. Saídas / Consumo</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={movementChart} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: axis }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: axis }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => formatNumber(Number(v))}
                contentStyle={tooltipStyle}
                cursor={{ fill: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }}
              />
              <Bar dataKey="valor" radius={[8, 8, 0, 0]} maxBarSize={90}>
                {movementChart.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#27d095' : '#ff8e29'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <p className="mb-4 text-sm font-bold text-[var(--text)]">Materiais por Categoria</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={categoryChart} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                {categoryChart.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: axis }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5">
        <p className="mb-4 text-sm font-bold text-[var(--text)]">Top 5 Materiais Mais Movimentados</p>
        <div className="space-y-2">
          {topMaterials.map(({ material, total }, i) => (
            <div key={material!.id} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/15 text-[11px] font-bold text-[var(--brand)]">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm font-medium text-[var(--text)]">{material!.nome}</span>
              <span className="text-sm font-bold tabular-nums text-[var(--text)]">{formatNumber(total)}</span>
            </div>
          ))}
          {topMaterials.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">Sem movimentações registradas ainda.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
