import { type HTMLAttributes } from 'react';

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_24px_-16px_rgba(15,23,42,0.12)] transition-shadow duration-200 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
