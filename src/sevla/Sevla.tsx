import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, ChevronDown, Infinity as Infinito, Layers, Menu, Rocket, Sparkles, X } from 'lucide-react';
import { DashboardMockup } from '@/pages/Home/DashboardMockup';
import { SEVLA, PRODUTOS, type ProdutoDoEcossistema } from './produto';
import { Botao, Container, MarcaDoProduto, MarcaSevla, Revelar, SimboloSevla, Titulo, cta } from './ui';
import { MockupDoAtende } from './MockupDoAtende';

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
        <OQueE />
        <Ecossistema />
        <ProdutoEmDestaque p={PRODUTOS[0]} invertido={false}>
          <DashboardMockup className="relative" />
        </ProdutoEmDestaque>
        <ProdutoEmDestaque p={PRODUTOS[1]} invertido>
          <MockupDoAtende />
        </ProdutoEmDestaque>
        <UmaConta />
        <Visao />
        <ChamadaFinal />
      </main>
      <Footer />
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
    <section id="inicio" className="luz relative overflow-hidden pt-[calc(68px+4.5rem)] pb-20 sm:pt-[calc(68px+6rem)] sm:pb-28">
      <div className="malha pointer-events-none absolute inset-0" aria-hidden />
      <MalhaDeNos />
      <Container className="relative">
        <div className="mx-auto max-w-4xl text-center">
          <Revelar>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--linha)] bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--primaria-clara)]">
              <SimboloSevla tamanho={16} /> SEVLA INFINITY
            </span>
          </Revelar>
          <Revelar delay={0.08}>
            <h1 className="mt-7 text-[clamp(2.25rem,6.2vw,4.75rem)] font-bold leading-[1.02] text-white">
              Tecnologia que conecta <span className="texto-gradiente">possibilidades.</span>
            </h1>
          </Revelar>
          <Revelar delay={0.16}>
            <p className="mx-auto mt-6 max-w-2xl text-[clamp(1.05rem,1.6vw,1.25rem)] leading-relaxed text-[var(--texto-suave)]">{SEVLA.descricao}</p>
          </Revelar>
          <Revelar delay={0.24} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Botao href="#ecossistema" alvo="hero-ecossistema">
              Conhecer o ecossistema <ArrowRight size={16} />
            </Botao>
            <Botao href="#produtos" variante="contorno" alvo="hero-produtos">
              Explorar produtos
            </Botao>
          </Revelar>
        </div>

        {/* Os produtos, como constelação em volta do símbolo. */}
        <Revelar delay={0.3} className="mx-auto mt-16 max-w-3xl sm:mt-20">
          <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
            <NoDoProduto p={PRODUTOS[0]} lado="esquerda" />
            <div className="relative flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
              <span className="respira absolute inset-0 rounded-full bg-[var(--primaria)]/25 blur-2xl" aria-hidden />
              <span className="absolute inset-0 rounded-full border border-[var(--primaria)]/40" aria-hidden />
              <SimboloSevla tamanho={64} className="relative flutua drop-shadow-[0_10px_30px_rgba(99,102,241,0.55)]" />
            </div>
            <NoDoProduto p={PRODUTOS[1]} lado="direita" />
          </div>
          <p className="mt-6 text-center text-xs uppercase tracking-[0.22em] text-[var(--suave)]">Uma empresa · Vários produtos · Um ecossistema</p>
        </Revelar>
      </Container>
    </section>
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

