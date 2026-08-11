import { type ReactNode } from 'react';
import { motion, type Variants } from 'motion/react';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

/** Wraps a row of cards/tiles and staggers them in on mount. Direct children only. */
export function Reveal({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div className={className} variants={container} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function RevealItem({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
