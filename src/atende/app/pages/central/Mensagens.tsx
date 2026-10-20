import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CheckCheck, Clock, Download, FileText, MapPin, MessageSquare, RefreshCw, Smartphone, Sparkles, StickyNote, TriangleAlert, User } from 'lucide-react';
import { api } from '../../lib/api';
import { useCentral } from '../../store/central';
import { useDadosAtende } from '../../store/dados';
import type { Mensagem } from '../../../shared/tipos';
import { Esqueleto, Vazio } from '../../ui/Estados';
import { horaDe, rotuloDoDia, tamanhoBonito, duracaoBonita } from './util';

/**
 * A linha do tempo de uma conversa: balões do cliente à esquerda (brancos),
 * da equipe à direita (roxos), da IA em lavanda com a faísca, notas
 * internas em âmbar, avisos do sistema no meio. Mídia carrega a URL
 * assinada sob demanda (vale 10 min; recarrega ao falhar).
 */
/** Uma referência só: um `?? []` dentro do seletor criaria um array novo por render e o zustand entraria em loop. */
const SEM_MENSAGENS: Mensagem[] = [];

export function Mensagens({ conversaId }: { conversaId: string }) {
  const mensagens = useCentral((s) => s.mensagens[conversaId]) ?? SEM_MENSAGENS;
  const carregando = useCentral((s) => s.carregandoConversa);
  const carregarMaisAntigas = useCentral((s) => s.carregarMaisAntigas);
  const caixa = useRef<HTMLDivElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  /** "Grudado" no fim: ao abrir e enquanto a pessoa não rola para cima. Nesse estado, tudo que cresce (mensagem nova, imagem que carregou) desce junto. */
  const grudado = useRef(true);
  const [temMais, setTemMais] = useState(true);
  const [buscandoMais, setBuscandoMais] = useState(false);
  const ultimaId = mensagens[mensagens.length - 1]?.id;

  // Rola a caixa, não a página: scrollIntoView no celular (drawer, safe-area) às vezes move a tela toda.
  const descer = () => {
    const el = caixa.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Trocou de conversa: começa no fim, grudado. Layout effect para não piscar o topo antes de descer.
  useLayoutEffect(() => {
    grudado.current = true;
    setTemMais(true);
    descer();
  }, [conversaId]);

  // Chegou mensagem: desce — a menos que a pessoa esteja lendo lá em cima.
  useLayoutEffect(() => {
    if (grudado.current) descer();
  }, [ultimaId]);

  // O conteúdo cresceu (imagem/vídeo/áudio carregou, fonte trocou, mensagens chegaram): se grudado, acompanha.
  useEffect(() => {
    const alvo = conteudo.current;
    if (!alvo || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (grudado.current) descer();
    });
    ro.observe(alvo);
    return () => ro.disconnect();
  }, []);

  function aoRolar() {
    const el = caixa.current;
    if (!el) return;
    grudado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function maisAntigas() {
    setBuscandoMais(true);
    const el = caixa.current;
    const alturaAntes = el?.scrollHeight ?? 0;
    grudado.current = false;
    const houve = await carregarMaisAntigas(conversaId);
    setTemMais(houve);
    setBuscandoMais(false);
    // Mantém o que estava na tela no mesmo lugar.
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - alturaAntes;
    });
  }

  let diaAnterior = '';
  return (
    <div ref={caixa} onScroll={aoRolar} className="rolagem-fina min-w-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
      <div ref={conteudo} className="mx-auto max-w-3xl space-y-1.5">
        {mensagens.length >= 60 && temMais && (
          <div className="flex justify-center pb-2">
            <button type="button" onClick={maisAntigas} disabled={buscandoMais} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)] shadow-sm transition-colors hover:text-[var(--text)] disabled:opacity-50">
              {buscandoMais ? 'Carregando…' : 'Mensagens anteriores'}
            </button>
          </div>
        )}
        {carregando && mensagens.length === 0 && (
          <div className="space-y-3 py-4" aria-label="Carregando">
            <Esqueleto className="h-12 w-2/3 rounded-2xl" />
            <Esqueleto className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Esqueleto className="h-16 w-3/5 rounded-2xl" />
            <Esqueleto className="ml-auto h-10 w-2/5 rounded-2xl" />
          </div>
        )}
        {!carregando && mensagens.length === 0 && <Vazio compacto icone={<MessageSquare size={18} />} titulo="Nenhuma mensagem ainda." />}
        {mensagens.map((m) => {
          const dia = rotuloDoDia(m.criado_em);
          const separador = dia !== diaAnterior;
          diaAnterior = dia;
          return (
            <div key={m.id}>
              {separador && (
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-[var(--border)]" />
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">{dia}</span>
                  <span className="h-px flex-1 bg-[var(--border)]" />
                </div>
              )}
              <Balao m={m} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Balao({ m }: { m: Mensagem }) {
  const equipe = useDadosAtende((s) => s.equipe);
  const autor = m.autor_id ? equipe.find((f) => f.id === m.autor_id)?.nome : null;

  if (m.direcao === 'sistema') {
    return (
      <div className="my-2 flex justify-center">
        <p className="wrap-anywhere max-w-[90%] rounded-full bg-[var(--bg-2)] px-3 py-1 text-center text-[11px] text-[var(--text-muted)]">{m.texto}</p>
      </div>
    );
  }
  if (m.direcao === 'interna') {
    return (
      <div className="flex justify-end">
        <div className="w-fit min-w-0 max-w-[85%] rounded-2xl rounded-br-md border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-950 shadow-sm sm:max-w-[72%]">
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
            <StickyNote size={11} /> Nota interna · {autor ?? 'equipe'}
          </p>
          <p className="whitespace-pre-wrap wrap-anywhere">{m.texto}</p>
          <p className="mt-1 text-right text-[10px] text-amber-700/70">{horaDe(m.criado_em)}</p>
        </div>
      </div>
    );
  }

  const nossa = m.direcao === 'saida';
  const daIa = nossa && m.autor_tipo === 'ia';
  const doAparelho = nossa && m.autor_tipo === 'aparelho';
  const pele = !nossa ? 'rounded-bl-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]' : daIa ? 'rounded-br-md border border-[var(--brand)]/20 bg-[var(--brand-soft)] text-[var(--brand-ink)]' : 'rounded-br-md bg-[var(--brand)] text-white';
  const rotulo = daIa ? (
    <span className="inline-flex items-center gap-1">
      <Sparkles size={11} /> IA
    </span>
  ) : doAparelho ? (
    <span className="inline-flex items-center gap-1">
      <Smartphone size={11} /> celular da empresa
    </span>
  ) : nossa ? (
    autor
  ) : null;
  const corDoRotulo = daIa ? 'text-[var(--brand)]' : nossa ? 'text-white/80' : 'text-[var(--text-muted)]';
  const corDoRodape = daIa ? 'text-[var(--brand-ink)]/60' : nossa ? 'text-white/75' : 'text-[var(--text-muted)]';

  return (
    <div className={`flex ${nossa ? 'justify-end' : 'justify-start'}`}>
      <div className={`w-fit min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-[0_1px_2px_rgba(23,21,58,0.06)] sm:max-w-[72%] ${pele}`}>
        {rotulo && <p className={`mb-0.5 text-[11px] font-semibold ${corDoRotulo}`}>{rotulo}</p>}
        <Conteudo m={m} nossa={nossa} daIa={daIa} />
        <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${corDoRodape}`}>
          {m.status === 'falhou' && (
            <span className={`mr-1 inline-flex items-center gap-1 ${nossa && !daIa ? 'text-rose-200' : 'text-rose-600'}`} title={m.erro ?? 'Falhou'}>
              <TriangleAlert size={11} /> não enviada
            </span>
          )}
          {horaDe(m.criado_em)}
          {nossa && <Tique status={m.status} />}
        </div>
      </div>
    </div>
  );
}

function Tique({ status }: { status: Mensagem['status'] }) {
  if (status === 'enviando') return <Clock size={12} />;
  if (status === 'enviada') return <Check size={13} />;
  if (status === 'entregue') return <CheckCheck size={13} />;
  if (status === 'lida') return <CheckCheck size={13} className="text-sky-300" />;
  return null;
}

function Conteudo({ m, nossa, daIa }: { m: Mensagem; nossa: boolean; daIa: boolean }) {
  const fundoDaCaixinha = nossa && !daIa ? 'bg-white/15' : 'bg-[var(--bg-2)]';
  const texto = m.texto ? <p className="whitespace-pre-wrap wrap-anywhere leading-relaxed">{m.texto}</p> : null;
  if (m.tipo === 'texto' || m.tipo === 'outro') {
    if (texto) return texto;
    // Formato que ainda não sabemos ler (menu de bot, enquete…). Dizer o que
    // chegou é melhor que uma bolha vazia: o atendente entende que o cliente
    // mandou algo e pode perguntar.
    return <p className="italic opacity-70">{m.midia?.desconhecido ? 'Mensagem interativa (botão ou menu) — abra no WhatsApp para ver' : '(mensagem sem texto)'}</p>;
  }
  if (m.tipo === 'localizacao') {
    const { latitude, longitude } = m.midia ?? {};
    const href = `https://www.google.com/maps?q=${latitude},${longitude}`;
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 ${fundoDaCaixinha}`}>
        <MapPin size={18} className="shrink-0" />
        <span className="min-w-0">
          <span className="block font-semibold">{m.texto ?? 'Localização'}</span>
          <span className="block text-[11px] opacity-80">
            {latitude?.toFixed(5)}, {longitude?.toFixed(5)} · abrir no mapa
          </span>
        </span>
      </a>
    );
  }
  if (m.tipo === 'contato') {
    const c = m.midia?.contato;
    return (
      <div className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 ${fundoDaCaixinha}`}>
        <User size={18} className="shrink-0" />
        <span className="min-w-0">
          <span className="block font-semibold">{c?.nome ?? m.texto}</span>
          {c?.telefone && <span className="block text-[11px] opacity-80">+{c.telefone}</span>}
        </span>
      </div>
    );
  }
  // Mídia com arquivo.
  return (
    <div className="space-y-1.5">
      <Arquivo m={m} fundo={fundoDaCaixinha} />
      {texto}
    </div>
  );
}

/** Imagem, áudio, vídeo, documento, figurinha — com a URL assinada carregada sob demanda. */
function Arquivo({ m, fundo }: { m: Mensagem; fundo: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const pendente = m.midia?.pendente && !m.midia?.caminho;

  async function carregar() {
    setErro(false);
    try {
      const r = await api.get<{ url: string }>(`/midias/${m.id}`);
      setUrl(r.url);
    } catch {
      setErro(true);
    }
  }
  useEffect(() => {
    if (!pendente && m.midia?.caminho) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id, m.midia?.caminho]);

  if (pendente) {
    return (
      <Caixinha fundo={fundo}>
        <Clock size={16} /> <span className="text-xs">{m.erro ? 'Arquivo não disponível' : 'Recebendo arquivo…'}</span>
      </Caixinha>
    );
  }
  if (erro) {
    return (
      <Caixinha fundo={fundo}>
        <button type="button" onClick={carregar} className="inline-flex items-center gap-1.5 text-xs underline">
          <RefreshCw size={13} /> Carregar de novo
        </button>
      </Caixinha>
    );
  }
  if (m.tipo === 'imagem' || m.tipo === 'figurinha') {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={m.texto ?? 'Imagem'} className={`max-h-72 max-w-full rounded-lg object-contain ${m.tipo === 'figurinha' ? 'max-h-32' : ''}`} loading="lazy" />
      </a>
    ) : (
      <div className="h-32 w-48 max-w-full animate-pulse rounded-lg bg-black/10" />
    );
  }
  if (m.tipo === 'audio') {
    return url ? (
      <audio controls preload="metadata" src={url} className="block w-[260px] max-w-full" />
    ) : (
      <Caixinha fundo={fundo}>
        Carregando áudio
        {m.midia?.duracao ? ` (${duracaoBonita(m.midia.duracao)})` : ''}…
      </Caixinha>
    );
  }
  if (m.tipo === 'video') {
    return url ? <video controls preload="metadata" src={url} className="max-h-72 w-[320px] max-w-full rounded-lg" /> : <Caixinha fundo={fundo}>Carregando vídeo…</Caixinha>;
  }
  // Documento
  return (
    <Caixinha fundo={fundo}>
      <FileText size={20} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{m.midia?.nome ?? 'Documento'}</span>
        <span className="block text-[11px] opacity-80">{[m.midia?.mimetype?.split('/')[1]?.toUpperCase(), tamanhoBonito(m.midia?.tamanho)].filter(Boolean).join(' · ')}</span>
      </span>
      <BaixarLink m={m} />
    </Caixinha>
  );
}

function BaixarLink({ m }: { m: Mensagem }) {
  async function baixar() {
    const r = await api.get<{ url: string }>(`/midias/${m.id}?download=1`);
    window.open(r.url, '_blank', 'noopener');
  }
  return (
    <button type="button" onClick={baixar} className="rounded-lg p-1.5 hover:bg-black/10" aria-label="Baixar">
      <Download size={16} />
    </button>
  );
}

function Caixinha({ fundo, children }: { fundo: string; children: ReactNode }) {
  return <div className={`flex w-[220px] min-w-0 max-w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${fundo}`}>{children}</div>;
}