function OQueE() {
  return (
    <section id="sobre" className="relative py-20 sm:py-28">
      <Container>
        <Titulo eyebrow="O que é a SEVLA" titulo="Uma empresa. Múltiplas possibilidades." texto="A SEVLA INFINITY é uma empresa de tecnologia que desenvolve produtos digitais independentes, conectados por uma mesma visão: transformar problemas reais em soluções simples, inteligentes e escaláveis." />
        <Revelar delay={0.1} className="mt-14">
          <Arvore
            raiz={
              <div className="borda-gradiente flex items-center gap-3 rounded-2xl bg-[var(--fundo-2)] px-5 py-4">
                <SimboloSevla tamanho={36} />
                <span>
                  <span className="block font-display text-base font-bold text-white">SEVLA INFINITY</span>
                  <span className="block text-xs text-[var(--texto-suave)]">Empresa-mãe · cria, desenvolve e conecta</span>
                </span>
              </div>
            }
            folhas={PRODUTOS.map((p) => ({
              chave: p.id,
              conteudo: (
                <a href={p.conhecer} onClick={() => cta(`arvore-${p.id}`)} className="cartao flex items-center gap-3 rounded-2xl px-5 py-4">
                  <img src={p.simbolo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-display text-sm font-bold text-white">{p.nome}</span>
                    <span className="block text-xs text-[var(--texto-suave)]">{p.categoria}</span>
                  </span>
                </a>
              ),
            }))}
          />
        </Revelar>
      </Container>
    </section>
  );
}

/**
 * A árvore raiz → folhas, desenhada com CSS: no desktop os ramos saem de um
 * tronco central; no celular vira uma coluna com um traço vertical. Sem
 * SVG de largura fixa — tudo em porcentagem.
 */
function Arvore({ raiz, folhas, tres = false }: { raiz: ReactNode; folhas: Array<{ chave: string; conteudo: ReactNode }>; tres?: boolean }) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex justify-center">{raiz}</div>
      {/* Tronco */}
      <div className="mx-auto h-8 w-px bg-gradient-to-b from-[var(--primaria)] to-[var(--violeta)]" aria-hidden />
      {/* Ramo horizontal (só com 2+ colunas) */}
      <div className={`relative mx-auto hidden h-px bg-gradient-to-r from-[var(--azul)] via-[var(--primaria)] to-[var(--violeta)] sm:block ${tres ? 'w-2/3' : 'w-1/2'}`} aria-hidden />
      <div className={`grid grid-cols-1 gap-3 sm:gap-8 md:gap-12 ${tres ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {folhas.map((f, i) => (
          <div key={f.chave} className="flex flex-col items-center">
            <div className={`h-8 w-px bg-gradient-to-b from-[var(--primaria)] to-transparent ${i > 0 ? 'hidden sm:block' : ''}`} aria-hidden />
            <div className="w-full max-w-sm">{f.conteudo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Ecossistema
// ---------------------------------------------------------------------------

function Ecossistema() {
  return (
    <section id="ecossistema" className="luz-suave relative py-20 sm:py-28">
      <Container>
        <Titulo eyebrow="Nosso ecossistema" titulo="Produtos que resolvem problemas diferentes" texto="Produtos desenvolvidos para resolver diferentes desafios, conectados pela mesma tecnologia." />
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {PRODUTOS.map((p, i) => (
            <Revelar key={p.id} delay={i * 0.08}>
              <CartaoDoProduto p={p} />
            </Revelar>
          ))}
          <Revelar delay={0.16}>
            <article className="cartao brilho-inferior flex h-full flex-col rounded-3xl border-dashed p-6 sm:p-7">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--linha)] bg-white/[0.03] text-[var(--primaria-clara)]">
                <Sparkles size={20} />
              </span>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--suave)]">Novos produtos</p>
              <h3 className="mt-2 text-xl font-bold text-white">O próximo pode estar aqui.</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--texto-suave)]">A SEVLA INFINITY está em constante evolução. Novos produtos e soluções digitais poderão fazer parte do nosso ecossistema.</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--suave)]">
                Em breve <Infinito size={16} />
              </span>
            </article>
          </Revelar>
        </div>
      </Container>
    </section>
  );
}

function CartaoDoProduto({ p }: { p: ProdutoDoEcossistema }) {
  return (
    <article className="cartao brilho-inferior flex h-full flex-col rounded-3xl p-6 sm:p-7">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${p.cor}22` }}>
        <img src={p.simbolo} alt="" className="h-7 w-7 object-contain" aria-hidden />
      </span>
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: p.cor }}>
        {p.categoria}
      </p>
      <h3 className="mt-2 text-xl font-bold text-white">{p.nome}</h3>
      <p className="mt-1 text-sm font-medium text-slate-300">{p.slogan}</p>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--texto-suave)]">{p.descricao}</p>
      <a href={p.conhecer} onClick={() => cta(`card-${p.id}`)} className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white">
        Conhecer o {p.nome} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </a>
    </article>
  );
}

// ---------------------------------------------------------------------------
//  Cada produto em destaque
// ---------------------------------------------------------------------------

function ProdutoEmDestaque({ p, invertido, children }: { p: ProdutoDoEcossistema; invertido: boolean; children: ReactNode }) {
  return (
    <section id={p.id === 'stok' ? 'produtos' : undefined} className="relative overflow-hidden py-16 sm:py-24" aria-labelledby={`produto-${p.id}`}>
      <Container>
        <div className={`grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14`}>
          <Revelar className={`lg:col-span-5 ${invertido ? 'lg:order-2' : ''}`}>
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

// ---------------------------------------------------------------------------
//  Uma conta, todo o ecossistema (visão)
// ---------------------------------------------------------------------------

function UmaConta() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="pontos pointer-events-none absolute left-6 top-16 hidden h-24 w-24 opacity-60 lg:block" aria-hidden />
      <div className="pontos pointer-events-none absolute bottom-16 right-6 hidden h-24 w-24 opacity-60 lg:block" aria-hidden />
      <Container>
        <Titulo eyebrow="Conta SEVLA" titulo="Uma conta. Todo o ecossistema." texto="Uma identidade para acessar os produtos e experiências da SEVLA INFINITY." />
        <Revelar delay={0.1} className="mt-14">
          <Arvore
            raiz={
              <div className="borda-gradiente flex items-center gap-3 rounded-2xl bg-[var(--fundo-2)] px-5 py-4">
                <span className="fundo-gradiente flex h-9 w-9 items-center justify-center rounded-xl text-white">
                  <Layers size={18} />
                </span>
                <span>
                  <span className="block font-display text-base font-bold text-white">Conta SEVLA</span>
                  <span className="block text-xs text-[var(--texto-suave)]">Uma identidade, todos os produtos</span>
                </span>
              </div>
            }
            folhas={[
              ...PRODUTOS.map((p) => ({
                chave: p.id,
                conteudo: (
                  <div className="cartao flex items-center gap-3 rounded-2xl px-5 py-4">
                    <img src={p.simbolo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-display text-sm font-bold text-white">{p.nome}</span>
                      <span className="block text-xs text-[var(--texto-suave)]">{p.categoria}</span>
                    </span>
                  </div>
                ),
              })),
              {
                chave: 'futuros',
                conteudo: (
                  <div className="cartao flex items-center gap-3 rounded-2xl border-dashed px-5 py-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--linha)] text-[var(--primaria-clara)]">
                      <Sparkles size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-sm font-bold text-white">Futuros produtos</span>
                      <span className="block text-xs text-[var(--texto-suave)]">Em breve</span>
                    </span>
                  </div>
                ),
              },
            ]}
            tres
          />
        </Revelar>
        <Revelar delay={0.15} className="mt-12 flex flex-col items-center gap-4 text-center">
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
        <Titulo eyebrow="Nossa visão" titulo="Construindo além do próximo produto." texto="A SEVLA INFINITY nasceu com uma visão simples: criar tecnologia que não apenas resolve problemas, mas abre espaço para novas possibilidades." />
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
