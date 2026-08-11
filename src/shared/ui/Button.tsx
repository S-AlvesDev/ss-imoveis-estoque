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
    'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/25 disabled:bg-blue-300',
  accent:
    'bg-amber-500 text-slate-900 hover:bg-amber-400 shadow-md shadow-amber-500/25 disabled:bg-amber-200',
  secondary:
    'bg-slate-900 text-white hover:bg-slate-800 shadow-md shadow-slate-900/20 disabled:bg-slate-400',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-600/25 disabled:bg-rose-300',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
  outline:
    'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 disabled:text-slate-300',
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
