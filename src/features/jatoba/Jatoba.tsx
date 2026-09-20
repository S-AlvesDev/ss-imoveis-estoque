import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Loader2, Send, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { track } from '@/lib/analytics';
import { PRODUTO } from '@/shared/produto';

/**
 * Jatobá — o assistente do Stok Aí dentro do site. O mesmo componente atende
 * as duas portas: na Home (`modo="home"`) tira dúvidas de quem está
 * conhecendo o produto; no painel (`modo="painel"`) consulta o estoque,
 * prepara movimentações para confirmar num clique, ensina a usar o sistema
 * e leva até a tela certa. O que muda entre as duas é o endpoint, o tom da
 * abertura e a paleta — a Home é navy e laranja, o painel veste a cor da
 * organização.
 *
 * O desenho do mascote fica em public/brand/jatoba.png; enquanto não existir,
 * o símbolo do produto entra no lugar.
 */

export type ModoDoJatoba = 'home' | 'painel';
/** De que produto da casa o Jatobá está falando. O mascote é o mesmo; muda a porta, o conhecimento e a cor. */
export type ProdutoDoJatoba = 'stok' | 'atende';

interface PropostaAssinada {
  resumo: string;
  tipo: 'movimentacao' | 'devolucao';
  token: string;
}

interface Mensagem {
  id: number;
  de: 'pessoa' | 'jatoba';
  texto: string;
  /** Cartões para confirmar, quando a resposta preparou movimentações. */
  propostas?: PropostaAssinada[];
  /** Depois do Confirmar: o que aconteceu com cada proposta. */
  resultados?: Array<{ resumo: string; resultado: string; ok: boolean }>;
  erro?: boolean;
}

interface JatobaProps {
  modo: ModoDoJatoba;
  /** Padrão: Stok Aí. No Atende Aí, a landing pergunta a /api/atende/jatoba/home com a paleta roxa. */
  produto?: ProdutoDoJatoba;
  /** No painel: abre a tela que a IA pediu (chave de AppView). */
  onNavigate?: (view: string) => void;
  /** No painel: os dados mudaram (uma proposta foi confirmada) — recarregar. */
  onDados?: () => void;
}

export const MASCOTE = '/brand/jatoba.png';

const SUGESTOES: Record<ModoDoJatoba, string[]> = {
  home: ['Quanto custa?', 'Funciona no WhatsApp?', 'Serve para EPI e ferramentas?', 'Como eu começo?'],
  painel: ['O que está faltando?', 'Quanto tem de cimento?', 'Como cadastro um material?', 'Saiu 2 sacos de cimento do Central'],
};
const SUGESTOES_DO_ATENDE = ['Quanto custa?', 'Preciso trocar meu número?', 'A IA responde o cliente?', 'Como eu começo?'];

const ABERTURA: Record<ModoDoJatoba, string> = {
  home: `Oi! Eu sou o Jatobá, do ${PRODUTO.nome}. Pergunte o que quiser sobre o sistema — preço, planos, como funciona no WhatsApp, se serve para a sua operação.`,
  painel: 'Oi! Eu sou o Jatobá. Posso consultar saldo e pendências, preparar uma saída ou transferência para você confirmar, e explicar como fazer qualquer coisa por aqui.',
};
const ABERTURA_DO_ATENDE = 'Oi! Eu sou o Jatobá, da SEVLA. Pergunte o que quiser sobre o Atende Aí — preço, planos, como a IA tria, se serve para a sua equipe.';

