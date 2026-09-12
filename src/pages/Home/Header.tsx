import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, ROTAS } from '@/app/router';
import { LogoProduto } from '@/shared/ui/Logo';
import { Botao, BotaoLink, Container } from './ui';

const NAV = [
  { href: '#recursos', rotulo: 'Recursos' },
  { href: '#como-funciona', rotulo: 'Como funciona' },
  { href: '#empresas', rotulo: 'Para empresas' },
  { href: '#planos', rotulo: 'Planos' },
];

/**
 * Fixo no topo. Ao rolar, encolhe e ganha fundo — o CTA nunca sai da tela.
 * No celular, o menu abre em lista; o CTA continua visível no próprio header.
 */
export function Header({ onDemo }: { onDemo: () => void }) {
  const [compacto, setCompacto] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    function aoRolar() {
      setCompacto(window.scrollY > 24);
    }
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  // Menu aberto fecha ao escolher um destino.
  function fechar() {
    setAberto(false);
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[padding,background-color,box-shadow,border-color] duration-300 ${
        compacto || aberto ? 'border-b border-white/[0.06] bg-[var(--navy)]/85 py-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md' : 'border-b border-transparent py-4'
      }`}
    >
      <Container className="flex items-center gap-6">
        <Link href={ROTAS.home} className="flex items-center rounded-lg" aria-label="Stok Aí — início" onClick={fechar}>
          <LogoProduto height={compacto ? 30 : 36} className="transition-[height] duration-300" />
        </Link>

        <nav aria-label="Principal" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white">
              {n.rotulo}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Os botões já são inline-flex; esconder é papel do wrapper, senão as duas classes de display brigam. */}
          <div className="hidden items-center gap-2 sm:flex">
            <BotaoLink href={ROTAS.entrar} variante="fantasma">
              Entrar
            </BotaoLink>
            <Botao onClick={onDemo}>Solicitar demonstração</Botao>
          </div>
          <div className="sm:hidden">
            <Botao onClick={onDemo}>Demonstração</Botao>
          </div>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls="menu-mobile"
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            className="rounded-lg p-2 text-slate-300 hover:bg-white/5 hover:text-white md:hidden"
          >
            {aberto ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </Container>

      {aberto && (
        <nav id="menu-mobile" aria-label="Principal (celular)" className="border-t border-white/[0.06] md:hidden">
          <Container className="flex flex-col py-2">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={fechar} className="rounded-lg px-3 py-3 text-base font-medium text-slate-200 hover:bg-white/5">
                {n.rotulo}
              </a>
            ))}
            <Link href={ROTAS.entrar} onClick={fechar} className="rounded-lg px-3 py-3 text-base font-medium text-slate-200 hover:bg-white/5">
              Entrar
            </Link>
            <Link href={ROTAS.criarConta} onClick={fechar} className="rounded-lg px-3 py-3 text-base font-medium text-[var(--laranja)] hover:bg-white/5">
              Criar conta
            </Link>
          </Container>
        </nav>
      )}
    </header>
  );
}
