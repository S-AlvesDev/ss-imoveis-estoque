import { ArrowRight, BarChart3, Bell, Bot, Eye, MessageSquare, Smartphone, Users } from 'lucide-react';
import { MockupDoAtende } from '@/sevla/MockupDoAtende';
import { caminhoDe, TELAS } from '../router';
import { ATENDE } from '../../shared/produto';
import { Botao, Container, Eyebrow, FooterDaVitrine, HeaderDaVitrine, Revelar } from './vitrine/Vitrine';
import { SecaoPlanos } from './vitrine/SecaoPlanos';

/**
 * A landing pública do Atende Aí (/atende): o que o produto faz — só o que
 * existe —, como funciona, os planos e a porta de entrada. Quem já entrou
 * não passa por aqui: vai direto para a central.
 */
const O_QUE_FAZ = [
  { icone: <Smartphone size={20} />, titulo: 'O WhatsApp da sua empresa', texto: 'Conecte o número da empresa lendo um QR, como no WhatsApp Web. As mensagens chegam na central; o que a equipe manda pelo celular também aparece.' },
  { icone: <Bot size={20} />, titulo: 'A IA faz a triagem', texto: 'Lê a mensagem, identifica assunto, intenção e setor, define a prioridade e resume para quem vai atender. Dá uma primeira resposta — nunca vende nem negocia.' },
  { icone: <MessageSquare size={20} />, titulo: 'A central de atendimento', texto: 'Texto, imagem, vídeo, áudio, documento, localização e contato. Notas internas que o cliente não vê, etiquetas, ficha e histórico de cada cliente.' },
  { icone: <Users size={20} />, titulo: 'Times e papéis', texto: 'Setores com fila própria. Administrador, supervisor e atendente — cada um vê e faz o que o papel permite.' },
  { icone: <Eye size={20} />, titulo: 'Supervisão em tempo real', texto: 'Quem está online, quem está esperando resposta há quanto tempo. O supervisor orienta, assume, transfere e corrige a triagem da IA.' },
  { icone: <BarChart3 size={20} />, titulo: 'Dashboard e leads', texto: 'Conversas, leads, conversão, tempo de primeira resposta, por pessoa e por setor. Contado no banco — nada estimado.' },
];

const PASSOS = [
  ['1', 'Conecte o WhatsApp', 'Crie a conta da empresa, cadastre os setores e leia o QR com o celular da empresa.'],
  ['2', 'A IA recebe e encaminha', 'Cada mensagem nova é lida, classificada e vai para a fila do setor certo — ou direto para quem está online.'],
  ['3', 'A equipe atende, você acompanha', 'Atendentes respondem com contexto; supervisores acompanham em tempo real; o dashboard mostra o resultado.'],
] as const;

