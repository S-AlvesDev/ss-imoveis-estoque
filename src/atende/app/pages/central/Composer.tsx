import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Mic, Paperclip, Send, Square, StickyNote, X } from 'lucide-react';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral } from '../../store/central';
import type { Conversa, Mensagem } from '../../../shared/tipos';
import { tamanhoBonito } from './util';

/**
 * A caixa de resposta: texto (Enter envia, Shift+Enter quebra linha), anexo
 * (imagem, vídeo, PDF, qualquer arquivo até 20 MB — sobe direto para o
 * Storage), áudio gravado no navegador, e o modo "nota interna", que só a
 * equipe vê.
 */
const MAX_BYTES = 20 * 1024 * 1024;

export function Composer({ conversa }: { conversa: Conversa }) {
  const [texto, setTexto] = useState('');
  const [modoNota, setModoNota] = useState(false);
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
    campo.current?.focus();
    setTexto('');
    setAnexo(null);
    setModoNota(false);
  }, [conversa.id]);

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

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
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

  return (
    <div className={`border-t px-3 py-2.5 ${modoNota ? 'border-amber-400/40 bg-amber-50/60 dark:bg-amber-500/5' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
      {anexo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--bg-2)] px-3 py-2 text-xs text-[var(--text)]">
          <Paperclip size={13} />
          <span className="min-w-0 flex-1 truncate">
            {anexo.name} <span className="text-[var(--text-muted)]">· {tamanhoBonito(anexo.size)}</span>
          </span>
          <button type="button" onClick={() => setAnexo(null)} className="rounded p-1 hover:bg-black/10" aria-label="Remover anexo">
            <X size={13} />
          </button>
        </div>
      )}
      {encerrada && !modoNota && <p className="mb-2 text-xs text-[var(--text-muted)]">Conversa encerrada — responder reabre.</p>}
      <div className="flex items-end gap-1.5">
        <button type="button" onClick={() => setModoNota((v) => !v)} title={modoNota ? 'Voltar a responder o cliente' : 'Nota interna (o cliente não vê)'} className={`rounded-xl p-2.5 transition-colors ${modoNota ? 'bg-amber-400 text-amber-950' : 'text-[var(--text-muted)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]'}`}>
          <StickyNote size={18} />
        </button>
        {!modoNota && (
          <>
            <input ref={arquivo} type="file" className="hidden" onChange={(e) => setAnexo(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => arquivo.current?.click()} disabled={gravando} title="Anexar arquivo" className="rounded-xl p-2.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--text)] disabled:opacity-40">
              <Paperclip size={18} />
            </button>
          </>
        )}
        {gravando ? (
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
            Gravando… {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
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
            placeholder={modoNota ? 'Nota interna — só a equipe vê…' : anexo ? 'Legenda (opcional)…' : 'Escreva a resposta… (Enter envia, Shift+Enter quebra linha)'}
            className={`max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${modoNota ? 'border-amber-400/60 bg-white text-amber-950 focus:border-amber-500 dark:bg-amber-500/10 dark:text-amber-50' : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:border-[var(--brand)]'}`}
          />
        )}
        {!modoNota && !texto.trim() && !anexo ? (
          gravando ? (
            <button type="button" onClick={() => pararGravacao(false)} title="Parar e enviar" className="rounded-xl bg-[var(--brand)] p-2.5 text-white">
              <Square size={18} />
            </button>
          ) : (
            <button type="button" onClick={comecarGravacao} disabled={enviando} title="Gravar áudio" className="rounded-xl p-2.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--text)] disabled:opacity-40">
              <Mic size={18} />
            </button>
          )
        ) : (
          <button type="button" onClick={enviarTexto} disabled={enviando || (!texto.trim() && !anexo)} title="Enviar" className={`rounded-xl p-2.5 text-white transition disabled:opacity-40 ${modoNota ? 'bg-amber-500' : 'bg-[var(--brand)]'}`}>
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
