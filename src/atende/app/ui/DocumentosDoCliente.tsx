import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Trash2, Upload } from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { Selecao } from './Campo';
import { Botao } from './Botao';
import { NOME_DO_TIPO_DE_DOCUMENTO, TIPOS_DE_DOCUMENTO, type DocumentoDoCliente, type TipoDeDocumento } from '../../shared/tipos';

const MAX_BYTES = 20 * 1024 * 1024;

function tamanhoBonito(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Os documentos de um cliente (RG, CPF, comprovante de renda…) — usado na
 * ficha do cliente (Central) e na Gestão de MCMV. Sobe direto no Storage
 * (mesmo padrão de anexo do Composer), sem passar pela função.
 */
export function DocumentosDoCliente({ clienteId }: { clienteId: string }) {
  const [documentos, setDocumentos] = useState<DocumentoDoCliente[] | null>(null);
  const [tipo, setTipo] = useState<TipoDeDocumento>('outro');
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  function carregar() {
    api
      .get<{ documentos: DocumentoDoCliente[] }>(`/clientes/${clienteId}/documentos`)
      .then((r) => setDocumentos(r.documentos))
      .catch(() => setDocumentos([]));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  async function subir(file: File) {
    if (file.size > MAX_BYTES) return toast.error('Arquivo grande demais (máximo 20 MB).');
    setEnviando(true);
    try {
      const mimetype = file.type || 'application/octet-stream';
      const prep = await api.post<{ documentoId: string; caminho: string; signedUrl: string; token: string }>(`/clientes/${clienteId}/documentos/url`, { mimetype, nome: file.name, tamanho: file.size });
      const up = await fetch(prep.signedUrl, { method: 'PUT', headers: { 'Content-Type': mimetype, 'x-upsert': 'true' }, body: file });
      if (!up.ok) throw new ErroDaApi(`O Storage recusou o arquivo (${up.status}).`);
      const r = await api.post<{ documentos: DocumentoDoCliente[] }>(`/clientes/${clienteId}/documentos`, { documentoId: prep.documentoId, caminho: prep.caminho, nome: file.name, mimetype, tamanho: file.size, tipo });
      setDocumentos(r.documentos);
      toast.success('Documento anexado.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível subir o documento.');
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  async function excluir(id: string) {
    try {
      await api.delete(`/documentos/${id}`);
      setDocumentos((atual) => (atual ?? []).filter((d) => d.id !== id));
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível excluir.');
    }
  }

  async function abrir(id: string) {
    try {
      const r = await api.get<{ url: string }>(`/documentos/${id}/url`);
      window.open(r.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível abrir o documento.');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeDocumento)} className="flex-1">
          {TIPOS_DE_DOCUMENTO.map((t) => (
            <option key={t} value={t}>
              {NOME_DO_TIPO_DE_DOCUMENTO[t]}
            </option>
          ))}
        </Selecao>
        <input ref={arquivo} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
        <Botao tamanho="sm" variante="secundaria" icone={<Upload size={14} />} carregando={enviando} onClick={() => arquivo.current?.click()}>
          Anexar
        </Botao>
      </div>

      {documentos === null ? (
        <p className="text-xs text-[var(--text-muted)]">Carregando…</p>
      ) : documentos.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Nenhum documento anexado ainda.</p>
      ) : (
        <ul className="space-y-1">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 text-xs">
              <FileText size={14} className="shrink-0 text-[var(--text-muted)]" />
              <button type="button" onClick={() => abrir(d.id)} className="min-w-0 flex-1 truncate text-left font-medium text-[var(--text)] hover:underline">
                {d.nome_arquivo}
              </button>
              <span className="shrink-0 text-[var(--text-muted)]">{NOME_DO_TIPO_DE_DOCUMENTO[d.tipo]}</span>
              <span className="shrink-0 text-[var(--text-muted)]">{tamanhoBonito(d.tamanho)}</span>
              <button type="button" onClick={() => excluir(d.id)} className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600" aria-label="Excluir">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