export function Landing() {
  return (
    <div className="fundo-navy min-h-dvh text-slate-200">
      <HeaderDaVitrine />
      <main>
        <section className="relative overflow-hidden pt-[calc(68px+4rem)] pb-16 sm:pt-[calc(68px+5.5rem)] sm:pb-24">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }} aria-hidden />
          <Container className="relative">
            <div className="mx-auto max-w-3xl text-center">
              <Revelar>
                <Eyebrow>Atendimento pelo WhatsApp da sua empresa</Eyebrow>
              </Revelar>
              <Revelar delay={0.08}>
                <h1 className="mt-5 text-[clamp(2.25rem,6vw,4.5rem)] font-extrabold leading-[1.02] tracking-tight text-white">
                  Seu atendimento,
                  <br />
                  <span className="bg-gradient-to-r from-[#c4b5fd] to-[#7c3aed] bg-clip-text text-transparent">no controle.</span>
                </h1>
              </Revelar>
              <Revelar delay={0.16}>
                <p className="mx-auto mt-6 max-w-2xl text-[clamp(1.05rem,1.6vw,1.25rem)] leading-relaxed text-[#a5abcf]">{ATENDE.descricao}</p>
              </Revelar>
              <Revelar delay={0.24} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Botao href={caminhoDe(TELAS.criarConta)} alvo="hero-criar">
                  Criar a conta da empresa <ArrowRight size={16} />
                </Botao>
                <Botao href={caminhoDe(TELAS.planos)} variante="contorno" alvo="hero-planos">
                  Ver planos
                </Botao>
              </Revelar>
            </div>
            <Revelar delay={0.3} className="relative mx-auto mt-14 max-w-5xl sm:mt-20">
              <div className="absolute -inset-6 rounded-[2rem] bg-[var(--brand)]/15 blur-3xl" aria-hidden />
              <MockupDoAtende />
            </Revelar>
          </Container>
        </section>

        <section id="o-que-faz" className="py-20 sm:py-28">
          <Container>
            <Revelar className="mx-auto max-w-3xl text-center">
              <Eyebrow>O que faz</Eyebrow>
              <h2 className="mt-4 text-[clamp(1.75rem,4.2vw,3rem)] font-extrabold leading-[1.08] tracking-tight text-white">A IA entende. O atendente resolve. O supervisor acompanha.</h2>
            </Revelar>
            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {O_QUE_FAZ.map((f, i) => (
                <Revelar key={f.titulo} delay={(i % 3) * 0.06}>
                  <article className="h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-[var(--brand)]/50">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand)]/20 text-[var(--lilas)]">{f.icone}</span>
                    <h3 className="mt-5 text-lg font-bold text-white">{f.titulo}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#a5abcf]">{f.texto}</p>
                  </article>
                </Revelar>
              ))}
            </div>
            <Revelar delay={0.1} className="mt-6 flex flex-col items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:flex-row sm:items-center">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)]/20 text-[var(--lilas)]">
                <Bell size={20} />
              </span>
              <p className="text-sm leading-relaxed text-[#a5abcf]">
                <span className="font-bold text-white">No celular também.</span> Instale como app e receba aviso quando um cliente responder ou chegar conversa nova na sua fila — mesmo com o Atende fechado.
              </p>
            </Revelar>
          </Container>
        </section>

        <section id="como-funciona" className="py-20 sm:py-28">
          <Container>
            <Revelar className="mx-auto max-w-3xl text-center">
              <Eyebrow>Como funciona</Eyebrow>
              <h2 className="mt-4 text-[clamp(1.75rem,4.2vw,3rem)] font-extrabold leading-[1.08] tracking-tight text-white">Três passos para atender pelo sistema.</h2>
            </Revelar>
            <ol className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
              {PASSOS.map(([n, t, d], i) => (
                <Revelar key={n} delay={i * 0.08}>
                  <li className="h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] font-mono text-sm font-bold text-white">{n}</span>
                    <h3 className="mt-5 text-lg font-bold text-white">{t}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#a5abcf]">{d}</p>
                  </li>
                </Revelar>
              ))}
            </ol>
          </Container>
        </section>

        <SecaoPlanos compacta />

        <section className="py-16 sm:py-24">
          <Container>
            <Revelar>
              <div className="relative overflow-hidden rounded-[2rem] border border-[var(--brand)]/40 bg-[var(--brand)]/[0.1] px-6 py-14 text-center sm:px-12 sm:py-20">
                <h2 className="text-[clamp(1.75rem,4.2vw,3rem)] font-extrabold leading-[1.08] tracking-tight text-white">Comece a atender pelo sistema hoje.</h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-[#a5abcf]">Crie a conta da empresa, conecte o WhatsApp e deixe a IA encaminhar. Já tem conta? Entre.</p>
                <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <Botao href={caminhoDe(TELAS.criarConta)} alvo="final-criar">
                    Criar a conta da empresa <ArrowRight size={16} />
                  </Botao>
                  <Botao href={caminhoDe(TELAS.entrar)} variante="contorno" alvo="final-entrar">
                    Entrar
                  </Botao>
                </div>
                <p className="mt-6 text-xs text-[#6f76a0]">
                  Já usa o Stok Aí? Entre com a mesma conta.{' '}
                  <a href="/cloud" className="text-[#a5abcf] underline-offset-4 hover:text-white hover:underline">
                    Conhecer a SEVLA INFINITY
                  </a>
                </p>
              </div>
            </Revelar>
          </Container>
        </section>
      </main>
      <FooterDaVitrine />
    </div>
  );
}
