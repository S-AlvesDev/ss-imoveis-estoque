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
  activeClassName = 'text-blue-600',
}: SegmentedControlProps<T>) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`relative rounded-md px-3 py-1.5 transition-colors ${value === opt.value ? opt.activeClassName || activeClassName : 'text-slate-500'}`}
        >
          {value === opt.value && (
            <motion.div
              layoutId={layoutId}
              className="absolute inset-0 rounded-md bg-white shadow-sm"
              transition={{ type: 'spring', stiffness: 450, damping: 34 }}
            />
          )}
          <span className="relative">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
