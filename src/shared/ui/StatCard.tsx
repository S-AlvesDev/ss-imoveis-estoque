import { type ReactNode } from 'react';
import { Card } from './Card';
import { AnimatedNumber } from './AnimatedNumber';
import { formatNumber } from '@/features/estoque/utils';

type Accent = 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';

const accentMap: Record<Accent, { bg: string; text: string; ring: string; bar: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-600/10', bar: 'from-blue-500 to-blue-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-600/10', bar: 'from-emerald-500 to-emerald-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-600/10', bar: 'from-amber-400 to-amber-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-600/10', bar: 'from-rose-500 to-rose-600' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', ring: 'ring-indigo-600/10', bar: 'from-indigo-500 to-indigo-600' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', ring: 'ring-slate-600/10', bar: 'from-slate-500 to-slate-600' },
};

interface StatCardProps {
  label: string;
  value: number | ReactNode;
  icon: ReactNode;
  accent?: Accent;
  sublabel?: ReactNode;
  onClick?: () => void;
}

export function StatCard({ label, value, icon, accent = 'blue', sublabel, onClick }: StatCardProps) {
  const colors = accentMap[accent];
  return (
    <Card
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      className={`group relative overflow-hidden p-5 flex items-start justify-between gap-4 ${
        onClick ? 'cursor-pointer transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40' : ''
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${colors.bar} origin-left scale-x-0 transition-transform duration-300 ${onClick ? 'group-hover:scale-x-100' : 'scale-x-100 opacity-70'}`}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <p className="font-display mt-2 text-3xl font-bold text-slate-900 tabular-nums truncate">
          {typeof value === 'number' ? <AnimatedNumber value={value} formatter={(n) => formatNumber(n)} /> : value}
        </p>
        {sublabel && <p className="mt-1 text-xs font-medium text-slate-400">{sublabel}</p>}
      </div>
      <div className={`shrink-0 rounded-xl p-3 ring-1 ${colors.bg} ${colors.text} ${colors.ring}`}>{icon}</div>
    </Card>
  );
}
