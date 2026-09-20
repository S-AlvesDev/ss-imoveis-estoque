import { type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Sparkline } from '@/shared/ui/Sparkline';
import { AnimatedNumber } from '@/shared/ui/AnimatedNumber';

/**
 * O cartão de indicador: rótulo em cima, número grande, e embaixo a leitura
 * — a variação contra o período anterior quando ela existe de verdade, ou
 * uma legenda com o contexto. O ícone fica num azulejo lavanda no canto; a
 * sparkline, quando há série, no rodapé.
 */
export type TomDoKpi = 'roxo' | 'azul' | 'verde' | 'ambar' | 'vermelho' | 'cinza';

const TOM: Record<TomDoKpi, { azulejo: string; linha: string }> = {
  roxo: { azulejo: 'bg-[var(--brand-soft)] text-[var(--brand)]', linha: '#7c3aed' },
  azul: { azulejo: 'bg-sky-50 text-sky-600', linha: '#3b82f6' },
  verde: { azulejo: 'bg-emerald-50 text-emerald-600', linha: '#16a34a' },
  ambar: { azulejo: 'bg-amber-50 text-amber-600', linha: '#d97706' },
  vermelho: { azulejo: 'bg-rose-50 text-rose-600', linha: '#e11d48' },
  cinza: { azulejo: 'bg-[var(--bg-2)] text-[var(--text-muted)]', linha: '#8d8bab' },
};

export interface Variacao {
  /** Em %, contra o período anterior; nulo = sem base de comparação. */
  valor: number | null;
  /** "vs. 7 dias anteriores". */
  texto?: string;
  /** Quando subir é ruim (tempo de resposta, fila). */
  invertida?: boolean;
}

interface KpiProps {
  rotulo: string;
  valor: number | string;
  icone: ReactNode;
  tom?: TomDoKpi;
  /** A leitura embaixo, quando não há variação. */
  legenda?: ReactNode;
  variacao?: Variacao;
  serie?: number[];
  /** Sufixo pequeno depois do número: "/10", "%", "min". */
  sufixo?: string;
  onClick?: () => void;
  className?: string;
}

export function Kpi({ rotulo, valor, icone, tom = 'roxo', legenda, variacao, serie, sufixo, onClick, className = '' }: KpiProps) {
  const t = TOM[tom];
  const temVariacao = variacao && variacao.valor !== null && Number.isFinite(variacao.valor);
  const v = Math.round(variacao?.valor ?? 0);
  const boa = variacao?.invertida ? v <= 0 : v >= 0;
  const neutra = v === 0;
  const Seta = neutra ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      className={`group relative flex min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[var(--sombra-cartao)] transition-[transform,box-shadow] sm:p-5 ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(23,21,58,0.3)]' : ''} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 min-w-0 text-xs font-medium leading-4 text-[var(--text-muted)]">{rotulo}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.azulejo}`}>{icone}</span>
      </div>
      <p className="mt-2 flex items-baseline gap-1 text-[26px] font-semibold leading-none tracking-tight text-[var(--text)] tabular-nums sm:text-[28px]">
        {typeof valor === 'number' ? <AnimatedNumber value={valor} formatter={(n) => n.toLocaleString('pt-BR')} /> : valor}
        {sufixo && <span className="text-sm font-medium text-[var(--text-muted)]">{sufixo}</span>}
      </p>
      <div className="mt-2.5 flex min-w-0 items-end justify-between gap-2">
        <div className="min-w-0 flex-1 text-xs leading-5">
          {temVariacao ? (
            <p className="flex min-w-0 items-center gap-1 text-[var(--text-muted)]">
              <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold ${neutra ? 'bg-[var(--bg-2)] text-[var(--text-muted)]' : boa ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                <Seta size={12} />
                {v > 0 ? '+' : ''}
                {v}%
              </span>
              {variacao?.texto && <span className="truncate">{variacao.texto}</span>}
            </p>
          ) : (
            legenda && <p className="line-clamp-2 leading-4 text-[var(--text-muted)]">{legenda}</p>
          )}
        </div>
        {serie && serie.length > 1 && <Sparkline data={serie} color={t.linha} width={72} height={24} className="hidden shrink-0 sm:block" />}
      </div>
    </div>
  );
}
