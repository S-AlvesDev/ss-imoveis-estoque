import { type HTMLAttributes } from 'react';

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_24px_-16px_rgba(15,23,42,0.12)] transition-shadow duration-200 dark:shadow-[0_1px_2px_rgba(0,0,0,0.25),0_16px_32px_-20px_rgba(0,0,0,0.55)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
