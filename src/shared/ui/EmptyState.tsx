import { type ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
}

export function EmptyState({ icon, title, subtitle, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-12 text-center ${className}`}>
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-2)] text-[var(--text-muted)]">{icon}</div>
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {subtitle && <p className="max-w-xs text-xs text-[var(--text-muted)]">{subtitle}</p>}
    </div>
  );
}
