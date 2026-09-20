import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Bot, ChevronDown, CreditCard, Fingerprint, Infinity as Infinito, Layers, Lock, Menu, Rocket, Sparkles, X } from 'lucide-react';
import { DashboardMockup } from '@/pages/Home/DashboardMockup';
import { SEVLA, PRODUTOS, type ProdutoDoEcossistema } from './produto';
import { Botao, Container, MarcaDoProduto, MarcaSevla, Revelar, SimboloSevla, Titulo, cta } from './ui';
import { MockupDoAtende } from './MockupDoAtende';
import { Jatoba } from '@/features/jatoba/Jatoba';

/**
 * A página institucional da SEVLA INFINITY — o hub da empresa-mãe.
 *
 * Ordem de leitura: quem somos em uma frase (hero) → o conceito de
 * empresa-mãe (diagrama) → o ecossistema (os produtos, um a um) → cada
 * produto em destaque, com o produto de verdade na tela → a visão de uma
 * conta para tudo → a nossa visão → chamada final → rodapé. Os produtos
 * mantêm a própria identidade; a SEVLA é o que os conecta.
 */
export function Sevla() {
  return (
    <div className="min-h-dvh bg-[var(--fundo)] text-[var(--texto)]">
      <Header />
      <main>
        <Hero />
        <Faixa />
        <OQueE />
        {/* Os produtos, um a um, com o produto de verdade na tela. */}
        <div id="ecossistema" className="luz-suave">
          <ProdutoEmDestaque p={PRODUTOS[0]} invertido={false} numero="01">
            <DashboardMockup className="relative" />
          </ProdutoEmDestaque>
          <ProdutoEmDestaque p={PRODUTOS[1]} invertido numero="02">
            <MockupDoAtende />
          </ProdutoEmDestaque>
          <ProximoProduto />
        </div>
        <UmaConta />
        <Visao />
        <ChamadaFinal />
      </main>
      <Footer />
      {/* O Jatobá da casa: o ecossistema, os produtos, os planos e os combos, para quem está conhecendo. */}
      <Jatoba modo="home" produto="sevla" />
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Header
// ---------------------------------------------------------------------------

const MENU = [
  ['#inicio', 'Início'],
  ['#ecossistema', 'Ecossistema'],
  ['#produtos', 'Produtos'],
  ['#sobre', 'Sobre'],
  ['#contato', 'Contato'],
] as const;

function Header() {
  const [aberto, setAberto] = useState(false);
  const [entrarAberto, setEntrarAberto] = useState(false);
  const [rolou, setRolou] = useState(false);
  useEffect(() => {
    const f = () => setRolou(window.scrollY > 8);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  // Gaveta aberta: a página não rola por baixo.
  useEffect(() => {
    document.body.style.overflow = aberto ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [aberto]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors ${rolou || aberto ? 'border-b border-[var(--linha)] bg-[var(--fundo)]/85 backdrop-blur-xl' : 'border-b border-transparent'}`}>
      <Container className="flex h-[68px] items-center justify-between gap-4">
        <a href={SEVLA.base} className="shrink-0 rounded-lg" aria-label={`${SEVLA.nome} — início`} onClick={() => cta('header-logo')}>
          <MarcaSevla altura={44} />
        </a>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Seções">
          {MENU.map(([href, nome]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white">
              {nome}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <div className="relative" onMouseLeave={() => setEntrarAberto(false)}>
            <button type="button" onClick={() => setEntrarAberto((v) => !v)} className="inline-flex min-h-11 items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.06] hover:text-white" aria-haspopup="menu" aria-expanded={entrarAberto}>
              Entrar <ChevronDown size={14} className={`transition-transform ${entrarAberto ? 'rotate-180' : ''}`} />
            </button>
            {entrarAberto && (
              <div role="menu" className="absolute right-0 top-full mt-1 w-60 rounded-2xl border border-[var(--linha)] bg-[var(--fundo-2)] p-1.5 shadow-2xl">
                <a role="menuitem" href={SEVLA.conta} onClick={() => cta('header-entrar-sevla')} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06]">
                  <span className="flex items-center gap-2">
                    <SimboloSevla tamanho={20} className="rounded" />
                    Minha SEVLA
                  </span>
                  <ArrowRight size={14} className="text-[var(--primaria-clara)]" />
                </a>
                <p className="mt-1 border-t border-[var(--linha)] px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--suave)]">Direto no produto</p>
                {PRODUTOS.map((p) => (
                  <a key={p.id} role="menuitem" href={p.entrar} onClick={() => cta(`header-entrar-${p.id}`)} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-200 hover:bg-white/[0.06] hover:text-white">
                    <span className="flex items-center gap-2">
                      <img src={p.simbolo} alt="" className="h-5 w-5 rounded object-contain" aria-hidden />
                      {p.nome}
                    </span>
                    <ArrowUpRight size={14} className="text-slate-500" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <Botao href="#ecossistema" alvo="header-ecossistema">
            Conhecer o ecossistema
          </Botao>
        </div>
        <button type="button" onClick={() => setAberto((v) => !v)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-200 hover:bg-white/[0.06] lg:hidden" aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} aria-expanded={aberto}>
          {aberto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </Container>
      {aberto && (
        <div className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-[var(--linha)] bg-[var(--fundo)] lg:hidden">
          <Container className="py-4">
            <nav className="flex flex-col" aria-label="Seções">
              {MENU.map(([href, nome]) => (
                <a key={href} href={href} onClick={() => setAberto(false)} className="rounded-xl px-3 py-3 text-base font-medium text-slate-200 hover:bg-white/[0.06]">
                  {nome}
                </a>
              ))}
            </nav>
            <div className="mt-3 border-t border-[var(--linha)] pt-4">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--suave)]">Entrar</p>
              <a href={SEVLA.conta} onClick={() => cta('menu-entrar-sevla')} className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold text-white hover:bg-white/[0.06]">
                <SimboloSevla tamanho={24} className="rounded" />
                Minha SEVLA
                <ArrowRight size={16} className="ml-auto text-[var(--primaria-clara)]" />
              </a>
              {PRODUTOS.map((p) => (
                <a key={p.id} href={p.entrar} onClick={() => cta(`menu-entrar-${p.id}`)} className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-base text-slate-200 hover:bg-white/[0.06]">
                  <img src={p.simbolo} alt="" className="h-6 w-6 rounded object-contain" aria-hidden />
                  {p.nome}
                  <ArrowUpRight size={16} className="ml-auto text-slate-500" />
                </a>
              ))}
              <Botao href="#ecossistema" alvo="menu-ecossistema" className="mt-4 w-full" >
                Conhecer o ecossistema
              </Botao>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
//  Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section id="inicio" className="luz relative overflow-hidden pt-[calc(68px+3.5rem)] pb-16 sm:pt-[calc(68px+5rem)] sm:pb-24">
      <div className="malha pointer-events-none absolute inset-0" aria-hidden />
      <MalhaDeNos />
      {/* O infinito da marca, gigante e quase invisível, atrás de tudo. */}
      <span className="infinito pointer-events-none absolute -right-10 top-10 select-none font-display text-[22rem] font-bold leading-none text-white/[0.025] sm:text-[30rem] lg:-right-4 lg:top-0" aria-hidden>
        ∞
      </span>
      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <Revelar>
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--linha)] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--primaria-clara)]">
                <SimboloSevla tamanho={16} /> Empresa de tecnologia
              </span>
            </Revelar>
            <Revelar delay={0.08}>
              <h1 className="mt-7 text-[clamp(2.5rem,7vw,5.5rem)] font-bold leading-[0.98] tracking-[-0.03em] text-white">
                Tecnologia
                <br />
                que conecta
                <br />
                <span className="texto-gradiente">possibilidades.</span>
              </h1>
            </Revelar>
            <Revelar delay={0.16}>
              <p className="mt-7 max-w-xl text-[clamp(1.05rem,1.5vw,1.2rem)] leading-relaxed text-[var(--texto-suave)]">
                A SEVLA INFINITY cria produtos digitais com identidade própria — e os conecta por uma conta, um assistente e uma forma de trabalhar. Hoje, dois: o <span className="font-semibold text-white">Stok Aí</span>, para o estoque, e o <span className="font-semibold text-white">Atende Aí</span>, para o atendimento no WhatsApp.
              </p>
            </Revelar>
            <Revelar delay={0.24} className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Botao href="#produtos" alvo="hero-produtos">
                Conhecer os produtos <ArrowRight size={16} />
              </Botao>
              <Botao href={SEVLA.conta} variante="contorno" alvo="hero-conta">
                Entrar na minha SEVLA
              </Botao>
            </Revelar>
          </div>
          <Revelar delay={0.2} className="lg:col-span-5">
            <Orbita />
          </Revelar>
        </div>
      </Container>
    </section>
  );
}

/**
 * A órbita: o símbolo da SEVLA no centro e os produtos girando em volta
 * — cada um no próprio anel, cada um com a própria cor. O terceiro anel
 * tem uma vaga tracejada: o próximo produto. Tudo CSS; para no
 * prefers-reduced-motion.
 */
function Orbita() {
  return (
    <div className="orbita relative mx-auto aspect-square w-full max-w-[400px]">
      <span className="respira absolute inset-[18%] rounded-full bg-[var(--primaria)]/20 blur-3xl" aria-hidden />
      {/* Anéis */}
      <span className="absolute inset-[34%] rounded-full border border-[var(--primaria)]/40" aria-hidden />
      <span className="absolute inset-[22%] rounded-full border border-white/10" aria-hidden />
      <span className="absolute inset-[10%] rounded-full border border-dashed border-white/[0.08]" aria-hidden />
      {/* O centro */}
      <span className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--primaria)]/40 bg-[var(--fundo-2)] shadow-[0_0_60px_-10px_rgba(99,102,241,0.7)]">
        <SimboloSevla tamanho={56} className="flutua drop-shadow-[0_10px_30px_rgba(99,102,241,0.55)]" />
      </span>
      {/* Os produtos, girando — o contra-giro mantém o cartão em pé. */}
      <span className="gira absolute inset-[22%]" style={{ animationDuration: '26s' }} aria-hidden={false}>
        <NoDaOrbita p={PRODUTOS[0]} posicao="top" duracao="26s" />
      </span>
      <span className="gira absolute inset-[10%]" style={{ animationDuration: '38s', animationDelay: '-19s' }}>
        <NoDaOrbita p={PRODUTOS[1]} posicao="top" duracao="38s" atraso="-19s" />
      </span>
      {/* A vaga do próximo produto */}
      <span className="gira absolute inset-[34%]" style={{ animationDuration: '18s', animationDelay: '-6s' }} aria-hidden>
        <span className="absolute left-1/2 top-0 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-[var(--primaria-clara)]/60 bg-[var(--fundo)] text-[var(--primaria-clara)]">
          <span className="contragira block" style={{ animationDuration: '18s', animationDelay: '-6s' }}>
            <Sparkles size={12} />
          </span>
        </span>
      </span>
    </div>
  );
}

function NoDaOrbita({ p, posicao, duracao, atraso = '0s' }: { p: ProdutoDoEcossistema; posicao: 'top'; duracao: string; atraso?: string }) {
  void posicao;
  return (
    <a href={p.conhecer} onClick={() => cta(`orbita-${p.id}`)} className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" aria-label={`${p.nome} — ${p.categoria}`}>
      <span className="contragira cartao flex items-center gap-2 rounded-2xl px-3 py-2 shadow-lg" style={{ animationDuration: duracao, animationDelay: atraso, borderColor: `${p.cor}66` }}>
        <img src={p.simbolo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" aria-hidden />
        <span className="hidden min-w-0 sm:block">
          <span className="block whitespace-nowrap text-xs font-semibold text-white">{p.nome}</span>
          <span className="block whitespace-nowrap text-[10px] text-[var(--texto-suave)]">{p.categoria}</span>
        </span>
      </span>
    </a>
  );
}

/** A faixa que corre: o vocabulário da casa, sem promessa nenhuma. */
const FAIXA = ['Uma conta para todos os produtos', 'Cada produto com a própria identidade', 'O Jatobá em todos', 'Dados de cada empresa isolados', 'Cria · Desenvolve · Conecta', 'Stok Aí', 'Atende Aí', 'Novos produtos a caminho'];

function Faixa() {
  const itens = [...FAIXA, ...FAIXA];
  return (
    <div className="relative overflow-hidden border-y border-[var(--linha)] bg-[var(--fundo-2)]/60 py-3" aria-hidden>
      <div className="faixa flex w-max gap-10 whitespace-nowrap">
        {itens.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-10 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--suave)]">
            {t}
            <span className="h-1 w-1 rounded-full bg-[var(--primaria)]" />
          </span>
        ))}
      </div>
    </div>
  );
}

function NoDoProduto({ p, lado }: { p: ProdutoDoEcossistema; lado: 'esquerda' | 'direita' }) {
  return (
    <a href={p.conhecer} onClick={() => cta(`hero-no-${p.id}`)} className={`cartao group flex w-full max-w-[280px] items-center gap-3 rounded-2xl px-4 py-3 sm:w-auto ${lado === 'esquerda' ? 'sm:flex-row-reverse sm:text-right' : ''}`}>
      <img src={p.simbolo} alt="" className="h-10 w-10 shrink-0 rounded-xl object-contain" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{p.nome}</span>
        <span className="block truncate text-xs text-[var(--texto-suave)]">{p.categoria}</span>
      </span>
      <ArrowUpRight size={16} className={`shrink-0 text-slate-500 transition-colors group-hover:text-white ${lado === 'esquerda' ? 'sm:order-first' : 'ml-auto sm:ml-0'}`} />
    </a>
  );
}

/** Linhas finas ligando nós — a metáfora "conectar". Só decoração; some no celular para não poluir. */
function MalhaDeNos() {
  const reduzido = useReducedMotion();
  const nos: Array<[number, number]> = [
    [80, 120],
    [260, 60],
    [420, 180],
    [640, 90],
    [860, 160],
    [1080, 70],
    [1240, 190],
    [180, 320],
    [520, 360],
    [780, 330],
    [1020, 380],
    [1180, 300],
  ];
  const arestas: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [0, 7],
    [2, 8],
    [7, 8],
    [8, 9],
    [4, 9],
    [9, 10],
    [10, 11],
    [6, 11],
  ];
  return (
    <svg className="pointer-events-none absolute inset-x-0 top-0 hidden h-[520px] w-full opacity-70 sm:block" viewBox="0 0 1320 440" fill="none" preserveAspectRatio="xMidYMin slice" aria-hidden>
      <defs>
        <linearGradient id="sevla-aresta" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#3b82f6" stopOpacity="0.35" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id="sevla-no">
          <stop offset="0" stopColor="#a5b4fc" />
          <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
      </defs>
      {arestas.map(([a, b], i) => (
        <g key={i}>
          <line x1={nos[a][0]} y1={nos[a][1]} x2={nos[b][0]} y2={nos[b][1]} stroke="url(#sevla-aresta)" strokeWidth="1" />
          {!reduzido && i % 3 === 0 && <line x1={nos[a][0]} y1={nos[a][1]} x2={nos[b][0]} y2={nos[b][1]} stroke="#c7d2fe" strokeWidth="1.5" strokeLinecap="round" className="percorre" style={{ animationDelay: `${i * 0.9}s` }} />}
        </g>
      ))}
      {nos.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="10" fill="url(#sevla-no)" opacity="0.6" />
          <circle cx={x} cy={y} r="2.2" fill="#c7d2fe" />
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
//  O que é a SEVLA
// ---------------------------------------------------------------------------

const FATOS = [
  { numero: '2', rotulo: 'produtos no ar', texto: 'Stok Aí e Atende Aí — cada um resolve um problema inteiro, do começo ao fim.' },
  { numero: '1', rotulo: 'conta para tudo', texto: 'O mesmo e-mail e a mesma senha abrem todos os produtos. A SEVLA é a porta.' },
  { numero: '1', rotulo: 'assistente em todos', texto: 'O Jatobá está no site e dentro de cada produto — tira dúvida, consulta, ensina.' },
];

function OQueE() {
  return (
    <section id="sobre" className="relative py-20 sm:py-28">
      <Container>
        <Titulo alinhamento="esquerda" eyebrow="O que é a SEVLA" titulo="Uma empresa. Produtos com nome próprio. Uma só conta." texto="A SEVLA INFINITY cria, desenvolve e conecta produtos digitais. Cada um tem marca, cor e porta de entrada próprias — o que é comum fica na SEVLA: a identidade, o assistente, a cobrança." />
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-6">
          {/* Cria: os produtos, com as marcas de verdade */}
          <Revelar className="md:col-span-4">
            <article className="cartao brilho-inferior relative flex h-full flex-col overflow-hidden rounded-3xl p-6 sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--primaria-clara)]">Cria</p>
              <h3 className="mt-2 text-2xl font-bold text-white">Produtos que resolvem um problema inteiro.</h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--texto-suave)]">Não são módulos de um sistema só. O estoque de uma empresa e o atendimento dela no WhatsApp são problemas diferentes — e ganharam produtos diferentes.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {PRODUTOS.map((p) => (
                  <a key={p.id} href={p.conhecer} onClick={() => cta(`sobre-${p.id}`)} className="group flex items-center gap-3 rounded-2xl border border-[var(--linha)] bg-[var(--fundo)]/60 p-4 transition-colors hover:border-white/20">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${p.cor}22` }}>
                      <img src={p.simbolo} alt="" className="h-7 w-7 object-contain" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-sm font-bold text-white">{p.nome}</span>
                      <span className="block truncate text-xs" style={{ color: p.cor }}>
                        {p.categoria}
                      </span>
                    </span>
                    <ArrowUpRight size={16} className="ml-auto shrink-0 text-slate-500 transition-colors group-hover:text-white" />
                  </a>
                ))}
              </div>
            </article>
          </Revelar>
          {/* Conecta: a Minha SEVLA em miniatura */}
          <Revelar delay={0.08} className="md:col-span-2">
            <article className="cartao relative flex h-full flex-col overflow-hidden rounded-3xl p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--primaria-clara)]">Conecta</p>
              <h3 className="mt-2 text-xl font-bold text-white">Uma conta. Todas as portas.</h3>
              <div className="mt-5 rounded-2xl border border-[var(--linha)] bg-[var(--fundo)] p-3 text-xs">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--suave)]">Minha SEVLA</p>
                <p className="mt-1 font-display text-base font-bold text-white">Olá, Ana 👋</p>
                <ul className="mt-3 space-y-1.5">
                  {PRODUTOS.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg border border-[var(--linha)] px-2 py-1.5">
                      <img src={p.simbolo} alt="" className="h-4 w-4 rounded object-contain" aria-hidden />
                      <span className="flex-1 truncate text-white">{p.nome}</span>
                      <span className="fundo-gradiente rounded-full px-2 py-0.5 text-[10px] font-bold text-white">Acessar</span>
                    </li>
                  ))}
                </ul>
              </div>
              <a href={SEVLA.conta} onClick={() => cta('sobre-conta')} className="group mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-white">
                Entrar na minha SEVLA <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </a>
            </article>
          </Revelar>
          {/* Os fatos, sem inventar número */}
          {FATOS.map((f, i) => (
            <Revelar key={f.rotulo} delay={0.1 + i * 0.06} className="md:col-span-2">
              <article className="cartao flex h-full flex-col rounded-3xl p-6">
                <p className="font-display text-5xl font-bold leading-none text-white">
                  {f.numero}
                  <span className="ml-2 align-middle text-sm font-semibold uppercase tracking-[0.2em] text-[var(--primaria-clara)]">{f.rotulo}</span>
                </p>
                <p className="mt-4 text-sm leading-relaxed text-[var(--texto-suave)]">{f.texto}</p>
              </article>
            </Revelar>
          ))}
          {/* Evolui: a vaga do próximo, com o Jatobá */}
          <Revelar delay={0.3} className="md:col-span-6">
            <article className="cartao relative flex flex-col items-start gap-6 overflow-hidden rounded-3xl border-dashed p-6 sm:flex-row sm:items-center sm:p-8">
              <img src="/sevla/jatoba.png" alt="Jatobá, o mascote da SEVLA" width={96} height={96} className="h-24 w-24 shrink-0 object-contain drop-shadow-[0_10px_30px_rgba(99,102,241,0.5)]" decoding="async" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--primaria-clara)]">Evolui</p>
                <h3 className="mt-2 text-xl font-bold text-white">O Jatobá é a cara da casa — e o próximo produto ganha o mesmo tratamento.</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--texto-suave)]">Marca própria, a conta SEVLA já pronta, o assistente já dentro. Novos produtos nascem conectados, não colados.</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--linha)] px-4 py-2 text-sm font-semibold text-[var(--suave)]">
                Em breve <Infinito size={16} />
              </span>
            </article>
          </Revelar>
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
//  Cada produto em destaque
// ---------------------------------------------------------------------------

