import { type HTMLAttributes, type ReactNode } from 'react';

/**
 * A superfície do Atende Aí: branco sobre o fundo lavanda, borda de um
 * pixel quase invisível, sombra rasa, cantos de 16px. Um cartão agrupa
 * informação relacionada — não é uma moldura para cada número.
 */
export function Cartao({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--sombra-cartao)] ${className}`} {...rest}>
      {children}
    </div>
  );
}

interface CabecalhoDoCartaoProps {
  icone?: ReactNode;
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Filtros, links "ver tudo", botões — à direita. */
  acoes?: ReactNode;
  className?: string;
}

/** Título do cartão: ícone miúdo em lavanda, título, descrição discreta e as ações à direita. */
export function CabecalhoDoCartao({ icone, titulo, descricao, acoes, className = '' }: CabecalhoDoCartaoProps) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-2 ${className}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icone && <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">{icone}</span>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-6 tracking-tight text-[var(--text)]">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  );
}

/** Um bloco secundário dentro do cartão: um degrau abaixo, sem sombra. */
export function Bloco({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--bg)] ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** Rótulo de seção em caixa alta, miúdo — para separar grupos dentro de um cartão ou painel. */
export function Rotulo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] ${className}`}>{children}</p>;
}
