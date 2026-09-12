import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { ROTAS } from '@/app/router';
import { PRODUTO } from '@/shared/produto';
import { AVALIACAO_DIAS } from '@/shared/planos';
import { track } from '@/lib/analytics';
import { Botao, BotaoLink, Container, Eyebrow } from './ui';
import { DashboardMockup } from './DashboardMockup';

/**
 * A primeira tela: o que o Stok Aí resolve, em uma frase, e o produto de
 * verdade ao lado. Não explica tudo — abre caminho para a demonstração.
 */
export function Hero({ onDemo }: { onDemo: () => void }) {
  const reduzido = useReducedMotion();
  const entrada = (delay: number) =>
    reduzido
      ? {}
      : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <section className="relative overflow-hidden pb-16 pt-32 sm:pb-24 sm:pt-40" aria-labelledby="hero-titulo">
      <div className="grade absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden />
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 15% 20%, rgba(255,138,36,0.22), transparent 45%), radial-gradient(ellipse at 90% 70%, rgba(34,197,94,0.08), transparent 40%)',
        }}
      />

      <Container className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
        <div className="max-w-xl">
          <motion.div {...entrada(0)}>
            <Eyebrow>Stok Aí · Controle de estoque</Eyebrow>
          </motion.div>
          <motion.h1
            id="hero-titulo"
            {...entrada(0.08)}
            className="mt-4 text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-6xl"
          >
            Sua operação,
            <br />
            <span className="text-[var(--laranja)]">no controle.</span>
          </motion.h1>
          <motion.p {...entrada(0.16)} className="mt-6 max-w-lg text-lg leading-relaxed text-slate-400">
            {PRODUTO.descricao}
          </motion.p>

          <motion.div {...entrada(0.24)} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <BotaoLink href={ROTAS.criarConta} tamanho="lg" onClick={() => track('home_hero_cta', { cta: 'comecar' })}>
              Começar grátis por {AVALIACAO_DIAS} dias <ArrowRight size={18} />
            </BotaoLink>
            <Botao
              variante="secundario"
              tamanho="lg"
              onClick={() => {
                track('home_hero_cta', { cta: 'demonstracao' });
                onDemo();
              }}
            >
              <PlayCircle size={18} /> Solicitar demonstração
            </Botao>
          </motion.div>

          <motion.ul {...entrada(0.32)} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500" aria-label="O que o painel mostra">
            {['Saldo de estoque', 'Movimentações', 'Unidades', 'Alertas'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--laranja)]" aria-hidden />
                {t}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          {...(reduzido ? {} : { initial: { opacity: 0, y: 24, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] as const } })}
          className="relative"
        >
          <div className="absolute -inset-6 rounded-[2rem] bg-[var(--laranja)]/10 blur-3xl" aria-hidden />
          <DashboardMockup className="relative" />
        </motion.div>
      </Container>
    </section>
  );
}
