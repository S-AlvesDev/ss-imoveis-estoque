import { type HTMLAttributes } from 'react';

/**
 * A superfície padrão do sistema. No claro, branco com sombra rasa; no
 * escuro, um tom acima do fundo com borda fina — a sombra some, porque
 * sombra sobre navy só suja.
 */
export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(11,16,32,0.04),0_10px_24px_-18px_rgba(11,16,32,0.18)] transition-shadow duration-200 dark:shadow-none ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** Filtros, links "ver todas", botões — fica à direita. */
  actions?: React.ReactNode;
  className?: string;
}

/** Cabeçalho de cartão como no painel: ícone laranja miúdo, título, ações à direita. */
export function CardHeader({ icon, title, actions, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">{icon}</span>}
        <h2 className="truncate text-sm font-bold text-[var(--text)]">{title}</h2>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
