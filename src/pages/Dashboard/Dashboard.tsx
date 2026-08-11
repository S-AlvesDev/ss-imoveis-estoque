import { useMemo } from 'react';
import { AlertTriangle, ArrowLeftRight, Boxes, Warehouse } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card } from '@/shared/ui/Card';
import { StatCard } from '@/shared/ui/StatCard';
import { Reveal, RevealItem } from '@/shared/ui/Reveal';
import type { Material, MaterialMovement } from '@/shared/types';
import { formatNumber, isCritical } from '@/features/estoque/utils';
import { CATEGORIES } from '@/shared/constants';

const PIE_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#4f46e5', '#64748b'];

export function Dashboard({ materials, materialMovements }: { materials: Material[]; materialMovements: MaterialMovement[] }) {
  const totals = useMemo(() => {
    const saldoCentral = materials.reduce((s, m) => s + Number(m.saldo_central), 0);
    const saldoObra = materials.reduce((s, m) => s + Number(m.saldo_obra), 0);
    const criticos = materials.filter((m) => isCritical(m, 'central')).length;
    return { saldoCentral, saldoObra, criticos };
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
        <h1 className="font-display text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Visão geral do estoque de materiais.</p>
      </div>

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RevealItem>
          <StatCard label="Itens Cadastrados" value={materials.length} icon={<Boxes size={20} />} accent="blue" />
        </RevealItem>
        <RevealItem>
          <StatCard label="Saldo Central" value={totals.saldoCentral} icon={<Warehouse size={20} />} accent="indigo" />
        </RevealItem>
        <RevealItem>
          <StatCard label="Saldo Obra" value={totals.saldoObra} icon={<ArrowLeftRight size={20} />} accent="emerald" />
        </RevealItem>
        <RevealItem>
          <StatCard label="Itens em Alerta" value={totals.criticos} icon={<AlertTriangle size={20} />} accent="rose" />
        </RevealItem>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-bold text-slate-800">Entradas vs. Saídas / Consumo</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={movementChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => formatNumber(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]} fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <p className="mb-4 text-sm font-bold text-slate-800">Materiais por Categoria</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={categoryChart} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                {categoryChart.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5">
        <p className="mb-4 text-sm font-bold text-slate-800">Top 5 Materiais Mais Movimentados</p>
        <div className="space-y-2">
          {topMaterials.map(({ material, total }, i) => (
            <div key={material!.id} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm font-medium text-slate-700">{material!.nome}</span>
              <span className="text-sm font-bold tabular-nums text-slate-900">{formatNumber(total)}</span>
            </div>
          ))}
          {topMaterials.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Sem movimentações registradas ainda.</p>}
        </div>
      </Card>
    </div>
  );
}