function ProdutoEmDestaque({ p, invertido, numero, children }: { p: ProdutoDoEcossistema; invertido: boolean; numero: string; children: ReactNode }) {
  return (
    <section id={p.id === 'stok' ? 'produtos' : undefined} className="relative overflow-hidden py-16 sm:py-24" aria-labelledby={`produto-${p.id}`}>
      <Container>
        <div className={`grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14`}>
          <Revelar className={`lg:col-span-5 ${invertido ? 'lg:order-2' : ''}`}>
            <p className="mb-5 flex items-center gap-3 font-display text-xs font-semibold uppercase tracking-[0.3em] text-[var(--suave)]">
              <span className="h-px w-8" style={{ background: p.cor }} /> Produto {numero}
            </p>
            <MarcaDoProduto p={p} tamanho={34} />
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: p.cor }}>
              {p.categoria}
            </p>
            <h2 id={`produto-${p.id}`} className="mt-3 text-[clamp(1.75rem,3.6vw,2.75rem)] font-bold leading-[1.08] text-white">
              {p.slogan}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--texto-suave)]">{p.descricao}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Botao href={p.conhecer} alvo={`destaque-${p.id}`} className="whitespace-nowrap">
                Conhecer o {p.nome} <ArrowRight size={16} />
              </Botao>
              <Botao href={p.entrar} variante="fantasma" alvo={`destaque-entrar-${p.id}`} className="whitespace-nowrap">
                Já sou cliente: entrar
              </Botao>
            </div>
          </Revelar>
          <Revelar delay={0.1} className={`min-w-0 lg:col-span-7 ${invertido ? 'lg:order-1' : ''}`}>
            <div className="relative">
              <div className="absolute -inset-6 rounded-[2rem] blur-3xl" style={{ background: `${p.cor}1f` }} aria-hidden />
              <div className="relative">{children}</div>
            </div>
          </Revelar>
        </div>
      </Container>
    </section>
  );
}

