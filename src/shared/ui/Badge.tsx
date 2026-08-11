import { type ReactNode } from 'react';

type Variant = 'critical' | 'warning' | 'success' | 'info' | 'neutral' | 'indigo';

const variantClasses: Record<Variant, string> = {
  critical: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-500/10',
};

const dotClasses: Record<Variant, string> = {
  critical: 'bg-rose-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  info: 'bg-blue-500',
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
