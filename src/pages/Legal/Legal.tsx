import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, ROTAS } from '@/app/router';
import { PRODUTO } from '@/shared/produto';
import { LogoProduto } from '@/shared/ui/Logo';
import { Container } from '@/pages/Home/ui';
import { TERMOS, PRIVACIDADE, RESPONSAVEL, type Documento } from './conteudo';

/**
 * Termos de uso e política de privacidade: a mesma página, dois textos.
 * Escura como a Home, para quem chega do rodapé não sentir que saiu do
 * site; só leitura, com um link para o outro documento no fim.
 */
export function Legal({ documento }: { documento: 'termos' | 'privacidade' }) {
  const doc: Documento = documento === 'termos' ? TERMOS : PRIVACIDADE;
  const outro = documento === 'termos' ? { rotulo: 'Política de privacidade', href: ROTAS.privacidade } : { rotulo: 'Termos de uso', href: ROTAS.termos };

  useEffect(() => {
    document.title = `${doc.titulo} — ${PRODUTO.nome}`;
    return () => {
      document.title = PRODUTO.nome;
    };
  }, [doc.titulo]);

  return (
    <div className="min-h-screen bg-[var(--navy,#050B18)] text-slate-200" style={{ ['--navy' as string]: PRODUTO.navy }}>
      <header className="border-b border-white/10">
        <Container className="flex items-center justify-between py-5">
          <Link href={ROTAS.home} aria-label={`${PRODUTO.nome} — início`}>
            <LogoProduto height={36} />
          </Link>
          <Link href={ROTAS.home} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
            <ArrowLeft size={14} /> Voltar para o site
          </Link>
        </Container>
      </header>

      <main>
        <Container className="max-w-3xl py-12 sm:py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--brand,#FF8A24)]" style={{ color: PRODUTO.cor }}>
            {PRODUTO.nome}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">{doc.titulo}</h1>
          <p className="mt-3 text-base leading-relaxed text-slate-400">{doc.resumo}</p>
          <p className="mt-2 text-xs text-slate-500">Última revisão: {RESPONSAVEL.atualizadoEm}.</p>

          <div className="mt-10 space-y-8">
            {doc.secoes.map((s) => (
              <section key={s.titulo}>
                <h2 className="font-display text-lg font-bold text-white">{s.titulo}</h2>
                {s.paragrafos.map((p, i) => (
                  <p key={i} className="mt-2 text-[15px] leading-relaxed text-slate-300">
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <div className="mt-12 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
            <p>
              Dúvidas? Fale com a gente: <a href={`mailto:${RESPONSAVEL.email}`} className="text-white underline">{RESPONSAVEL.email}</a> ou WhatsApp {RESPONSAVEL.whatsapp}.
            </p>
            <p className="mt-2">
              Veja também: <Link href={outro.href} className="text-white underline">{outro.rotulo}</Link>.
            </p>
          </div>
        </Container>
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} {PRODUTO.nome}. {PRODUTO.slogan}
      </footer>
    </div>
  );
}