/** O que muda por produto na Home: nome, símbolo de reserva, porta, abertura, sugestões e a cor de destaque. */
const POR_PRODUTO: Record<ProdutoDoJatoba, { nome: string; simbolo: string; endpoint: string; abertura: string; sugestoes: string[]; acento: { pessoa: string; enviar: string; confirmar: string; botao: string; chipHover: string; campoFoco: string } }> = {
  stok: {
    nome: PRODUTO.nome,
    simbolo: PRODUTO.simboloGrande,
    endpoint: '/api/jatoba/home',
    abertura: ABERTURA.home,
    sugestoes: SUGESTOES.home,
    acento: { pessoa: 'bg-[var(--laranja,#ff8a24)] text-[#1a0c00]', enviar: 'bg-[var(--laranja,#ff8a24)] text-[#1a0c00] hover:brightness-110 disabled:opacity-40', confirmar: 'bg-[var(--laranja,#ff8a24)] text-[#1a0c00] hover:brightness-110', botao: 'bg-[var(--laranja,#ff8a24)] ring-[#050b18] shadow-[var(--laranja,#ff8a24)]/40', chipHover: 'hover:border-[var(--laranja,#ff8a24)]', campoFoco: 'focus:border-[var(--laranja,#ff8a24)]' },
  },
  atende: {
    nome: 'Atende Aí',
    simbolo: '/atende/favicon_atendeai.png',
    endpoint: '/api/atende/jatoba/home',
    abertura: ABERTURA_DO_ATENDE,
    sugestoes: SUGESTOES_DO_ATENDE,
    acento: { pessoa: 'bg-[#7c3aed] text-white', enviar: 'bg-[#7c3aed] text-white hover:brightness-110 disabled:opacity-40', confirmar: 'bg-[#7c3aed] text-white hover:brightness-110', botao: 'bg-[#7c3aed] ring-[#0b1020] shadow-[#7c3aed]/40', chipHover: 'hover:border-[#a78bfa]', campoFoco: 'focus:border-[#a78bfa]' },
  },
};

/**
 * Avatar do mascote. O desenho é de corpo inteiro, e num círculo de 40px o
 * corpo inteiro vira um risco — então o círculo mostra só a cabeça (a imagem
 * ampliada e ancorada no alto). Sem o desenho em public/brand, entra o
 * símbolo do produto, sem recorte.
 */
