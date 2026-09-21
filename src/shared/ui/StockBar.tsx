import { motion } from 'motion/react';

interface StockBarProps {
  saldo: number;
  minimo: number;
  className?: string;
  /**
   * Quando a barra mede o total da unidade mas a tela mostra um estoque
   * específico dela, um marcador aqui indica onde o saldo LOCAL cai dentro
   * dessa mesma escala — sem isso, "0 aqui" e barra cheia (do total) se lê
   * como saldo cheio aqui.
   */
  marker?: number;
}

/** Slim health bar: saldo relative to the minimum threshold, color-coded. */
export function StockBar({ saldo, minimo, className = '', marker }: StockBarProps) {
  const safeSaldo = Math.max(saldo, 0);
  const reference = Math.max(minimo * 2.5, safeSaldo, 1);
  const pct = Math.min(100, (safeSaldo / reference) * 100);
  const markerPct = marker !== undefined ? Math.min(100, (Math.max(marker, 0) / reference) * 100) : null;

  const status = saldo <= minimo ? 'critical' : saldo <= minimo * 1.5 ? 'warning' : 'healthy';
  const barColor = { critical: '#e11d48', warning: '#f59e0b', healthy: '#059669' }[status];

  return (
    <div className={`relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)] ${className}`}>
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: barColor }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
      {markerPct !== null && (
        <div
          className="absolute top-0 h-full w-0.5 bg-[var(--text)]/70"
          style={{ left: `${markerPct}%` }}
          title="Saldo neste estoque"
        />
      )}
    </div>
  );
}
