import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Bot, Check, ChevronDown, Layers, LockKeyhole, MessageCircle, Sparkles, Users } from 'lucide-react';
import { track } from '@/lib/analytics';
import { linkWhatsApp, whatsappFormatado } from '@/shared/produto';
import { CLOUD, ESPECTRO } from './produto';
import { SISTEMAS, COMBOS, AVALIACAO_DIAS, type Sistema, type Combo } from './catalogo';

/**
 * A Home do Cloud Aí — a casa dos sistemas "Aí".
 *
 * Ordem de leitura: a ideia (uma casa, vários sistemas, um controle) → os
 * sistemas, um a um, com o que cada um entrega → o que liga tudo (WhatsApp da
 * empresa, a IA, uma conta) → os combos → dúvidas → chamada final. E, para
 * quem já é cliente, a porta de cada sistema logo abaixo do topo — o
 * "acesse seu sistema" fica onde não atrapalha a venda.
 */

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cta = (alvo: string) => track('cloud_cta', { alvo });

// ---------------------------------------------------------------------------
//  Primitivos
// ---------------------------------------------------------------------------

function Container({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Revelar({ className = '', delay = 0, children }: { className?: string; delay?: number; children: ReactNode }) {
  const reduzido = useReducedMotion();
  if (reduzido) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -60px 0px' }} transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

function Eyebrow({ cor = 'var(--ciano)', children }: { cor?: string; children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: cor }}>
      {children}
    </p>
  );
}

type Variante = 'primario' | 'fantasma' | 'contorno';
function Botao({ href, variante = 'primario', className = '', alvo, children, externo }: { href: string; variante?: Variante; className?: string; alvo: string; children: ReactNode; externo?: boolean }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all active:scale-[0.98]';
  const estilos: Record<Variante, string> = {
    primario: 'bg-white text-[#0b1020] shadow-[0_10px_30px_-10px_rgba(255,255,255,0.45)] hover:bg-slate-100',
    fantasma: 'text-slate-200 hover:bg-white/[0.06] hover:text-white',
    contorno: 'border border-white/15 text-white hover:border-white/40 hover:bg-white/[0.04]',
  };
  return (
    <a href={href} onClick={() => cta(alvo)} className={`${base} ${estilos[variante]} ${className}`} {...(externo ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {children}
    </a>
  );
}

/** A marca de um sistema em fundo escuro: o arquivo, ou símbolo + nome desenhado. */
function MarcaDoSistema({ s, tamanho = 28 }: { s: Sistema; tamanho?: number }) {
  if (s.logo) return <img src={s.logo} alt={s.nome} style={{ height: tamanho }} className="w-auto select-none" draggable={false} />;
  const [primeira, segunda] = s.nome.split(' ');
  return (
    <span className="inline-flex items-center gap-2 font-extrabold tracking-tight text-white" style={{ fontSize: tamanho * 0.78 }}>
      {s.simbolo && <img src={s.simbolo} alt="" width={tamanho} height={tamanho} className="select-none" draggable={false} />}
      <span>
        {primeira} <span style={{ color: s.cor }}>{segunda}</span>
      </span>
    </span>
  );
}

/** A marca da casa: nuvem em traço fino com o espectro dentro, e o nome. */
function MarcaCloud({ tamanho = 30 }: { tamanho?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-extrabold tracking-tight text-white" style={{ fontSize: tamanho * 0.8 }} aria-label={CLOUD.nome}>
      <svg width={tamanho * 1.25} height={tamanho} viewBox="0 0 40 32" aria-hidden="true">
        <defs>
          <linearGradient id="cloud-esp" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={ESPECTRO[0]} />
            <stop offset="0.5" stopColor={ESPECTRO[1]} />
            <stop offset="1" stopColor={ESPECTRO[2]} />
          </linearGradient>
        </defs>
        <path d="M11 27h18a8 8 0 0 0 1.6-15.84A10 10 0 0 0 11.5 9.2 7.5 7.5 0 0 0 11 27z" fill="url(#cloud-esp)" opacity="0.95" />
        <circle cx="15" cy="20" r="1.8" fill="#fff" />
        <circle cx="21" cy="20" r="1.8" fill="#fff" />
        <circle cx="27" cy="20" r="1.8" fill="#fff" />
      </svg>
      <span>
        Cloud <span className="texto-espectro">Aí</span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
//  A página
// ---------------------------------------------------------------------------

export function Cloud() {
  return (
    <div className="cloud min-h-screen">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-[#0b1020]">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo">
        <Hero />
        <Acessar />
        <Sistemas />
        <OQueLigaTudo />
        <Combos />
        <Perguntas />
        <ChamadaFinal />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const [aberto, setAberto] = useState(false);
  const links = [
    ['#sistemas', 'Sistemas'],
    ['#como-funciona', 'Como funciona'],
    ['#combos', 'Combos'],
    ['#perguntas', 'Perguntas'],
  ] as const;
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#050b18]/70 backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href={CLOUD.base} className="rounded-lg" aria-label={`${CLOUD.nome} — início`}>
          <MarcaCloud />
        </a>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Seções">
          {links.map(([href, nome]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white">
              {nome}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Botao href="#acessar" variante="fantasma" alvo="header-acessar">
            Acessar meu sistema
          </Botao>
          <Botao href={linkWhatsApp('Olá! Vim pelo Cloud Aí e quero conhecer os sistemas.')} alvo="header-whatsapp" externo>
            Falar com a gente
          </Botao>
        </div>
        <button type="button" onClick={() => setAberto((v) => !v)} className="rounded-lg p-2 text-slate-200 md:hidden" aria-label="Menu" aria-expanded={aberto}>
          <ChevronDown size={20} className={`transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      </Container>
      {aberto && (
        <div className="border-t border-white/[0.06] bg-[#050b18]/95 px-5 py-3 md:hidden">
          {links.map(([href, nome]) => (
            <a key={href} href={href} onClick={() => setAberto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-200">
              {nome}
            </a>
          ))}
          <a href="#acessar" onClick={() => setAberto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--ciano)]">
            Acessar meu sistema
          </a>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const reduzido = useReducedMotion();
  const entrada = (delay: number) => (reduzido ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const } });
  return (
    <section className="aurora relative overflow-hidden pb-20 pt-32 sm:pt-40" aria-labelledby="hero-titulo">
      <div className="grade absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden />
      <Container className="relative grid items-center gap-14 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div className="max-w-2xl">
          <motion.div {...entrada(0)}>
            <Eyebrow>Cloud Aí · A casa dos sistemas Aí</Eyebrow>
          </motion.div>
          <motion.h1 id="hero-titulo" {...entrada(0.08)} className="mt-4 text-[2.7rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-[4.2rem]">
            Uma casa.
            <br />
            Vários sistemas.
            <br />
            <span className="texto-espectro">Um só controle.</span>
          </motion.h1>
          <motion.p {...entrada(0.16)} className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
            {CLOUD.descricao}
          </motion.p>
          <motion.div {...entrada(0.24)} className="mt-9 flex flex-wrap items-center gap-3">
            <Botao href="#sistemas" alvo="hero-sistemas">
              Ver os sistemas <ArrowRight size={16} />
            </Botao>
            <Botao href="#combos" variante="contorno" alvo="hero-combos">
              Montar meu combo
            </Botao>
          </motion.div>
          <motion.ul {...entrada(0.32)} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
            {[`${AVALIACAO_DIAS} dias grátis em cada sistema`, 'O WhatsApp da sua empresa', 'Dados isolados por empresa'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--ciano)]" /> {t}
              </li>
            ))}
          </motion.ul>
        </div>
        <motion.div {...entrada(0.2)} className="relative mx-auto w-full max-w-md lg:max-w-none">
          <Constelacao />
        </motion.div>
      </Container>
    </section>
  );
}

/** Os sistemas em volta da casa, ligados por linhas: a imagem da família. */
function Constelacao() {
  const [stok, atende] = SISTEMAS;
  return (
    <div className="relative aspect-[5/4]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 500 400" aria-hidden="true">
        <defs>
          <linearGradient id="linha-a" x1="0" x2="1">
            <stop offset="0" stopColor={stok.cor} stopOpacity="0.9" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="linha-b" x1="0" x2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.6" />
            <stop offset="1" stopColor={atende.cor} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <path d="M120 110 C 180 150, 200 180, 250 205" stroke="url(#linha-a)" strokeWidth="1.5" fill="none" strokeDasharray="4 6" />
        <path d="M250 205 C 300 230, 330 260, 385 300" stroke="url(#linha-b)" strokeWidth="1.5" fill="none" strokeDasharray="4 6" />
        <path d="M250 205 C 290 160, 330 130, 395 105" stroke="rgba(148,163,184,0.35)" strokeWidth="1.5" fill="none" strokeDasharray="4 6" />
        <circle cx="250" cy="205" r="46" fill="rgba(34,211,238,0.10)" />
        <circle cx="250" cy="205" r="46" stroke="rgba(34,211,238,0.5)" strokeWidth="1" fill="none" />
      </svg>
      {/* A casa, no centro */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center">
        <MarcaCloud tamanho={34} />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-400">uma conta · uma IA</span>
      </div>
      {/* Stok Aí */}
      <div className="flutua vidro absolute left-[2%] top-[8%] w-[46%] rounded-2xl p-4 shadow-2xl" style={{ boxShadow: `0 24px 60px -20px ${stok.corSuave}` }}>
        <MarcaDoSistema s={stok} tamanho={26} />
        <p className="mt-2 text-xs leading-snug text-slate-300">{stok.chamada}</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: stok.cor }}>
          estoque · no ar
        </p>
      </div>
      {/* Atende Aí */}
      <div className="flutua vidro absolute bottom-[6%] right-[2%] w-[48%] rounded-2xl p-4 shadow-2xl [animation-delay:-2s]" style={{ boxShadow: `0 24px 60px -20px ${atende.corSuave}` }}>
        <MarcaDoSistema s={atende} tamanho={26} />
        <p className="mt-2 text-xs leading-snug text-slate-300">{atende.chamada}</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: atende.cor }}>
          atendimento · no ar
        </p>
      </div>
      {/* O próximo */}
      <div className="flutua absolute right-[4%] top-[6%] w-[38%] rounded-2xl border border-dashed border-white/15 p-4 [animation-delay:-4s]">
        <p className="text-sm font-extrabold text-slate-300">
          Próximo <span className="text-slate-500">Aí</span>
        </p>
        <p className="mt-1.5 text-xs leading-snug text-slate-500">Nasce dos mesmos dados, na mesma conta.</p>
      </div>
    </div>
  );
}

/** Quem já é cliente: a porta de cada sistema, discreta e à mão. */
function Acessar() {
  return (
    <section id="acessar" className="relative border-y border-white/[0.06] bg-white/[0.02]" aria-labelledby="acessar-titulo">
      <Container className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="acessar-titulo" className="text-base font-extrabold text-white">
            Já é cliente? Entre no seu sistema.
          </h2>
          <p className="text-sm text-slate-400">Cada sistema tem a própria entrada; quem tem os dois entra com a mesma conta.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SISTEMAS.map((s) => (
            <a key={s.id} href={s.entrar} onClick={() => cta(`acessar-${s.id}`)} className="vidro group inline-flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors hover:bg-white/[0.08]">
              {s.simbolo && <img src={s.simbolo} alt="" width={22} height={22} className="select-none" />}
              <span className="text-sm font-bold text-white">{s.nome}</span>
              <ArrowUpRight size={15} className="text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" style={{ color: s.cor }} />
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Sistemas() {
  return (
    <section id="sistemas" className="py-24" aria-labelledby="sistemas-titulo">
      <Container>
        <Revelar className="max-w-2xl">
          <Eyebrow>Os sistemas</Eyebrow>
          <h2 id="sistemas-titulo" className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Cada um resolve uma coisa inteira.
          </h2>
          <p className="mt-4 text-lg text-slate-400">Não é um sistema com módulos: são produtos completos, que nasceram na mesma casa e por isso conversam entre si.</p>
        </Revelar>
        <div className="mt-14 space-y-8">
          {SISTEMAS.map((s, i) => (
            <CartaoDoSistema key={s.id} s={s} invertido={i % 2 === 1} />
          ))}
          <Revelar>
            <div className="flex flex-col items-start gap-4 rounded-3xl border border-dashed border-white/15 p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-extrabold text-white">
                  O próximo <span className="text-slate-500">Aí</span> já está no mapa.
                </p>
                <p className="mt-1 max-w-xl text-sm text-slate-400">Cada sistema novo nasce dos mesmos dados, na mesma conta, com a mesma IA. Quem já está na casa recebe primeiro.</p>
              </div>
              <Botao href={linkWhatsApp('Olá! Quero saber o que vem por aí no Cloud Aí.')} variante="contorno" alvo="proximo-whatsapp" externo>
                Quero saber o que vem <ArrowUpRight size={15} />
              </Botao>
            </div>
          </Revelar>
        </div>
      </Container>
    </section>
  );
}

function CartaoDoSistema({ s, invertido }: { s: Sistema; invertido: boolean }) {
  return (
    <Revelar>
      <article className="vidro relative overflow-hidden rounded-3xl" style={{ boxShadow: `0 40px 100px -40px ${s.corSuave}` }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse 60% 70% at ${invertido ? '85%' : '15%'} 30%, ${s.corSuave}, transparent 60%)` }} aria-hidden />
        <div className={`relative grid gap-10 p-8 sm:p-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] ${invertido ? 'lg:[&>*:first-child]:order-2' : ''}`}>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <MarcaDoSistema s={s} tamanho={34} />
              <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider" style={{ color: s.cor, background: s.corSuave }}>
                {s.situacao === 'no-ar' ? 'no ar' : 'em breve'}
              </span>
            </div>
            <h3 className="mt-5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{s.chamada}</h3>
            <p className="mt-3 text-base leading-relaxed text-slate-400">{s.descricao}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={s.conhecer} onClick={() => cta(`conhecer-${s.id}`)} className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-[#0b1020] transition-transform hover:-translate-y-0.5 active:scale-[0.98]" style={{ background: s.cor, boxShadow: `0 10px 30px -12px ${s.cor}` }}>
                Conhecer o {s.nome} <ArrowRight size={15} />
              </a>
              <Botao href={s.entrar} variante="fantasma" alvo={`entrar-${s.id}`}>
                Já uso · entrar <ArrowRight size={15} />
              </Botao>
            </div>
            <p className="mt-6 text-xs text-slate-500">
              Para: <span className="text-slate-400">{s.paraQuem.join(' · ')}</span>
            </p>
          </div>
          <ul className="space-y-3 self-center">
            {s.entrega.map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-xl bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                <Check size={16} className="mt-0.5 shrink-0" style={{ color: s.cor }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </article>
    </Revelar>
  );
}

function OQueLigaTudo() {
  const pilares = [
    { icone: <MessageCircle size={20} />, cor: '#25d366', titulo: 'O WhatsApp da sua empresa', texto: 'Cada sistema conecta o número que a sua equipe e os seus clientes já usam. Nada de número estranho, nada de app novo para ninguém instalar.' },
    { icone: <Bot size={20} />, cor: '#ff8a24', titulo: 'A mesma IA em todos', texto: 'A IA da casa entende a mensagem, propõe, encaminha — e nunca decide sozinha o que é da pessoa. Quem confirma é gente; quem grava é o sistema.' },
    { icone: <Users size={20} />, cor: '#7c3aed', titulo: 'Uma conta, uma equipe', texto: 'Quem administra o estoque ativa o atendimento com um clique, e a equipe entra com o mesmo e-mail. Cada pessoa vê só o que o papel dela permite.' },
    { icone: <LockKeyhole size={20} />, cor: '#22d3ee', titulo: 'Dados isolados, no banco', texto: 'O isolamento entre empresas é fiscalizado pelo banco de dados, não só pelo código. Os dados são seus — e saem em CSV quando você quiser.' },
  ];
  return (
    <section id="como-funciona" className="relative border-y border-white/[0.06] bg-white/[0.02] py-24" aria-labelledby="liga-titulo">
      <Container>
        <Revelar className="max-w-2xl">
          <Eyebrow>O que liga tudo</Eyebrow>
          <h2 id="liga-titulo" className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Sistemas diferentes. <span className="texto-espectro">A mesma base.</span>
          </h2>
          <p className="mt-4 text-lg text-slate-400">É por isso que o combo faz sentido: não é um desconto por juntar dois produtos — é o que acontece quando eles são da mesma casa.</p>
        </Revelar>
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {pilares.map((p, i) => (
            <Revelar key={p.titulo} delay={i * 0.06}>
              <div className="vidro h-full rounded-2xl p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${p.cor}22`, color: p.cor }}>
                  {p.icone}
                </span>
                <h3 className="mt-4 text-lg font-extrabold text-white">{p.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.texto}</p>
              </div>
            </Revelar>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Combos() {
  return (
    <section id="combos" className="py-24" aria-labelledby="combos-titulo">
      <Container>
        <Revelar className="max-w-2xl">
          <Eyebrow>Assinaturas e combos</Eyebrow>
          <h2 id="combos-titulo" className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Comece por um. Cresça para a casa.
          </h2>
          <p className="mt-4 text-lg text-slate-400">Cada sistema tem os próprios planos e {AVALIACAO_DIAS} dias grátis. O combo junta os dois numa conta — e no que vier depois.</p>
        </Revelar>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {COMBOS.map((c, i) => (
            <Revelar key={c.id} delay={i * 0.07} className={c.destaque ? 'lg:-mt-4' : ''}>
              <CartaoDoCombo c={c} />
            </Revelar>
          ))}
        </div>
        <Revelar>
          <p className="mt-8 text-center text-xs text-slate-500">Preços por mês. Anual com dois meses grátis. Pix, boleto ou cartão. "Ilimitado" está sujeito a uso justo.</p>
        </Revelar>
      </Container>
    </section>
  );
}

function CartaoDoCombo({ c }: { c: Combo }) {
  const sistemas = SISTEMAS.filter((s) => c.sistemas.includes(s.id));
  const definido = c.preco !== null;
  return (
    <div className={`vidro relative flex h-full flex-col rounded-3xl p-7 ${c.destaque ? 'borda-espectro' : ''}`}>
      {c.destaque && (
        <span className="absolute -top-3 left-6 rounded-full bg-white px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#0b1020]">
          <Sparkles size={11} className="mr-1 inline" /> a casa inteira
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {sistemas.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: s.corSuave }}>
            {s.simbolo && <img src={s.simbolo} alt="" width={14} height={14} />}
            {s.nome}
          </span>
        ))}
      </div>
      <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-white">{c.nome}</h3>
      <p className="mt-1 text-sm text-slate-400">{c.publico}</p>
      <div className="mt-6">
        {definido ? (
          <p className="text-white">
            {c.aPartirDe && <span className="text-sm text-slate-400">a partir de </span>}
            <span className="text-4xl font-extrabold tracking-tight">{brl(c.preco!)}</span>
            <span className="text-sm text-slate-400">/mês</span>
          </p>
        ) : (
          <p>
            <span className="text-2xl font-extrabold tracking-tight text-white">Em definição</span>
            <span className="block text-sm text-slate-400">Fale com a gente e receba a proposta primeiro.</span>
          </p>
        )}
      </div>
      <ul className="mt-6 flex-1 space-y-2.5">
        {c.inclui.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
            <Check size={15} className="mt-0.5 shrink-0 text-[var(--ciano)]" /> {item}
          </li>
        ))}
      </ul>
      <div className="mt-8">
        {definido ? (
          <Botao href={c.id === 'stok' ? '/#planos' : '#combos'} alvo={`combo-${c.id}`} className="w-full">
            Ver os planos <ArrowRight size={15} />
          </Botao>
        ) : (
          <Botao href={linkWhatsApp(`Olá! Quero saber o preço do combo "${c.nome}" do Cloud Aí.`)} variante={c.destaque ? 'primario' : 'contorno'} alvo={`combo-${c.id}`} className="w-full" externo>
            Quero a proposta <ArrowUpRight size={15} />
          </Botao>
        )}
      </div>
    </div>
  );
}

function Perguntas() {
  const perguntas = [
    ['Preciso comprar os dois?', `Não. Cada sistema é completo sozinho e tem os próprios planos. O combo é para quem quer estoque e atendimento na mesma conta — e o que a casa lançar depois.`],
    ['A conta é a mesma?', 'Hoje cada sistema tem a própria entrada. Quem administra o Stok Aí ativa o Atende Aí com um clique e entra com a mesma conta; a equipe entra pelo e-mail. Nada é duplicado.'],
    ['O WhatsApp é o meu?', 'Sim. No Atende Aí você conecta o número da sua empresa por QR, como no WhatsApp Web. No Stok Aí, a equipe fala com o assistente pelo número do Stok Aí ou pelo da sua empresa — você escolhe.'],
    ['Os dados de uma empresa ficam separados dos de outra?', 'Ficam — e quem fiscaliza é o banco de dados, com políticas de isolamento por empresa, não só o código. Exportar tudo em CSV está a um clique.'],
    ['Como funciona a avaliação?', `Toda conta nova tem ${AVALIACAO_DIAS} dias grátis com tudo liberado. Depois você escolhe o plano. Sem implantação, sem consultoria: a empresa cria a conta e começa.`],
  ] as const;
  return (
    <section id="perguntas" className="border-y border-white/[0.06] bg-white/[0.02] py-24" aria-labelledby="perguntas-titulo">
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Revelar>
          <Eyebrow>Perguntas</Eyebrow>
          <h2 id="perguntas-titulo" className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            O que perguntam antes de entrar.
          </h2>
          <p className="mt-4 text-slate-400">Se a sua não estiver aqui, a equipe responde pelo WhatsApp — o mesmo número, uma pessoa de verdade.</p>
          <Botao href={linkWhatsApp('Olá! Tenho uma dúvida sobre o Cloud Aí.')} variante="contorno" alvo="perguntas-whatsapp" className="mt-6" externo>
            <MessageCircle size={15} /> {whatsappFormatado()}
          </Botao>
        </Revelar>
        <Revelar>
          <div className="divide-y divide-white/[0.08] rounded-2xl border border-white/[0.08]">
            {perguntas.map(([p, r]) => (
              <details key={p} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-white">
                  {p}
                  <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{r}</p>
              </details>
            ))}
          </div>
        </Revelar>
      </Container>
    </section>
  );
}

function ChamadaFinal() {
  return (
    <section className="aurora relative overflow-hidden py-28" aria-labelledby="final-titulo">
      <Container className="relative text-center">
        <Revelar>
          <Layers size={28} className="mx-auto text-[var(--ciano)]" />
          <h2 id="final-titulo" className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Pare de procurar sistema.
            <br />
            <span className="texto-espectro">Entre na casa.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-400">Comece pelo que aperta mais hoje — estoque ou atendimento. O resto já está na mesma conta quando você precisar.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            {SISTEMAS.map((s) => (
              <a key={s.id} href={s.conhecer} onClick={() => cta(`final-${s.id}`)} className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-[#0b1020] transition-transform hover:-translate-y-0.5" style={{ background: s.cor }}>
                Começar pelo {s.nome} <ArrowRight size={15} />
              </a>
            ))}
          </div>
        </Revelar>
      </Container>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10">
      <Container className="flex flex-col gap-6 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <div>
          <MarcaCloud tamanho={26} />
          <p className="mt-2 max-w-sm text-xs">
            {CLOUD.nome} é a casa do {SISTEMAS.map((s) => s.nome).join(' e do ')}. {CLOUD.slogan}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <a href={linkWhatsApp()} target="_blank" rel="noreferrer" className="hover:text-white">
            WhatsApp {whatsappFormatado()}
          </a>
          <a href="/termos" className="hover:text-white">
            Termos de uso
          </a>
          <a href="/privacidade" className="hover:text-white">
            Privacidade
          </a>
          <a href="/" className="hover:text-white">
            stokai.app
          </a>
        </div>
      </Container>
    </footer>
  );
}
