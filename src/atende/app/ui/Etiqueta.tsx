import { type ReactNode } from 'react';

/**
 * A pílula de estado. Poucos tons, sempre os mesmos significados: roxo é
 * "da casa/IA", verde é bom, âmbar é atenção, vermelho é problema, azul é
 * informação, cinza é neutro.
 */
export type TomDaEtiqueta = 'roxo' | 'verde' | 'ambar' | 'vermelho' | 'azul' | 'cinza' | 'rosa';

const TOM: Record<TomDaEtiqueta, { fundo: string; ponto: string }> = {
  roxo: { fundo: 'bg-[var(--brand-soft)] text-[var(--brand-ink)]', ponto: 'bg-[var(--brand)]' },
  verde: { fundo: 'bg-emerald-50 text-emerald-700', ponto: 'bg-emerald-500' },
  ambar: { fundo: 'bg-amber-50 text-amber-700', ponto: 'bg-amber-500' },
  vermelho: { fundo: 'bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
  azul: { fundo: 'bg-sky-50 text-sky-700', ponto: 'bg-sky-500' },
  cinza: { fundo: 'bg-[var(--bg-2)] text-[var(--text-muted)]', ponto: 'bg-slate-400' },
  rosa: { fundo: 'bg-pink-50 text-pink-700', ponto: 'bg-pink-500' },
};

interface EtiquetaProps {
  tom?: TomDaEtiqueta;
  /** Um ponto colorido antes do texto; `pulsa` para o que está acontecendo agora. */
  ponto?: boolean;
  pulsa?: boolean;
  tamanho?: 'sm' | 'md';
  className?: string;
  title?: string;
  children: ReactNode;
}

export function Etiqueta({ tom = 'cinza', ponto, pulsa, tamanho = 'sm', className = '', title, children }: EtiquetaProps) {
  const t = TOM[tom];
  return (
    <span title={title} className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${tamanho === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs'} ${t.fundo} ${className}`}>
      {ponto && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulsa && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${t.ponto}`} />}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${t.ponto}`} />
        </span>
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Uma etiqueta com a cor que a equipe escolheu (as etiquetas das conversas). */
export function EtiquetaColorida({ cor, children, className = '' }: { cor: string; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex h-5 max-w-full items-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold ${className}`} style={{ borderColor: `${cor}55`, backgroundColor: `${cor}14`, color: cor }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
      <span className="truncate">{children}</span>
    </span>
  );
}
