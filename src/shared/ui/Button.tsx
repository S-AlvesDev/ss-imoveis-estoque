import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-[var(--brand)] text-white hover:brightness-105 shadow-md shadow-[var(--brand)]/30 disabled:opacity-50',
  accent:
    'bg-[var(--brand-secondary)] text-white hover:brightness-105 shadow-md shadow-[var(--brand-secondary)]/25 disabled:opacity-50',
  secondary:
    'bg-slate-900 text-white hover:bg-slate-800 shadow-md shadow-slate-900/20 disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-600/25 disabled:bg-rose-300',
  ghost:
    'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-2)] disabled:opacity-40',
  outline:
    'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--brand)]/50 hover:bg-[var(--brand)]/5 disabled:opacity-40',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-sm gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  fullWidth,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" size={16} /> : icon}
      {children}
    </button>
  );
}
