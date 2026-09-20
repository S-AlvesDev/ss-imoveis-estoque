import { type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * A identidade da IA na interface: a mesma faísca, um lavanda discreto, e
 * nada gritando. Onde a IA classificou, resumiu, sugeriu ou está lendo, é
 * um destes três: o selo (uma pílula), o bloco (uma caixa com borda em
 * gradiente fino) ou o "pensando" (os três pontos).
 */

/** ✨ Sugestão da IA — a pílula. */
export function SeloIa({ children, tamanho = 'sm', className = '' }: { children: ReactNode; tamanho?: 'sm' | 'md'; className?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full bg-[var(--brand-soft)] font-semibold text-[var(--brand-ink)] ${tamanho === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs'} ${className}`}>
      <Sparkles size={tamanho === 'sm' ? 11 : 13} className="shrink-0 text-[var(--brand)]" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** O título de um bloco da IA: faísca + texto miúdo em caixa alta. */
export function TituloIa({ children, acoes, className = '' }: { children: ReactNode; acoes?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
        <Sparkles size={12} /> {children}
      </p>
      {acoes}
    </div>
  );
}

/** A caixa da IA: borda em gradiente fino, fundo branco. */
export function BlocoIa({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`borda-ia rounded-xl p-3.5 ${className}`}>{children}</div>;
}

/** "IA analisando conversa" — os três pontos que pulsam. */
export function PensandoIa({ texto = 'IA analisando a conversa', className = '' }: { texto?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium text-[var(--brand-ink)] ${className}`} role="status">
      <Sparkles size={13} className="text-[var(--brand)]" />
      {texto}
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        <span className="ponto-ia h-1 w-1 rounded-full bg-[var(--brand)]" />
        <span className="ponto-ia h-1 w-1 rounded-full bg-[var(--brand)]" />
        <span className="ponto-ia h-1 w-1 rounded-full bg-[var(--brand)]" />
      </span>
    </span>
  );
}

/** A confiança da IA em porcentagem, com uma barrinha. */
export function Confianca({ valor, className = '' }: { valor: number; className?: string }) {
  const pct = Math.round(valor * 100);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] tabular-nums text-[var(--text-muted)] ${className}`} title={`${pct}% de confiança`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--bg-2)]">
        <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}
