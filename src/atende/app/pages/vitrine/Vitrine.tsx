import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { track } from '@/lib/analytics';
import { MarcaAtende } from '../../Marca';
import { caminhoDe, TELAS, useRotaAtende } from '../../router';
import { ATENDE } from '../../../shared/produto';

/**
 * A moldura da vitrine pública do Atende Aí (landing e planos): cabeçalho,
 * rodapé e os primitivos. Navy profundo com o roxo da marca — a mesma
 * identidade do login, aberta para quem ainda não é cliente.
 */
export const cta = (alvo: string) => track('atende_cta', { alvo });

export function Container({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Revelar({ className = '', delay = 0, children }: { className?: string; delay?: number; children: ReactNode }) {
  const reduzido = useReducedMotion();
  if (reduzido) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -60px 0px' }} transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--lilas)]">{children}</p>;
}

type Variante = 'primario' | 'contorno' | 'fantasma';
export function Botao({ href, variante = 'primario', className = '', alvo, children, externo }: { href: string; variante?: Variante; className?: string; alvo: string; children: ReactNode; externo?: boolean }) {
  const ir = useRotaAtende((s) => s.ir);
  const base = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all active:scale-[0.98]';
  const estilos: Record<Variante, string> = {
    primario: 'bg-[var(--brand)] text-white shadow-[0_12px_32px_-12px_rgba(124,58,237,0.8)] hover:bg-[var(--brand-deep)]',
    contorno: 'border border-white/15 text-white hover:border-white/40 hover:bg-white/[0.04]',
    fantasma: 'text-slate-200 hover:bg-white/[0.06] hover:text-white',
  };
  // Links internos do Atende navegam sem recarregar; o resto é <a> comum.
  const interno = href.startsWith(`${ATENDE.base}/`);
  return (
    <a
      href={href}
      onClick={(e) => {
        cta(alvo);
        if (interno && e.button === 0 && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          const partes = href.slice(ATENDE.base.length + 1).split('/');
          ir(partes[0] as any, partes.slice(1).join('/'));
        }
      }}
      className={`${base} ${estilos[variante]} ${className}`}
      {...(externo ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

const MENU = [
  ['#o-que-faz', 'O que faz'],
  ['#como-funciona', 'Como funciona'],
  [caminhoDe(TELAS.planos), 'Planos'],
] as const;

export function HeaderDaVitrine() {
  const [aberto, setAberto] = useState(false);
  const [rolou, setRolou] = useState(false);
  useEffect(() => {
    const f = () => setRolou(window.scrollY > 8);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors ${rolou || aberto ? 'border-b border-white/[0.08] bg-[var(--navy)]/85 backdrop-blur-xl' : 'border-b border-transparent'}`}>
      <Container className="flex h-[68px] items-center justify-between gap-4">
        <a href={ATENDE.base} className="shrink-0 rounded-lg" aria-label={`${ATENDE.nome} — início`}>
          <MarcaAtende tema="escuro" tamanho={34} />
        </a>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Seções">
          {MENU.map(([href, nome]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white">
              {nome}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Botao href={caminhoDe(TELAS.entrar)} variante="fantasma" alvo="header-entrar">
            Entrar
          </Botao>
          <Botao href={caminhoDe(TELAS.criarConta)} alvo="header-criar">
            Criar conta
          </Botao>
        </div>
        <button type="button" onClick={() => setAberto((v) => !v)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-200 hover:bg-white/[0.06] md:hidden" aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} aria-expanded={aberto}>
          {aberto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </Container>
      {aberto && (
        <div className="border-t border-white/[0.08] bg-[var(--navy)] md:hidden">
          <Container className="py-4">
            {MENU.map(([href, nome]) => (
              <a key={href} href={href} onClick={() => setAberto(false)} className="block rounded-xl px-3 py-3 text-base font-medium text-slate-200 hover:bg-white/[0.06]">
                {nome}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.08] pt-4">
              <Botao href={caminhoDe(TELAS.criarConta)} alvo="menu-criar" className="w-full">
                Criar conta
              </Botao>
              <Botao href={caminhoDe(TELAS.entrar)} variante="contorno" alvo="menu-entrar" className="w-full">
                Entrar
              </Botao>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}

export function FooterDaVitrine() {
  const link = 'text-sm text-[#a5abcf] transition-colors hover:text-white';
  return (
    <footer className="border-t border-white/[0.08] py-10 sm:py-14">
      <Container className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <div>
          <MarcaAtende tema="escuro" tamanho={34} />
          <p className="mt-3 max-w-xs text-sm text-[#a5abcf]">{ATENDE.slogan}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6f76a0]">Atende Aí</p>
          <ul className="mt-3 space-y-2">
            <li><a href={`${ATENDE.base}#o-que-faz`} className={link}>O que faz</a></li>
            <li><a href={caminhoDe(TELAS.planos)} className={link}>Planos</a></li>
            <li><a href={caminhoDe(TELAS.entrar)} className={link}>Entrar</a></li>
            <li><a href={caminhoDe(TELAS.criarConta)} className={link}>Criar conta</a></li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6f76a0]">SEVLA INFINITY</p>
          <ul className="mt-3 space-y-2">
            <li><a href="/cloud" className={link}>A empresa</a></li>
            <li><a href="/" className={link}>Stok Aí</a></li>
            <li><a href="/termos" className={link}>Termos de uso</a></li>
            <li><a href="/privacidade" className={link}>Privacidade</a></li>
          </ul>
        </div>
      </Container>
      <Container className="mt-10 flex flex-col gap-2 border-t border-white/[0.08] pt-6 text-xs text-[#6f76a0] sm:flex-row sm:justify-between">
        <p>© 2026 SEVLA INFINITY. Todos os direitos reservados.</p>
        <p>
          {ATENDE.nome} é um produto da{' '}
          <a href="/cloud" className="text-[#a5abcf] hover:text-white">
            SEVLA INFINITY
          </a>
          .
        </p>
      </Container>
    </footer>
  );
}
