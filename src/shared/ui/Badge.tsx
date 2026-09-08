import { type ReactNode } from 'react';

type Variant = 'critical' | 'warning' | 'success' | 'info' | 'neutral' | 'indigo';

const variantClasses: Record<Variant, string> = {
  critical: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25',
  warning: 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/25',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/25',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15',
};

const dotClasses: Record<Variant, string> = {
  critical: 'bg-rose-500',
  warning: 'bg-orange-500',
  success: 'bg-emerald-500',
  info: 'bg-sky-500',
  indigo: 'bg-indigo-500',
  neutral: 'bg-slate-400',
};

export function Badge({ variant = 'neutral', dot, children }: { variant?: Variant; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${variantClasses[variant]}`}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotClasses[variant]}`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotClasses[variant]}`} />
        </span>
      )}
      {children}
    </span>
  );
}
