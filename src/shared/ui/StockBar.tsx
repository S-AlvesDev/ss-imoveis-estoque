import { motion } from 'motion/react';

interface StockBarProps {
  saldo: number;
  minimo: number;
  className?: string;
}

/** Slim health bar: saldo relative to the minimum threshold, color-coded. */
export function StockBar({ saldo, minimo, className = '' }: StockBarProps) {
  const safeSaldo = Math.max(saldo, 0);
  const reference = Math.max(minimo * 2.5, safeSaldo, 1);
  const pct = Math.min(100, (safeSaldo / reference) * 100);

  const status = saldo <= minimo ? 'critical' : saldo <= minimo * 1.5 ? 'warning' : 'healthy';
  const barColor = { critical: '#e11d48', warning: '#f59e0b', healthy: '#059669' }[status];

  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: barColor }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}
