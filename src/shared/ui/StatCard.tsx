import { type ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from './Card';
import { AnimatedNumber } from './AnimatedNumber';
import { Sparkline } from './Sparkline';
import { formatNumber } from '@/features/estoque/utils';

/**
 * As cores dos tiles. "brand" é a da marca (a organização pode trocar);
 * as outras são fixas e semânticas — azul de saldo, verde de obra, vermelho
 * de alerta. Os nomes antigos continuam valendo para quem ainda os usa.
 */
type Accent = 'brand' | 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'slate' | 'emerald' | 'rose' | 'indigo' | 'cyan';

const ACCENT: Record<Accent, { tile: string; cor: string }> = {
  brand: { tile: 'bg-[var(--brand)] shadow-[var(--brand)]/40', cor: 'var(--brand)' },
  blue: { tile: 'bg-[var(--azul)] shadow-[var(--azul)]/40', cor: 'var(--azul)' },
  green: { tile: 'bg-[var(--verde)] shadow-[var(--verde)]/40', cor: 'var(--verde)' },
  red: { tile: 'bg-[var(--vermelho)] shadow-[var(--vermelho)]/40', cor: 'var(--vermelho)' },
  amber: { tile: 'bg-[var(--brand)] shadow-[var(--brand)]/40', cor: 'var(--brand)' },
  violet: { tile: 'bg-[var(--roxo)] shadow-[var(--roxo)]/40', cor: 'var(--roxo)' },
  slate: { tile: 'bg-slate-500 shadow-slate-500/40', cor: '#64748b' },
  emerald: { tile: 'bg-[var(--verde)] shadow-[var(--verde)]/40', cor: 'var(--verde)' },
  rose: { tile: 'bg-[var(--vermelho)] shadow-[var(--vermelho)]/40', cor: 'var(--vermelho)' },
  indigo: { tile: 'bg-[var(--roxo)] shadow-[var(--roxo)]/40', cor: 'var(--roxo)' },
  cyan: { tile: 'bg-[var(--azul)] shadow-[var(--azul)]/40', cor: 'var(--azul)' },
};

interface StatCardProps {
  label: string;
  value: number | ReactNode;
  icon: ReactNode;
  accent?: Accent;
  sublabel?: ReactNode;
  /** Variação em % contra o período anterior; `null` quando não há base de comparação. */
  trend?: { value: number | null; label?: string };
  /** Série curta para a linha miúda à direita (ex.: últimos 7 dias). */
  serie?: number[];
  onClick?: () => void;
}

/**
 * O cartão de resumo do painel: tile colorido com o ícone, rótulo, número
 * grande, tendência embaixo e a sparkline à direita.
 */
export function StatCard({ label, value, icon, accent = 'brand', sublabel, trend, serie, onClick }: StatCardProps) {
  const a = ACCENT[accent];
  const temTrend = trend && trend.value !== null && Number.isFinite(trend.value);
  const up = (trend?.value ?? 0) >= 0;
  return (
    <Card
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      className={`group relative flex items-start gap-3.5 overflow-hidden p-5 ${
        onClick ? 'cursor-pointer transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40' : ''
      }`}
    >
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-lg ${a.tile}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ${serie && serie.length > 1 ? '2xl:pr-20' : ''}`}>{label}</p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text)]">
          {typeof value === 'number' ? <AnimatedNumber value={value} formatter={(n) => formatNumber(n)} /> : value}
        </p>
        <div className="mt-1.5 min-w-0">
          {temTrend ? (
            <p className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap text-[11px] font-semibold ${up ? 'text-[var(--verde)]' : 'text-[var(--vermelho)]'}`}>
              {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {up ? '+' : '−'}
              {Math.abs(Math.round(trend!.value as number))}%
              {trend!.label ? <span className="truncate font-medium text-[var(--text-muted)]"> {trend!.label}</span> : null}
            </p>
          ) : (
            sublabel && <p className="truncate text-[11px] font-medium text-[var(--text-muted)]">{sublabel}</p>
          )}
        </div>
      </div>
      {/* A linha miúda mora no canto superior, ao lado do rótulo — a linha com mais folga. Só em telas largas. */}
      {serie && serie.length > 1 && <Sparkline data={serie} color={a.cor} width={72} height={26} className="absolute right-5 top-4 hidden 2xl:block" />}
    </Card>
  );
}
