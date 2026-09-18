import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { track } from '@/lib/analytics';
import { SEVLA, type ProdutoDoEcossistema } from './produto';

/**
 * Os primitivos da página da SEVLA: container, revelação no scroll, eyebrow,
 * botões, marcas. Pequenos de propósito — a identidade vem do CSS em
 * sevla.css, não de componentes novos.
 */
export const cta = (alvo: string) => track('sevla_cta', { alvo });

export function Container({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Revelar({ className = '', delay = 0, children }: { className?: string; delay?: number; children: ReactNode }) {
  const reduzido = useReducedMotion();
  if (reduzido) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -80px 0px' }} transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

/** O rótulo pequeno acima de cada título, em caixa alta espaçada. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--primaria-clara)] ${className}`}>{children}</p>;
}

/** Cabeçalho de seção: eyebrow, título grande e um parágrafo, centrados ou à esquerda. */
export function Titulo({ eyebrow, titulo, texto, alinhamento = 'centro', id }: { eyebrow: string; titulo: ReactNode; texto?: ReactNode; alinhamento?: 'centro' | 'esquerda'; id?: string }) {
  const centro = alinhamento === 'centro';
  return (
    <Revelar className={`${centro ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'}`}>
      <Eyebrow className={centro ? 'mb-4' : 'mb-4'}>{eyebrow}</Eyebrow>
      <h2 id={id} className="text-[clamp(1.75rem,4.2vw,3rem)] font-bold leading-[1.08] text-white">
        {titulo}
      </h2>
      {texto && <p className="mt-5 text-[clamp(1rem,1.4vw,1.125rem)] leading-relaxed text-[var(--texto-suave)]">{texto}</p>}
    </Revelar>
  );
}

type Variante = 'primario' | 'contorno' | 'fantasma';
export function Botao({ href, variante = 'primario', className = '', alvo, children, externo }: { href: string; variante?: Variante; className?: string; alvo: string; children: ReactNode; externo?: boolean }) {
  const base = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all active:scale-[0.98]';
  const estilos: Record<Variante, string> = {
    primario: 'fundo-gradiente text-white shadow-[0_12px_32px_-12px_rgba(99,102,241,0.7)] hover:brightness-110',
    contorno: 'border border-[var(--primaria)]/60 text-white hover:border-[var(--primaria-clara)] hover:bg-[var(--primaria)]/10',
    fantasma: 'text-slate-200 hover:bg-white/[0.06] hover:text-white',
  };
  return (
    <a href={href} onClick={() => cta(alvo)} className={`${base} ${estilos[variante]} ${className}`} {...(externo ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {children}
    </a>
  );
}

/** A marca oficial, em arquivo. `altura` em px; a largura segue a proporção. */
export function MarcaSevla({ altura = 30, tema = 'escuro', className = '' }: { altura?: number; tema?: 'escuro' | 'claro'; className?: string }) {
  return <img src={tema === 'escuro' ? SEVLA.logo.escuro : SEVLA.logo.claro} alt={SEVLA.nome} height={altura} width={Math.round(altura * SEVLA.logo.proporcao)} style={{ height: altura, width: 'auto' }} className={`block max-w-full ${className}`} decoding="async" />;
}

/** O símbolo da SEVLA, do arquivo oficial. */
export function SimboloSevla({ tamanho = 40, className = '' }: { tamanho?: number; className?: string }) {
  return <img src={SEVLA.simbolo} alt="" width={tamanho} height={tamanho} style={{ width: tamanho, height: tamanho }} className={`block object-contain ${className}`} decoding="async" aria-hidden />;
}

/** A marca de um produto em fundo escuro: o arquivo dele, ou símbolo + nome. */
export function MarcaDoProduto({ p, tamanho = 28 }: { p: ProdutoDoEcossistema; tamanho?: number }) {
  if (p.logo) return <img src={p.logo} alt={p.nome} style={{ height: tamanho, width: 'auto' }} className="block max-w-full" decoding="async" />;
  return (
    <span className="inline-flex items-center gap-2">
      <img src={p.simbolo} alt="" style={{ height: tamanho, width: tamanho }} className="rounded-lg object-contain" decoding="async" aria-hidden />
      <span className="font-display text-lg font-bold tracking-tight text-white">{p.nome}</span>
    </span>
  );
}
