import { Link, ROTAS } from '@/app/router';
import { MessageCircle } from 'lucide-react';
import { PRODUTO, linkWhatsApp, whatsappFormatado } from '@/shared/produto';
import { LogoProduto } from '@/shared/ui/Logo';
import { Container } from './ui';

/**
 * Só o que existe de verdade: as seções da página, entrar, criar conta, o
 * WhatsApp, o formulário, os termos e a privacidade. Redes e endereço entram
 * quando existirem — um rodapé com link para lugar nenhum é pior que um curto.
 */
export function Footer({ onDemo }: { onDemo: () => void }) {
  const ano = new Date().getFullYear();
  const link = 'text-sm text-slate-400 transition-colors hover:text-white';
  return (
    <footer className="border-t border-[var(--linha)] bg-[var(--navy)] py-12">
      <Container className="grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <LogoProduto height={64} slogan />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">{PRODUTO.descricao}</p>
        </div>
        <nav aria-label="Produto" className="flex flex-col gap-2.5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Produto</p>
          <a href="#recursos" className={link}>
            Recursos
          </a>
          <a href="#como-funciona" className={link}>
            Como funciona
          </a>
          <a href="#empresas" className={link}>
            Para empresas
          </a>
          <a href="#evolucao" className={link}>
            Evolução
          </a>
        </nav>
        <nav aria-label="Conta e contato" className="flex flex-col gap-2.5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Conta e contato</p>
          <Link href={ROTAS.entrar} className={link}>
            Entrar
          </Link>
          <Link href={ROTAS.criarConta} className={link}>
            Criar conta
          </Link>
          <a href={linkWhatsApp()} target="_blank" rel="noopener noreferrer" className={`${link} inline-flex items-center gap-1.5`}>
            <MessageCircle size={14} className="shrink-0 text-[var(--verde)]" /> WhatsApp <span className="whitespace-nowrap">{whatsappFormatado()}</span>
          </a>
          <button type="button" onClick={onDemo} className={`${link} w-fit text-left`}>
            Solicitar demonstração
          </button>
          <Link href={ROTAS.termos} className={link}>
            Termos de uso
          </Link>
          <Link href={ROTAS.privacidade} className={link}>
            Privacidade
          </Link>
        </nav>
      </Container>
      <Container className="mt-10 flex flex-col gap-2 border-t border-[var(--linha)] pt-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {ano} {PRODUTO.nome}. {PRODUTO.slogan}
        </p>
        <p className="font-mono">controle de estoque por depósito</p>
      </Container>
    </footer>
  );
}