function Avatar({ tamanho, className = '', simbolo = PRODUTO.simboloGrande }: { tamanho: number; className?: string; simbolo?: string }) {
  const [semDesenho, setSemDesenho] = useState(false);
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-full ${className}`} style={{ width: tamanho, height: tamanho }}>
      <img
        src={semDesenho ? simbolo : MASCOTE}
        alt="Jatobá"
        width={tamanho}
        height={tamanho}
        onError={() => setSemDesenho(true)}
        className={`absolute inset-0 h-full w-full select-none object-contain ${semDesenho ? 'p-1' : 'origin-[50%_12%] scale-[2.2]'}`}
        draggable={false}
      />
    </span>
  );
}

/**
 * Markdown do tamanho que a resposta usa: parágrafos, linhas de lista e
 * **negrito**. Nada de HTML — o texto vem de um modelo e passa como texto.
 */
function Texto({ texto }: { texto: string }) {
  const linhas = texto.split('\n');
  return (
    <>
      {linhas.map((linha, i) => {
        const lista = /^\s*([-•*]|\d+[.)])\s+/.test(linha);
        const partes = linha.replace(/^\s*[-•*]\s+/, '').split(/(\*\*[^*]+\*\*)/g);
        const conteudo = partes.map((p, j) => (p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>));
        if (!linha.trim()) return <span key={i} className="block h-2" />;
        return (
          <span key={i} className={`block ${lista ? 'pl-3 before:mr-1.5 before:content-["•"]' : ''}`}>
            {conteudo}
          </span>
        );
      })}
    </>
  );
}

export function Jatoba({ modo, produto = 'stok', onNavigate, onDados }: JatobaProps) {
  const p = POR_PRODUTO[produto];
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([{ id: 0, de: 'jatoba', texto: modo === 'home' ? p.abertura : ABERTURA.painel }]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const proximoId = useRef(1);
  const reduzido = useReducedMotion();

  const home = modo === 'home';
  const paleta = home
    ? {
        painel: 'border-white/10 bg-[#0b1426] text-white shadow-2xl shadow-black/50',
        cabecalho: 'border-white/10',
        sub: 'text-slate-400',
        pessoa: p.acento.pessoa,
        jatoba: 'bg-white/[0.06] text-slate-100',
        erro: 'bg-rose-500/15 text-rose-200',
        chip: `border-white/10 bg-white/[0.04] text-slate-200 ${p.acento.chipHover} hover:text-white`,
        campo: `border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 ${p.acento.campoFoco}`,
        enviar: p.acento.enviar,
        cartao: 'border-white/10 bg-white/[0.04]',
        confirmar: p.acento.confirmar,
        descartar: 'text-slate-400 hover:text-white',
        botao: p.acento.botao,
        fechar: 'text-slate-400 hover:bg-white/10 hover:text-white',
      }
    : {
        painel: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl shadow-black/15',
        cabecalho: 'border-[var(--border)]',
        sub: 'text-[var(--text-muted)]',
        pessoa: 'bg-[var(--brand)] text-white',
        jatoba: 'bg-[var(--bg-2)] text-[var(--text)]',
        erro: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
        chip: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--brand)]/60 hover:text-[var(--text)]',
        campo: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]',
        enviar: 'bg-[var(--brand)] text-white hover:brightness-105 disabled:opacity-40',
        cartao: 'border-[var(--border)] bg-[var(--surface)]',
        confirmar: 'bg-[var(--brand)] text-white hover:brightness-105',
        descartar: 'text-[var(--text-muted)] hover:text-[var(--text)]',
        botao: 'bg-[var(--brand)] ring-[var(--bg)] shadow-[var(--brand)]/40',
        fechar: 'text-[var(--text-muted)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]',
      };

  // Sempre no fim da conversa; foco no campo ao abrir; Esc fecha.
  useEffect(() => {
    if (!aberto) return;
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens, pensando, aberto]);
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => campo.current?.focus(), 60);
    function tecla(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('keydown', tecla);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  function abrir() {
    setAberto(true);
    track('jatoba_abrir', { modo });
  }

  function adicionar(m: Omit<Mensagem, 'id'>): number {
    const id = proximoId.current++;
    setMensagens((lista) => [...lista, { ...m, id }]);
    return id;
  }

  async function enviar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || pensando) return;
    setTexto('');
    adicionar({ de: 'pessoa', texto: p });
    setPensando(true);
    track('jatoba_pergunta', { modo });
    // O histórico que vai junto: só texto, sem a abertura fixa e sem cartões.
    const historico = mensagens.filter((m) => m.id !== 0 && !m.erro).map((m) => ({ role: m.de === 'pessoa' ? 'user' : 'assistant', content: m.texto }));
    try {
      if (home) {
        const r = await api.post<{ texto: string }>(POR_PRODUTO[produto].endpoint, { pergunta: p, historico });
        adicionar({ de: 'jatoba', texto: r.texto });
      } else {
        const r = await api.post<{ texto: string; propostas: PropostaAssinada[]; abrir: string | null }>('/api/jatoba', { texto: p, historico });
        adicionar({ de: 'jatoba', texto: r.texto, propostas: r.propostas?.length ? r.propostas : undefined });
        if (r.abrir && onNavigate) onNavigate(r.abrir);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Não consegui responder agora. Tente de novo em instantes.';
      adicionar({ de: 'jatoba', texto: msg, erro: true });
    } finally {
      setPensando(false);
    }
  }

  async function confirmar(idMensagem: number, tokens: string[]) {
    if (confirmando !== null) return;
    setConfirmando(idMensagem);
    try {
      const r = await api.post<{ resultados: Array<{ resumo: string; resultado: string; ok: boolean }> }>('/api/jatoba/confirmar', { propostas: tokens });
      setMensagens((lista) => lista.map((m) => (m.id === idMensagem ? { ...m, propostas: m.propostas?.filter((p) => !tokens.includes(p.token)), resultados: [...(m.resultados ?? []), ...r.resultados] } : m)));
      if (r.resultados.some((x) => x.ok)) onDados?.();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Não foi possível confirmar agora.';
      adicionar({ de: 'jatoba', texto: msg, erro: true });
    } finally {
      setConfirmando(null);
    }
  }

  function descartar(idMensagem: number, token: string) {
    setMensagens((lista) => lista.map((m) => (m.id === idMensagem ? { ...m, propostas: m.propostas?.filter((p) => p.token !== token) } : m)));
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviar(texto);
    }
  }

  const mostrarSugestoes = mensagens.length === 1 && !pensando;

  return (
    <>
      {/* O botão flutuante: o mascote, sempre no canto. */}
      <AnimatePresence>
        {!aberto && (
          <motion.button
            key="jatoba-botao"
            type="button"
            onClick={abrir}
            initial={reduzido ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduzido ? undefined : { scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            aria-label={`Falar com o Jatobá, o assistente do ${p.nome}`}
            className={`fixed bottom-5 right-5 z-[90] flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60 ${paleta.botao}`}
          >
            <Avatar tamanho={48} simbolo={p.simbolo} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aberto && (
          <motion.section
            key="jatoba-painel"
            role="dialog"
            aria-label={`Jatobá, assistente do ${p.nome}`}
            initial={reduzido ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduzido ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`fixed bottom-4 right-4 z-[90] flex max-h-[min(640px,calc(100dvh-2rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border ${paleta.painel}`}
          >
            <header className={`flex items-center gap-3 border-b px-4 py-3 ${paleta.cabecalho}`}>
              <Avatar tamanho={40} simbolo={p.simbolo} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold leading-tight">Jatobá</p>
                <p className={`truncate text-[11px] ${paleta.sub}`}>{home ? `Tire suas dúvidas sobre o ${p.nome}` : 'Consulte, registre e aprenda — sem sair daqui'}</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className={`rounded-lg p-1.5 transition-colors ${paleta.fechar}`}>
                <X size={16} />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
              {mensagens.map((m) => (
                <div key={m.id} className={`flex ${m.de === 'pessoa' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${m.de === 'pessoa' ? `${paleta.pessoa} rounded-br-md` : m.erro ? `${paleta.erro} rounded-bl-md` : `${paleta.jatoba} rounded-bl-md`}`}>
                    <Texto texto={m.texto} />

                    {m.propostas && m.propostas.length > 0 && (
                      <div className="mt-2.5 space-y-2">
                        {m.propostas.map((p) => (
                          <div key={p.token} className={`rounded-xl border p-2.5 ${paleta.cartao}`}>
                            <p className="text-[13px] font-semibold leading-snug">{p.resumo}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                disabled={confirmando !== null}
                                onClick={() => confirmar(m.id, [p.token])}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${paleta.confirmar}`}
                              >
                                {confirmando === m.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                Confirmar
                              </button>
                              <button type="button" disabled={confirmando !== null} onClick={() => descartar(m.id, p.token)} className={`px-2 py-1.5 text-xs font-semibold transition-colors ${paleta.descartar}`}>
                                Descartar
                              </button>
                            </div>
                          </div>
                        ))}
                        {m.propostas.length > 1 && (
                          <button
                            type="button"
                            disabled={confirmando !== null}
                            onClick={() => confirmar(m.id, m.propostas!.map((p) => p.token))}
                            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${paleta.confirmar}`}
                          >
                            <Check size={13} /> Confirmar as {m.propostas.length}
                          </button>
                        )}
                      </div>
                    )}

                    {m.resultados && m.resultados.length > 0 && (
                      <ul className="mt-2.5 space-y-1.5 text-[13px]">
                        {m.resultados.map((r, i) => (
                          <li key={i} className={r.ok ? '' : 'text-rose-400'}>
                            {r.resultado}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}

              {pensando && (
                <div className="flex justify-start">
                  <div className={`flex items-center gap-1.5 rounded-2xl rounded-bl-md px-3.5 py-3 ${paleta.jatoba}`} aria-label="Jatobá está pensando">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-70 [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-70 [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-70" />
                  </div>
                </div>
              )}

              {mostrarSugestoes && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(home ? p.sugestoes : SUGESTOES.painel).map((s) => (
                    <button key={s} type="button" onClick={() => enviar(s)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${paleta.chip}`}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div ref={fim} />
            </div>

            <form
              className={`flex items-end gap-2 border-t px-3 py-2.5 ${paleta.cabecalho}`}
              onSubmit={(e) => {
                e.preventDefault();
                void enviar(texto);
              }}
            >
              <textarea
                ref={campo}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={aoTeclar}
                rows={1}
                maxLength={1000}
                placeholder={home ? `Pergunte sobre o ${p.nome}…` : 'Pergunte ou diga o que aconteceu…'}
                aria-label="Sua mensagem para o Jatobá"
                className={`max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none transition-colors ${paleta.campo}`}
              />
              <button type="submit" disabled={!texto.trim() || pensando} aria-label="Enviar" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${paleta.enviar}`}>
                <Send size={16} />
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
