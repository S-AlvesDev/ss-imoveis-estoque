import { Lock } from 'lucide-react';

/**
 * O aviso que acompanha um botão travado pelo plano: um cadeado e a frase
 * "disponível a partir do plano X" (ou "o plano inclui N unidades").
 * Sempre a mesma frase que o servidor devolveria — a tela só avisa antes.
 */
export function Cadeado({ texto, className = '' }: { texto: string; className?: string }) {
  return (
    <p className={`inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-muted)] ${className}`}>
      <Lock size={12} className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden />
      <span>{texto}</span>
    </p>
  );
}
