import { type ReactNode, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from '@/app/router';

/** Largura de leitura da Home: nem estreita como um formulário, nem solta como uma tela do sistema. */
export function Container({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

/**
 * Entra em cena ao rolar até aqui: 14px para cima, uma vez só. Quem pediu
 * menos movimento no sistema operacional não vê animação nenhuma.
 */
export function Revelar({
  className = '',
  delay = 0,
  children,
  as = 'div',
}: {
  className?: string;
  delay?: number;
  children: ReactNode;
  as?: 'div' | 'li' | 'section';
}) {
  const reduzido = useReducedMotion();
  const Tag = motion[as];
  if (reduzido) {
    const Estatico = as;
    return <Estatico className={className}>{children}</Estatico>;
  }
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Tag>
  );
}

/** Rótulo curto acima do título, em mono e laranja — o mesmo sotaque do sistema por dentro. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--laranja)]">{children}</p>;
}

interface SecaoProps {
  id: string;
  eyebrow: string;
  titulo: ReactNode;
  descricao?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Uma seção da Home: rótulo, título, uma linha de explicação e o conteúdo. */
export function Secao({ id, eyebrow, titulo, descricao, className = '', children }: SecaoProps) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={`py-20 sm:py-28 ${className}`}>
      <Container>
        <Revelar className="max-w-2xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id={`${id}-titulo`} className="mt-3 text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-4xl">
            {titulo}
          </h2>
          {descricao && <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">{descricao}</p>}
        </Revelar>
        {children}
      </Container>
    </section>
  );
}

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[transform,background-color,box-shadow,border-color] duration-200 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none';
const tamanhos = { md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3.5 text-base' };
const variantes = {
  primario: 'bg-[var(--laranja)] text-[#1a0c00] shadow-[0_10px_30px_-10px_rgba(255,138,36,0.7)] hover:brightness-110',
  secundario: 'border border-white/15 bg-white/[0.04] text-white hover:border-[var(--laranja)]/60 hover:bg-white/[0.08]',
  fantasma: 'text-slate-300 hover:text-white',
};
type Variante = keyof typeof variantes;
type Tamanho = keyof typeof tamanhos;

type BotaoLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variante?: Variante; tamanho?: Tamanho };

/** Um link vestido de botão. Rota interna navega sem recarregar; âncora rola. */
export function BotaoLink({ href, variante = 'primario', tamanho = 'md', className = '', children, ...rest }: BotaoLinkProps) {
  const cls = `${base} ${tamanhos[tamanho]} ${variantes[variante]} ${className}`;
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...rest}>
      {children}
    </a>
  );
}

type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: Tamanho };

export function Botao({ variante = 'primario', tamanho = 'md', className = '', type = 'button', children, ...rest }: BotaoProps) {
  return (
    <button type={type} className={`${base} ${tamanhos[tamanho]} ${variantes[variante]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Cartão sobre o navy: borda fina, fundo um tom acima, laranja no hover. */
export function Cartao({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`group rounded-2xl border border-[var(--linha)] bg-[var(--navy-2)] p-6 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--laranja)]/50 hover:shadow-[0_18px_40px_-20px_rgba(255,138,36,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}
