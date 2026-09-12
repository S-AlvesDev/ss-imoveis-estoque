import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Select } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import type { Categoria, Material } from '@/shared/types';

interface CategoriasSectionProps {
  categorias: Categoria[];
  /** Todos os materiais da organização — para contar quantos usam cada categoria. */
  catalogo: Material[];
  refetch: () => Promise<void>;
}

/**
 * As categorias são da organização: uma construtora tem "Alvenaria", uma
 * coordenação de esportes tem "Bolas". Renomear renomeia nos materiais;
 * apagar uma em uso pede para onde mover os materiais.
 */
export function CategoriasSection({ categorias, catalogo, refetch }: CategoriasSectionProps) {
  const [nova, setNova] = useState('');
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [removendo, setRemovendo] = useState<Categoria | null>(null);
  const [destino, setDestino] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const uso = useMemo(() => {
    const m = new Map<string, number>();
    for (const mat of catalogo) m.set(mat.categoria, (m.get(mat.categoria) ?? 0) + 1);
    return m;
  }, [catalogo]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (nova.trim().length === 0) return;
    setCriando(true);
    try {
      await api.post('/api/categorias', { nome: nova.trim() });
      toast.success(`Categoria "${nova.trim()}" criada.`);
      setNova('');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível criar a categoria.');
    } finally {
      setCriando(false);
    }
  }

  async function renomear(c: Categoria) {
    const nome = rascunho.trim();
    if (nome.length === 0 || nome === c.nome) return setEditando(null);
    setOcupado(true);
    try {
      await api.patch(`/api/categorias/${c.id}`, { nome });
      toast.success(`Renomeada para "${nome}"${(uso.get(c.nome) ?? 0) > 0 ? ` em ${uso.get(c.nome)} material(is)` : ''}.`);
      setEditando(null);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível renomear.');
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    if (!removendo) return;
    setOcupado(true);
    try {
      const emUso = uso.get(removendo.nome) ?? 0;
      const r = await api.delete<{ ok: true; movidos: number }>(`/api/categorias/${removendo.id}`, emUso > 0 ? { mover_para: destino } : undefined);
      toast.success(r.movidos > 0 ? `Categoria removida; ${r.movidos} material(is) movidos.` : 'Categoria removida.');
      setRemovendo(null);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível remover.');
    } finally {
      setOcupado(false);
    }
  }

  const outras = removendo ? categorias.filter((c) => c.id !== removendo.id) : [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Categorias de material</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Como os materiais se agrupam nas telas e nos relatórios. Renomear aqui renomeia em todos os materiais.</p>
      </div>

      <Card className="p-5">
        <ul className="divide-y divide-[var(--border)]">
          {categorias.map((c) => {
            const n = uso.get(c.nome) ?? 0;
            const emEdicao = editando === c.id;
            return (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">
                  <Tags size={15} />
                </span>
                {emEdicao ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      renomear(c);
                    }}
                  >
                    <input
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      maxLength={60}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Escape' && setEditando(null)}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--brand)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] outline-none"
                    />
                    <button type="submit" disabled={ocupado} className="rounded-lg p-1.5 text-[var(--verde)] hover:bg-[var(--bg-2)]" title="Salvar">
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={() => setEditando(null)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)]" title="Cancelar">
                      <X size={15} />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{c.nome}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{n === 0 ? 'nenhum material' : `${n} material(is)`}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(c.id);
                        setRascunho(c.nome);
                      }}
                      className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)] hover:text-[var(--brand)]"
                      title="Renomear"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRemovendo(c);
                        setDestino(categorias.find((x) => x.id !== c.id)?.id ?? '');
                      }}
                      disabled={categorias.length <= 1}
                      className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--vermelho)]/10 hover:text-[var(--vermelho)] disabled:opacity-40"
                      title={categorias.length <= 1 ? 'A organização precisa de pelo menos uma categoria' : 'Remover'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <form onSubmit={criar} className="mt-3 flex gap-2 border-t border-[var(--border)] pt-4">
          <input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            maxLength={60}
            placeholder="Nova categoria (ex.: Bolas, Redes, Uniformes)"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
          />
          <Button type="submit" icon={<Plus size={15} />} loading={criando} disabled={nova.trim().length === 0}>
            Adicionar
          </Button>
        </form>
      </Card>

      <Modal open={removendo !== null} onClose={() => setRemovendo(null)} title={`Remover "${removendo?.nome}"`} maxWidth="max-w-md">
        {removendo && (
          <div className="space-y-4">
            {(uso.get(removendo.nome) ?? 0) > 0 ? (
              <>
                <p className="text-sm text-[var(--text-muted)]">
                  <strong className="text-[var(--text)]">{uso.get(removendo.nome)}</strong> material(is) usam esta categoria. Para qual eles vão?
                </p>
                <Select label="Mover para" value={destino} onChange={(e) => setDestino(e.target.value)}>
                  {outras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Nenhum material usa esta categoria. Pode remover sem medo.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRemovendo(null)}>
                Cancelar
              </Button>
              <Button variant="danger" loading={ocupado} onClick={remover} icon={<Trash2 size={14} />}>
                Remover
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
