import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCabecalho } from '../store/cabecalho';

/**
 * A moldura de uma tela: manda título e descrição para o cabeçalho do Shell,
 * põe as ações principais lá também (por portal) e limita a largura do
 * conteúdo. Uma tela é `<Pagina titulo … acoes={…}>conteúdo</Pagina>`.
 */
const LARGURA = { sm: 'max-w-2xl', md: 'max-w-4xl', lg: 'max-w-6xl', xl: 'max-w-7xl', cheia: '' };

interface PaginaProps {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  largura?: keyof typeof LARGURA;
  className?: string;
  children: ReactNode;
}

export function Pagina({ titulo, descricao, acoes, largura = 'lg', className = '', children }: PaginaProps) {
  const alvo = useCabecalho((s) => s.alvoDasAcoes);
  useEffect(() => {
    useCabecalho.setState({ titulo, descricao: descricao ?? null });
    return () => useCabecalho.setState({ titulo: null, descricao: null });
  }, [titulo, descricao]);
  return (
    <>
      {acoes && alvo && createPortal(acoes, alvo)}
      <div className={`mx-auto w-full ${LARGURA[largura]} ${className}`}>{children}</div>
    </>
  );
}

/** Uma seção com título miúdo e o conteúdo embaixo — para agrupar cartões numa página. */
export function Secao({ titulo, descricao, acoes, children, className = '' }: { titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{descricao}</p>}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  );
}