/** O terceiro lugar: o próximo produto, sem prometer o que é. */
function ProximoProduto() {
  return (
    <section className="relative pb-16 sm:pb-24">
      <Container>
        <Revelar>
          <div className="cartao flex flex-col items-start gap-4 rounded-3xl border-dashed p-6 sm:flex-row sm:items-center sm:p-8">
            <p className="flex items-center gap-3 font-display text-xs font-semibold uppercase tracking-[0.3em] text-[var(--suave)]">
              <span className="h-px w-8 bg-[var(--primaria)]" /> Produto 03
            </p>
            <p className="flex-1 text-sm leading-relaxed text-[var(--texto-suave)]">
              <span className="font-display text-base font-bold text-white">O próximo pode estar aqui.</span> A SEVLA INFINITY está em evolução: novos produtos nascem com a conta SEVLA e o Jatobá já dentro.
            </p>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--suave)]">
              Em breve <Infinito size={16} />
            </span>
          </div>
        </Revelar>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
//  Uma conta, todo o ecossistema (visão)
// ---------------------------------------------------------------------------

const CONEXOES = [
  { icone: <Fingerprint size={18} />, titulo: 'Uma identidade', texto: 'O mesmo e-mail e a mesma senha em todos os produtos. Entrou uma vez, abriu todos — cada produto confere o que você pode ali.' },
  { icone: <Bot size={18} />, titulo: 'Um assistente', texto: 'O Jatobá conhece cada produto: no site tira dúvida; dentro, consulta, ensina e abre a tela certa.' },
  { icone: <CreditCard size={18} />, titulo: 'Uma cobrança', texto: 'Planos por produto, o mesmo jeito de assinar (cartão pelo Mercado Pago), recibo e nota fiscal iguais.' },
  { icone: <Lock size={18} />, titulo: 'Dados separados', texto: 'Cada empresa vê só o que é dela, em cada produto, garantido no banco — não na tela.' },
];

