import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, ImagePlus, Palette, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { MarcaProduto } from '@/shared/ui/Logo';
import { api } from '@/lib/api';
import { useMarca, aplicarCor, COR_PADRAO } from '@/store/marca';
import type { Organizacao } from '@/shared/types';

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** Cores prontas para quem não quer digitar hexadecimal. */
const PALETA = [
  { nome: 'Laranja', hex: '#ff8e29' },
  { nome: 'Azul', hex: '#2563eb' },
  { nome: 'Verde', hex: '#059669' },
  { nome: 'Roxo', hex: '#7c3aed' },
  { nome: 'Vermelho', hex: '#dc2626' },
  { nome: 'Grafite', hex: '#334155' },
  { nome: 'Rosa', hex: '#db2777' },
  { nome: 'Petróleo', hex: '#0f766e' },
];

interface IdentidadeSectionProps {
  refetch: () => Promise<void>;
}

/**
 * Nome, cor e logo da organização. A cor muda ao vivo enquanto se escolhe —
 * a pessoa vê o sistema inteiro na cor antes de salvar — e volta se cancelar.
 * O logo sobe do navegador direto para o Storage: o servidor só autoriza.
 */
export function IdentidadeSection({ refetch }: IdentidadeSectionProps) {
  const organizacao = useMarca((s) => s.organizacao);
  const setOrganizacao = useMarca((s) => s.setOrganizacao);

  const [nome, setNome] = useState(organizacao?.nome ?? '');
  const [cor, setCor] = useState(organizacao?.cor_primaria ?? COR_PADRAO);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  // Quando a organização chega (ou muda), o formulário acompanha.
  useEffect(() => {
    setNome(organizacao?.nome ?? '');
    setCor(organizacao?.cor_primaria ?? COR_PADRAO);
  }, [organizacao?.id, organizacao?.nome, organizacao?.cor_primaria]);

  const corSalva = organizacao?.cor_primaria ?? COR_PADRAO;
  const corValida = /^#[0-9a-fA-F]{6}$/.test(cor);
  const mudou = nome.trim() !== (organizacao?.nome ?? '') || cor.toLowerCase() !== corSalva.toLowerCase();

  // Pré-visualização ao vivo. Se a pessoa sair sem salvar, volta.
  useEffect(() => {
    if (corValida) aplicarCor(cor);
    return () => aplicarCor(corSalva);
  }, [cor, corValida, corSalva]);

  function aplicar(o: Organizacao) {
    setOrganizacao(o);
  }

  async function salvar() {
    if (!corValida) return toast.error('Cor inválida. Use o formato #rrggbb.');
    if (nome.trim().length < 2) return toast.error('Informe o nome da organização.');
    setSalvando(true);
    try {
      const { organizacao: o } = await api.patch<{ organizacao: Organizacao }>('/api/organization', {
        nome: nome.trim(),
        cor_primaria: cor.toLowerCase() === COR_PADRAO ? null : cor.toLowerCase(),
      });
      aplicar(o);
      toast.success('Identidade salva.');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function enviarLogo(file: File) {
    if (!LOGO_TIPOS.includes(file.type)) return toast.error('Use PNG, JPG, WebP ou SVG.');
    if (file.size > LOGO_MAX_BYTES) return toast.error('O logo pode ter no máximo 5 MB.');

    setEnviando(true);
    try {
      // 1. O servidor autoriza um caminho.
      const { signedUrl, path } = await api.post<{ signedUrl: string; token: string; path: string }>(
        '/api/organization/logo-upload-url',
        { content_type: file.type, size: file.size },
      );
      // 2. O arquivo vai direto para o Storage — não passa pelo servidor.
      const up = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'true' }, body: file });
      if (!up.ok) throw new Error(`O Storage recusou o arquivo (${up.status}).`);
      // 3. O servidor confere que chegou e grava a URL.
      const { organizacao: o } = await api.post<{ organizacao: Organizacao }>('/api/organization/logo', { path });
      aplicar(o);
      toast.success('Logo atualizado.');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar o logo.');
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  }

  async function removerLogo() {
    setRemovendo(true);
    try {
      const { organizacao: o } = await api.delete<{ organizacao: Organizacao }>('/api/organization/logo');
      aplicar(o);
      toast.success('Logo removido. A marca do produto volta a aparecer.');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover o logo.');
    } finally {
      setRemovendo(false);
    }
  }

  if (!organizacao) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Identidade</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          O nome, a cor e o logo que a sua equipe vê por dentro. A tela de entrada continua sendo a do produto.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-5 p-5">
          <Input label="Nome da organização" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} />

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <Palette size={12} /> Cor do sistema
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {PALETA.map((p) => {
                const ativa = cor.toLowerCase() === p.hex;
                return (
                  <button
                    key={p.hex}
                    type="button"
                    title={p.nome}
                    onClick={() => setCor(p.hex)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-[var(--surface)] transition-transform hover:scale-110 ${ativa ? 'ring-[var(--text)]' : 'ring-transparent'}`}
                    style={{ background: p.hex }}
                  >
                    {ativa && <Check size={14} className="text-white" />}
                  </button>
                );
              })}
              <label className="ml-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <input
                  type="color"
                  value={corValida ? cor : COR_PADRAO}
                  onChange={(e) => setCor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0.5"
                  title="Escolher outra cor"
                />
                <input
                  value={cor}
                  onChange={(e) => setCor(e.target.value.trim())}
                  maxLength={7}
                  className={`w-24 rounded-lg border bg-[var(--surface)] px-2 py-1.5 font-mono text-xs uppercase text-[var(--text)] outline-none ${corValida ? 'border-[var(--border)] focus:border-[var(--brand)]' : 'border-rose-500'}`}
                  placeholder="#rrggbb"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              A cor se aplica ao vivo enquanto você escolhe. Só fica depois de salvar.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            {mudou && (
              <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={() => { setNome(organizacao.nome); setCor(corSalva); }}>
                Desfazer
              </Button>
            )}
            <Button size="sm" loading={salvando} disabled={!mudou || !corValida} onClick={salvar}>
              Salvar identidade
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col items-center gap-4 p-5">
          <p className="self-start text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Logo</p>
          <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-2)] p-3">
            {organizacao.logo_url ? (
              <img src={organizacao.logo_url} alt={organizacao.nome} className="max-h-full max-w-full object-contain" />
            ) : (
              <MarcaProduto size={64} className="rounded-2xl" />
            )}
          </div>
          <p className="text-center text-[11px] text-[var(--text-muted)]">
            {organizacao.logo_url ? 'Este é o logo que aparece na barra lateral e no topo.' : 'Sem logo próprio: a marca do produto aparece no lugar.'}
            <br />PNG, JPG, WebP ou SVG · até 5 MB
          </p>
          <input
            ref={arquivoRef}
            type="file"
            accept={LOGO_TIPOS.join(',')}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarLogo(f); }}
          />
          <div className="flex w-full flex-col gap-2">
            <Button fullWidth size="sm" icon={organizacao.logo_url ? <Upload size={13} /> : <ImagePlus size={13} />} loading={enviando} onClick={() => arquivoRef.current?.click()}>
              {organizacao.logo_url ? 'Trocar logo' : 'Enviar logo'}
            </Button>
            {organizacao.logo_url && (
              <Button fullWidth size="sm" variant="ghost" icon={<Trash2 size={13} />} loading={removendo} onClick={removerLogo}>
                Remover
              </Button>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
