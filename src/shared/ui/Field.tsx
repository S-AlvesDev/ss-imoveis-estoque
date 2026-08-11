import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const baseInput =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-50 disabled:text-slate-400';

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
      {children} {required && <span className="text-rose-500">*</span>}
    </label>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
}
export function Input({ label, required, className = '', ...rest }: InputProps) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      <input className={`${baseInput} ${className}`} {...rest} />
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  required?: boolean;
  children: ReactNode;
}
export function Select({ label, required, className = '', children, ...rest }: SelectProps) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      <select className={`${baseInput} ${className}`} {...rest}>
        {children}
      </select>
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  required?: boolean;
}
export function Textarea({ label, required, className = '', ...rest }: TextareaProps) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      <textarea className={`${baseInput} resize-none ${className}`} {...rest} />
    </div>
  );
}