function UmaConta() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="pontos pointer-events-none absolute left-6 top-16 hidden h-24 w-24 opacity-60 lg:block" aria-hidden />
      <div className="pontos pointer-events-none absolute bottom-16 right-6 hidden h-24 w-24 opacity-60 lg:block" aria-hidden />
      <Container>
        <Titulo eyebrow="O que a SEVLA conecta" titulo="Uma conta. Todo o ecossistema." texto="Quatro coisas são iguais em todos os produtos da casa. O resto é de cada um." />
        <div className="relative mt-14">
          <span className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-[var(--primaria)] to-transparent lg:block" aria-hidden />
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CONEXOES.map((c, i) => (
              <Revelar key={c.titulo} delay={i * 0.08}>
                <li className="relative">
                  <span className="fundo-gradiente relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.9)] ring-8 ring-[var(--fundo)]">{c.icone}</span>
                  <h3 className="mt-5 font-display text-lg font-bold text-white">{c.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--texto-suave)]">{c.texto}</p>
                </li>
              </Revelar>
            ))}
          </ul>
        </div>
        <Revelar delay={0.15} className="mt-14 flex flex-col items-center gap-4 text-center">
          <Botao href={SEVLA.conta} alvo="uma-conta-entrar">
            Entrar na minha SEVLA <ArrowRight size={16} />
          </Botao>
          <p className="max-w-md text-xs leading-relaxed text-[var(--suave)]">O mesmo e-mail e a mesma senha que você já usa no Stok Aí ou no Atende Aí. Cada produto continua com a própria porta; a SEVLA é a que abre todas.</p>
        </Revelar>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
