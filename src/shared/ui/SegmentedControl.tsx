import { motion } from 'motion/react';

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; activeClassName?: string }[];
  layoutId: string;
  activeClassName?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  layoutId,
  activeClassName = 'text-[var(--brand)]',
}: SegmentedControlProps<T>) {
  return (
    <div className="flex max-w-full overflow-x-auto rounded-lg bg-[var(--bg-2)] p-1 text-xs font-bold">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 transition-colors ${value === opt.value ? opt.activeClassName || activeClassName : 'text-[var(--text-muted)]'}`}
        >
          {value === opt.value && (
            <motion.div
              layoutId={layoutId}
              className="absolute inset-0 rounded-md bg-[var(--surface)] shadow-sm ring-1 ring-[var(--border)]"
              transition={{ type: 'spring', stiffness: 450, damping: 34 }}
            />
          )}
          <span className="relative">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
