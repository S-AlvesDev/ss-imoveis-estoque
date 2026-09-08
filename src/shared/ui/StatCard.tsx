import { type ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from './Card';
import { AnimatedNumber } from './AnimatedNumber';
import { formatNumber } from '@/features/estoque/utils';

type Accent = 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate' | 'cyan';

const accentMap: Record<Accent, string> = {
  blue: 'bg-blue-500 text-white',
  emerald: 'bg-emerald-500 text-white',
  amber: 'bg-[var(--brand)] text-white',
  rose: 'bg-rose-500 text-white',
  indigo: 'bg-indigo-500 text-white',
  slate: 'bg-slate-500 text-white',
  cyan: 'bg-[var(--brand-tertiary)] text-white',
};

interface StatCardProps {
  label: string;
  value: number | ReactNode;
  icon: ReactNode;
  accent?: Accent;
  sublabel?: ReactNode;
  trend?: { value: number; label?: string };
  onClick?: () => void;
}

export function StatCard({ label, value, icon, accent = 'blue', sublabel, trend, onClick }: StatCardProps) {
  const up = (trend?.value ?? 0) >= 0;
  return (
    <Card
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      className={`group relative flex items-start gap-4 overflow-hidden p-5 ${
        onClick
          ? 'cursor-pointer transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40'
          : ''
      }`}
    >
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12 ${accentMap[accent]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        <p className="font-display mt-1 text-xl font-bold tabular-nums text-[var(--text)] xl:text-2xl">
          {typeof value === 'number' ? <AnimatedNumber value={value} formatter={(n) => formatNumber(n)} /> : value}
        </p>
        {trend ? (
          <p
            className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${
              up ? 'text-emerald-500' : 'text-rose-500'
            }`}
          >
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(trend.value)}%{trend.label ? <span className="font-medium text-[var(--text-muted)]"> {trend.label}</span> : null}
          </p>
        ) : (
          sublabel && <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">{sublabel}</p>
        )}
      </div>
    </Card>
  );
}
