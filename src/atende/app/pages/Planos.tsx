import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { useSessaoAtende } from '../store/sessao';
import { caminhoDe, TELAS } from '../router';
import { Botao, Container, FooterDaVitrine, HeaderDaVitrine, Revelar } from './vitrine/Vitrine';
import { SecaoPlanos } from './vitrine/SecaoPlanos';

/**
 * A página pública de planos (/atende/planos). Pública mesmo: quem está
 * logado também vê — com um atalho para voltar para a central.
 */
export function Planos() {
  const sessao = useSessaoAtende((s) => s.sessao);
  useEffect(() => {
    document.title = 'Planos do Atende Aí — Seu atendimento, no controle.';
    return () => {
      document.title = 'Atende Aí — Seu atendimento, no controle.';
    };
  }, []);
  return (
    <div className="fundo-navy min-h-dvh text-slate-200">
      <HeaderDaVitrine />
      <main className="pt-[68px]">
        <h1 className="sr-only">Planos do Atende Aí</h1>
        <SecaoPlanos />
        {sessao && (
          <Container className="pb-16">
            <Revelar className="text-center">
              <Botao href={caminhoDe(TELAS.central)} variante="contorno" alvo="planos-voltar">
                Voltar para a central <ArrowRight size={16} />
              </Botao>
            </Revelar>
          </Container>
        )}
      </main>
      <FooterDaVitrine />
    </div>
  );
}
