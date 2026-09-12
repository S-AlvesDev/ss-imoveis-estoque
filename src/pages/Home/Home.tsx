import { useCallback, useEffect, useState } from 'react';
import { track } from '@/lib/analytics';
import { Header } from './Header';
import { Hero } from './Hero';
import { Prova, Dor, Recursos, ComoFunciona, AntesDepois, Multiunidade, Planos, Evolucao, CtaFinal } from './secoes';
import { Footer } from './Footer';
import { DemoModal } from './DemoModal';

/**
 * A Home pública do Stok Aí: problema → solução → prova → produto → ação.
 * A tela de login saiu daqui e foi para /entrar; esta página existe para
 * quem ainda não é cliente entender o produto e pedir para conhecer.
 */
export function Home() {
  const [demo, setDemo] = useState<{ aberto: boolean; origem: string }>({ aberto: false, origem: 'header' });

  const abrirDemo = useCallback((origem: string) => {
    track('home_demo_click', { origem });
    setDemo({ aberto: true, origem });
  }, []);
  const fecharDemo = useCallback(() => setDemo((d) => ({ ...d, aberto: false })), []);

  // Quantos chegam à metade e quantos chegam ao fim. Uma vez por visita.
  useEffect(() => {
    const marcos = { 50: false, 90: false };
    function aoRolar() {
      const doc = document.documentElement;
      const total = doc.scrollHeight - window.innerHeight;
      if (total <= 0) return;
      const pct = (window.scrollY / total) * 100;
      if (!marcos[50] && pct >= 50) {
        marcos[50] = true;
        track('home_scroll_50');
      }
      if (!marcos[90] && pct >= 90) {
        marcos[90] = true;
        track('home_scroll_90');
        window.removeEventListener('scroll', aoRolar);
      }
    }
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  return (
    <div className="home min-h-screen">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--laranja)] focus:px-4 focus:py-2 focus:font-semibold focus:text-[#1a0c00]"
      >
        Pular para o conteúdo
      </a>
      <Header onDemo={() => abrirDemo('header')} />
      <main id="conteudo">
        <Hero onDemo={() => abrirDemo('hero')} />
        <Prova />
        <Dor />
        <Recursos />
        <ComoFunciona />
        <AntesDepois />
        <Multiunidade onDemo={() => abrirDemo('empresas')} />
        <Planos onDemo={abrirDemo} />
        <Evolucao />
        <CtaFinal onDemo={() => abrirDemo('cta-final')} />
      </main>
      <Footer onDemo={() => abrirDemo('rodape')} />
      <DemoModal open={demo.aberto} origem={demo.origem} onClose={fecharDemo} />
    </div>
  );
}