//  Visão
// ---------------------------------------------------------------------------

const VISAO = [
  { icone: <Sparkles size={20} />, titulo: 'Inovação', texto: 'Transformamos ideias em produtos digitais.' },
  { icone: <Layers size={20} />, titulo: 'Ecossistema', texto: 'Produtos independentes conectados por uma mesma visão.' },
  { icone: <Rocket size={20} />, titulo: 'Escala', texto: 'Construímos pensando no presente e no que pode vir depois.' },
];

function Visao() {
  return (
    <section className="luz-suave relative py-20 sm:py-28">
      <Container>
        <Titulo alinhamento="esquerda" eyebrow="Nossa visão" titulo="Construindo além do próximo produto." />
        <Revelar delay={0.05} className="mt-10 max-w-4xl">
          <p className="font-display text-[clamp(1.5rem,3.2vw,2.5rem)] font-semibold leading-[1.25] tracking-[-0.01em] text-[var(--texto-suave)]">
            Acreditamos que tecnologia boa é a que <span className="text-white">some no dia a dia</span>: a equipe registra pelo WhatsApp, a IA encaminha o cliente certo, o dono vê o número de verdade. Cada produto nasce para <span className="text-white">resolver um problema inteiro</span> — e, ao entrar na SEVLA, passa a <span className="texto-gradiente">conversar com os outros</span>.
          </p>
        </Revelar>
        <div className="mt-14 grid grid-cols-1 overflow-hidden rounded-3xl border border-[var(--linha)] bg-[var(--fundo-2)]/60 md:grid-cols-3">
          {VISAO.map((v, i) => (
            <Revelar key={v.titulo} delay={i * 0.08} className={`p-7 sm:p-9 ${i > 0 ? 'border-t border-[var(--linha)] md:border-l md:border-t-0' : ''}`}>
              <span className="fundo-gradiente inline-flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.8)]">{v.icone}</span>
              <h3 className="mt-6 text-lg font-bold uppercase tracking-[0.12em] text-white">{v.titulo}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--texto-suave)]">{v.texto}</p>
            </Revelar>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
//  Chamada final e rodapé
// ---------------------------------------------------------------------------

function ChamadaFinal() {
  return (
    <section id="contato" className="relative py-16 sm:py-24">
      <Container>
        <Revelar>
          <div className="borda-gradiente relative overflow-hidden rounded-[2rem] bg-[var(--fundo-2)] px-6 py-14 text-center sm:px-12 sm:py-20">
            <div className="luz pointer-events-none absolute inset-0" aria-hidden />
            <div className="malha pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative">
              <SimboloSevla tamanho={56} className="mx-auto flutua drop-shadow-[0_10px_30px_rgba(99,102,241,0.55)]" />
              <h2 className="mt-8 text-[clamp(1.75rem,4.2vw,3rem)] font-bold leading-[1.08] text-white">O futuro começa com uma possibilidade.</h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--texto-suave)]">Conheça os produtos que já fazem parte da SEVLA INFINITY.</p>
              <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Botao href="#produtos" alvo="final-produtos">
                  Explorar produtos <ArrowRight size={16} />
                </Botao>
                <Botao href="#sobre" variante="contorno" alvo="final-sevla">
                  Conhecer a SEVLA
                </Botao>
              </div>
              <p className="mt-8 text-sm text-[var(--texto-suave)]">
                Fale com a gente:{' '}
                <a href={SEVLA.contato.linkWhatsApp('Olá! Vim pelo site da SEVLA INFINITY e quero conhecer os produtos.')} target="_blank" rel="noreferrer" onClick={() => cta('final-whatsapp')} className="font-semibold text-white underline-offset-4 hover:underline">
                  WhatsApp
                </a>{' '}
                ·{' '}
                <a href={`mailto:${SEVLA.contato.email}`} onClick={() => cta('final-email')} className="font-semibold text-white underline-offset-4 hover:underline">
                  {SEVLA.contato.email}
                </a>
              </p>
            </div>
          </div>
        </Revelar>
      </Container>
    </section>
  );
}

function Footer() {
  const coluna = 'text-sm text-[var(--texto-suave)] transition-colors hover:text-white';
  return (
    <footer className="border-t border-[var(--linha)] py-12 sm:py-16">
      <Container>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <MarcaSevla altura={52} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--texto-suave)]">
              <span className="block font-semibold text-white">SEVLA INFINITY</span>
              {SEVLA.slogan}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--suave)]">Empresa</p>
              <ul className="mt-4 space-y-2.5">
                <li><a href="#sobre" className={coluna}>Sobre a SEVLA</a></li>
                <li><a href="#ecossistema" className={coluna}>Ecossistema</a></li>
                <li><a href="#produtos" className={coluna}>Produtos</a></li>
                <li><a href="#contato" className={coluna}>Contato</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--suave)]">Produtos</p>
              <ul className="mt-4 space-y-2.5">
                {PRODUTOS.map((p) => (
                  <li key={p.id}>
                    <a href={p.conhecer} onClick={() => cta(`footer-${p.id}`)} className={coluna}>
                      {p.nome}
                    </a>
                  </li>
                ))}
                <li><span className="text-sm text-[var(--suave)]">Novos produtos · em breve</span></li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--suave)]">Acesso e legal</p>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a href={SEVLA.conta} onClick={() => cta('footer-entrar-sevla')} className={coluna}>
                    Minha SEVLA
                  </a>
                </li>
                {PRODUTOS.map((p) => (
                  <li key={p.id}>
                    <a href={p.entrar} onClick={() => cta(`footer-entrar-${p.id}`)} className={coluna}>
                      Entrar no {p.nome}
                    </a>
                  </li>
                ))}
                <li><a href="/termos" className={coluna}>Termos de uso</a></li>
                <li><a href="/privacidade" className={coluna}>Privacidade</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-[var(--linha)] pt-6 text-xs text-[var(--suave)] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 SEVLA INFINITY. Todos os direitos reservados.</p>
          <p>Stok Aí e Atende Aí são produtos da SEVLA INFINITY.</p>
        </div>
      </Container>
    </footer>
  );
}
