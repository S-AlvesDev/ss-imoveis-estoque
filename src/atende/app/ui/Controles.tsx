import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Os seletores: o segmentado (período, cartão/pix), as abas de página e as
 * pílulas de filtro. Todos com a mesma cor de seleção — roxo suave.
 */
interface Opcao<T extends string> {
  valor: T;
  rotulo: ReactNode;
  icone?: ReactNode;
  /** Um número ao lado (contagem). */
  contagem?: number;
  desabilitada?: boolean;
}

interface SegmentadoProps<T extends string> {
  valor: T;
  onChange: (v: T) => void;
  opcoes: Opcao<T>[];
  tamanho?: 'sm' | 'md';
  /** Ocupa a largura toda, cada opção com o mesmo tamanho (formulários no celular). */
  largo?: boolean;
  'aria-label'?: string;
}

/** O controle segmentado: um trilho cinza com a opção ativa em branco. */
export function Segmentado<T extends string>({ valor, onChange, opcoes, tamanho = 'md', largo, ...rest }: SegmentadoProps<T>) {
  return (
    <div role="tablist" aria-label={rest['aria-label']} className={`inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-1 ${largo ? 'flex w-full' : ''}`}>
      {opcoes.map((o) => {
        const ativa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={ativa}
            disabled={o.desabilitada}
            onClick={() => onChange(o.valor)}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-[background-color,color,box-shadow] disabled:opacity-40 ${tamanho === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]'} ${largo ? 'flex-1' : ''} ${ativa ? 'bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_2px_rgba(23,21,58,0.08),0_0_0_1px_rgba(23,21,58,0.04)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
          >
            {o.icone}
            {o.rotulo}
            {o.contagem !== undefined && o.contagem > 0 && <span className={`rounded-md px-1 text-[10px] tabular-nums ${ativa ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]' : 'bg-[var(--surface)] text-[var(--text-muted)]'}`}>{o.contagem > 99 ? '99+' : o.contagem}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** As abas de uma página (Empresa / IA): sublinhado roxo, rolam no celular. */
export function Abas<T extends string>({ valor, onChange, opcoes, className = '' }: { valor: T; onChange: (v: T) => void; opcoes: Opcao<T>[]; className?: string }) {
  return (
    <div role="tablist" className={`hide-scrollbar -mb-px flex gap-1 overflow-x-auto border-b border-[var(--border)] ${className}`}>
      {opcoes.map((o) => {
        const ativa = o.valor === valor;
        return (
          <button key={o.valor} type="button" role="tab" aria-selected={ativa} onClick={() => onChange(o.valor)} className={`relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 pb-3 pt-1 text-sm font-semibold transition-colors ${ativa ? 'text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
            {o.icone}
            {o.rotulo}
            {o.contagem !== undefined && o.contagem > 0 && <span className="rounded-md bg-[var(--bg-2)] px-1.5 text-[11px] tabular-nums text-[var(--text-muted)]">{o.contagem}</span>}
            {ativa && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--brand)]" />}
          </button>
        );
      })}
    </div>
  );
}

/** As pílulas de filtro (lista de conversas): rolam de lado no celular. */
export function Pilulas<T extends string>({ valor, onChange, opcoes, className = '' }: { valor: T; onChange: (v: T) => void; opcoes: Opcao<T>[]; className?: string }) {
  const trilho = useRef<HTMLDivElement>(null);
  // A pílula ativa sempre à vista, mesmo quando a escolha veio de fora (o menu lateral).
  useEffect(() => {
    trilho.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [valor]);
  return (
    <div ref={trilho} role="tablist" className={`hide-scrollbar flex gap-1.5 overflow-x-auto ${className}`}>
      {opcoes.map((o) => {
        const ativa = o.valor === valor;
        return (
          <button key={o.valor} type="button" role="tab" aria-selected={ativa} onClick={() => onChange(o.valor)} className={`inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors ${ativa ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand-ink)]'}`}>
            {o.icone}
            {o.rotulo}
            {o.contagem !== undefined && o.contagem > 0 && <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${ativa ? 'bg-white/20 text-white' : 'bg-[var(--surface)] text-[var(--text-muted)]'}`}>{o.contagem > 99 ? '99+' : o.contagem}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Uma lista vertical de filtros (a coluna da Central no desktop). */
export function ListaDeFiltros<T extends string>({ valor, onChange, opcoes, className = '' }: { valor: T; onChange: (v: T) => void; opcoes: Opcao<T>[]; className?: string }) {
  return (
    <nav className={`space-y-0.5 ${className}`} aria-label="Filtros">
      {opcoes.map((o) => {
        const ativa = o.valor === valor;
        return (
          <button key={o.valor} type="button" aria-current={ativa ? 'true' : undefined} onClick={() => onChange(o.valor)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${ativa ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]'}`}>
            <span className={`shrink-0 ${ativa ? 'text-[var(--brand)]' : ''}`}>{o.icone}</span>
            <span className="min-w-0 flex-1 truncate">{o.rotulo}</span>
            {o.contagem !== undefined && o.contagem > 0 && <span className={`rounded-md px-1.5 text-[11px] font-semibold tabular-nums ${ativa ? 'bg-white text-[var(--brand-ink)]' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>{o.contagem > 99 ? '99+' : o.contagem}</span>}
          </button>
        );
      })}
    </nav>
  );
}
