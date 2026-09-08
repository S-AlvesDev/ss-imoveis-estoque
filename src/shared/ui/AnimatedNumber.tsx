import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useSpring } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  formatter?: (n: number) => string;
  className?: string;
}

export function AnimatedNumber({ value, formatter, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 22, mass: 0.6 });

  useEffect(() => {
    if (inView) motionValue.set(value);
  }, [inView, value, motionValue]);

  // Contadores inteiros (nº de itens, alertas) não podem piscar "315,25" no meio
  // da animação. Saldos com decimal de verdade continuam mostrando a fração.
  const isInteger = Number.isInteger(value);

  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      if (!ref.current) return;
      const shown = isInteger ? Math.round(v) : v;
      ref.current.textContent = formatter ? formatter(shown) : Math.round(shown).toString();
    });
    return unsub;
  }, [spring, formatter, isInteger]);

  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
