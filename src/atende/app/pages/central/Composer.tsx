import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Mic, MessageSquareText, Paperclip, Send, Square, StickyNote, X } from 'lucide-react';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral } from '../../store/central';
import type { Conversa, Mensagem } from '../../../shared/tipos';
import { nomeDoCliente, tamanhoBonito } from './util';
import { ModelosDoComposer } from './ModelosDoComposer';

/**
 * A caixa de resposta: texto (Enter envia, Shift+Enter quebra linha), anexo
 * (imagem, vídeo, PDF, qualquer arquivo até 20 MB — sobe direto para o
 * Storage), áudio gravado no navegador, e o modo "nota interna", que só a
 * equipe vê.
 */
const MAX_BYTES = 20 * 1024 * 1024;

/** Tela de toque/estreita: sem foco automático (abriria o teclado) e Enter quebra linha — o botão envia, como no WhatsApp. */
const ehCelular = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

export function Composer({ conversa }: { conversa: Conversa }) {
  const [texto, setTexto] = useState('');
  const [modoNota, setModoNota] = useState(false);
  const [mostrarModelos, setMostrarModelos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const relogio = useRef<number | null>(null);
  const aplicarMensagem = useCentral((s) => s.aplicarMensagem);
  const aplicarConversa = useCentral((s) => s.aplicarConversa);

  useEffect(() => {
    setModoNota(false);
  }, [conversa.time_id, conversa.atendente_id]);

  useEffect(() => {
    if (!ehCelular()) campo.current?.focus();
    setTexto('');
    setAnexo(null);
    setModoNota(false);
  }, [conversa.id]);

  // A caixa cresce com o texto, até um limite.
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  async function depoisDeEnviar(m: Mensagem) {
    aplicarMensagem(m);
    // A conversa mudou (estado, prévia, atendente): busca a versão nova.
    try {
      const r = await api.get<{ conversa: Conversa }>(`/conversas/${conversa.id}`);
      aplicarConversa(r.conversa);
    } catch {
      /* o sync traz */
    }
  }

  async function enviarTexto() {
    const t = texto.trim();
    if ((!t && !anexo) || enviando) return;
    setEnviando(true);
    try {
      if (modoNota) {
        const r = await api.post<{ mensagem: Mensagem }>(`/conversas/${conversa.id}/notas`, { texto: t });
        aplicarMensagem(r.mensagem);
        setTexto('');
      } else if (anexo) {
        await subirEEnviar(anexo, 'arquivo', t || undefined);
        setAnexo(null);
        setTexto('');
      } else {
        const r = await api.post<{ mensagem: Mensagem }>(`/conversas/${conversa.id}/mensagens`, { tipo: 'texto', texto: t });
        setTexto('');
        await depoisDeEnviar(r.mensagem);
      }
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  /** Arquivo/áudio: pede a URL, sobe direto no Storage, avisa o servidor. */
  async function subirEEnviar(blob: Blob, tipo: 'arquivo' | 'audio', legenda?: string) {
    if (blob.size > MAX_BYTES) throw new ErroDaApi('Arquivo grande demais (máximo 20 MB).');
    const mimetype = (blob.type || 'application/octet-stream').split(';')[0];
    const nome = blob instanceof File ? blob.name : `audio-${Date.now()}.${mimetype.includes('ogg') ? 'ogg' : mimetype.includes('mp4') ? 'm4a' : 'webm'}`;
    const prep = await api.post<{ mensagemId: string; caminho: string; signedUrl: string; token: string }>(`/conversas/${conversa.id}/midias/url`, { mimetype, nome, tamanho: blob.size });
    const up = await fetch(prep.signedUrl, { method: 'PUT', headers: { 'Content-Type': mimetype, 'x-upsert': 'true' }, body: blob });
    if (!up.ok) throw new ErroDaApi(`O Storage recusou o arquivo (${up.status}).`);
    const r = await api.post<{ mensagem: Mensagem }>(`/conversas/${conversa.id}/mensagens`, { tipo, caminho: prep.caminho, mimetype, nome, texto: legenda });
    await depoisDeEnviar(r.mensagem);
  }

  function inserirModelo(textoDoModelo: string) {
    const primeiroNome = nomeDoCliente(conversa.cliente).split(/\s+/)[0];
    setTexto(textoDoModelo.replace(/\{nome\}/gi, primeiroNome));
    setMostrarModelos(false);
    campo.current?.focus();
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !ehCelular()) {
      e.preventDefault();
      void enviarTexto();
    }
  }

  async function comecarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      pedacos.current = [];
      rec.ondataavailable = (ev) => ev.data.size && pedacos.current.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (relogio.current) window.clearInterval(relogio.current);
        setGravando(false);
        const blob = new Blob(pedacos.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 1000) return; // clicou e soltou
        setEnviando(true);
        try {
          await subirEEnviar(blob, 'audio');
        } catch (err) {
          toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível enviar o áudio.');
        } finally {
          setEnviando(false);
        }
      };
      gravador.current = rec;
      rec.start();
      setGravando(true);
      setSegundos(0);
      relogio.current = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch {
      toast.error('Não consegui acessar o microfone. Confira a permissão do navegador.');
    }
  }

  function pararGravacao(cancelar = false) {
    const rec = gravador.current;
    if (!rec) return;
    if (cancelar) pedacos.current = [];
    if (cancelar) rec.ondataavailable = null;
    rec.stop();
    gravador.current = null;
  }

  const encerrada = conversa.estado === 'encerrada';
  const botaoDeIcone = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--text)] disabled:opacity-40';

  return (
    <div className={`border-t px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-3 sm:pb-3 ${modoNota ? 'border-amber-200 bg-amber-50/70' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
      <div className="mx-auto max-w-3xl">
        {anexo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)]">
            <Paperclip size={13} className="text-[var(--text-muted)]" />
            <span className="min-w-0 flex-1 truncate">
              {anexo.name} <span className="text-[var(--text-muted)]">· {tamanhoBonito(anexo.size)}</span>
            </span>
            <button type="button" onClick={() => setAnexo(null)} className="rounded-md p-1 hover:bg-[var(--bg-2)]" aria-label="Remover anexo">
              <X size={13} />
            </button>
          </div>
        )}
        {modoNota && <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-amber-700"><StickyNote size={12} /> Nota interna — o cliente não vê.</p>}
        {encerrada && !modoNota && <p className="mb-1.5 px-1 text-[11px] text-[var(--text-muted)]">Conversa encerrada — responder reabre.</p>}
        <div className="flex min-w-0 items-end gap-1 sm:gap-1.5">
          <button type="button" onClick={() => setModoNota((v) => !v)} data-dica={modoNota ? 'Voltar a responder o cliente' : 'Nota interna (o cliente não vê)'} aria-label={modoNota ? 'Voltar a responder o cliente' : 'Nota interna'} className={`${botaoDeIcone} ${modoNota ? 'bg-amber-400 text-amber-950 hover:bg-amber-400 hover:text-amber-950' : ''}`}>
            <StickyNote size={18} />
          </button>
          {!modoNota && (
            <>
              <input ref={arquivo} type="file" className="hidden" onChange={(e) => setAnexo(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => arquivo.current?.click()} disabled={gravando} data-dica="Anexar arquivo" aria-label="Anexar arquivo" className={botaoDeIcone}>
                <Paperclip size={18} />
              </button>
              <div className="relative">
                <button type="button" onClick={() => setMostrarModelos((v) => !v)} disabled={gravando} data-dica="Modelos de mensagem" aria-label="Modelos de mensagem" className={botaoDeIcone}>
                  <MessageSquareText size={18} />
                </button>
                {mostrarModelos && <ModelosDoComposer onEscolher={inserirModelo} onFechar={() => setMostrarModelos(false)} />}
              </div>
            </>
          )}
          {gravando ? (
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm text-rose-700">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
              <span className="tabular-nums">
                Gravando… {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
              </span>
              <button type="button" onClick={() => pararGravacao(true)} className="ml-auto text-xs font-semibold underline">
                Cancelar
              </button>
            </div>
          ) : (
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoTeclar}
              rows={1}
              maxLength={4000}
              placeholder={modoNota ? 'Escreva a nota para a equipe…' : anexo ? 'Legenda (opcional)…' : ehCelular() ? 'Mensagem' : 'Escreva a resposta… (Enter envia, Shift+Enter quebra linha)'}
              className={`max-h-40 min-h-[40px] min-w-0 flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-sm leading-5 outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-disable)] focus:ring-4 ${modoNota ? 'border-amber-300 bg-white text-amber-950 focus:border-amber-500 focus:ring-amber-500/10' : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:border-[var(--brand)] focus:bg-[var(--surface)] focus:ring-[var(--brand)]/10'}`}
            />
          )}
          {!modoNota && !texto.trim() && !anexo ? (
            gravando ? (
              <button type="button" onClick={() => pararGravacao(false)} data-dica="Parar e enviar" aria-label="Parar e enviar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-white shadow-[0_8px_20px_-10px_rgba(124,58,237,0.7)]">
                <Square size={18} />
              </button>
            ) : (
              <button type="button" onClick={comecarGravacao} disabled={enviando} data-dica="Gravar áudio" aria-label="Gravar áudio" className={botaoDeIcone}>
                <Mic size={18} />
              </button>
            )
          ) : (
            <button type="button" onClick={enviarTexto} disabled={enviando || (!texto.trim() && !anexo)} data-dica="Enviar" aria-label="Enviar" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-[background-color,transform] active:scale-95 disabled:opacity-40 ${modoNota ? 'bg-amber-500' : 'bg-[var(--brand)] shadow-[0_8px_20px_-10px_rgba(124,58,237,0.7)] hover:bg-[var(--brand-deep)]'}`}>
              <Send size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
