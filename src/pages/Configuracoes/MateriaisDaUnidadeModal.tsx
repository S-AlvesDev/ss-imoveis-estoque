import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, Search } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { api } from '@/lib/api';
import { formatNumber } from '@/features/estoque/utils';
import type { Deposito, Material, Unidade } from '@/shared/types';

interface MateriaisDaUnidadeModalProps {
  open: boolean;
  onClose: () => void;
  unidade: Unidade;
  depositos: Deposito[];
  catalogo: Material[];
  naUnidade: Material[];
  refetch: () => Promise<void>;
}

type Aba = 'adicionar' | 'remover';

/**
 * O que esta unidade trabalha. Adicionar cria o material nela com saldo zero;
 * remover só é possível enquanto o saldo for zero e nunca tiver havido
 * movimentação ali — saldo não some em silêncio.
 */
export function MateriaisDaUnidadeModal({ open, onClose, unidade, depositos, catalogo, naUnidade, refetch }: MateriaisDaUnidadeModalProps) {
  const [aba, setAba] = useState<Aba>('adicionar');
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<number | null>(null);

  const idsNaUnidade = useMemo(() => new Set(naUnidade.map((m) => m.id)), [naUnidade]);
  const foraDaUnidade = useMemo(() => catalogo.filter((m) => !idsNaUnidade.has(m.id)), [catalogo, idsNaUnidade]);

  const q = busca.trim().toLowerCase();
  const filtrar = (lista: Material[]) => (q ? lista.filter((m) => m.nome.toLowerCase().includes(q) || m.categoria.toLowerCase().includes(q)) : lista);
  const candidatos = filtrar(foraDaUnidade);
  const presentes = filtrar(naUnidade);

  // Saldo do material NESTA unidade (não na selecionada no seletor).
  const idsDosDepositos = useMemo(() => new Set(depositos.map((d) => d.id)), [depositos]);
  const saldoAqui = (m: Material) =>
    Object.entries(m.saldos).filter(([id]) => idsDosDepositos.has(id)).reduce((s, [, v]) => s + Number(v), 0);

  function alternar(id: number) {
    setSelecionados((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function selecionarFiltrados() {
    setSelecionados((prev) => {
      const n = new Set(prev);
      candidatos.forEach((m) => n.add(m.id));
      return n;
    });
  }

  async function adicionar() {
    if (selecionados.size === 0) return;
    setSalvando(true);
    try {
      const { adicionados } = await api.post<{ adicionados: number }>(`/api/units/${unidade.id}/materials`, {
        material_ids: [...selecionados],
      });
      toast.success(`${adicionados} material(is) adicionado(s) a ${unidade.nome}.`);
      setSelecionados(new Set());
      setBusca('');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar materiais.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(m: Material) {
    setRemovendo(m.id);
    try {
      await api.delete(`/api/units/${unidade.id}/materials/${m.id}`);
      toast.success(`${m.nome} removido de ${unidade.nome}.`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover material.');
    } finally {
      setRemovendo(null);
    }
  }

  const [removendoTodos, setRemovendoTodos] = useState(false);
  const semSaldo = useMemo(() => naUnidade.filter((m) => saldoAqui(m) === 0).length, [naUnidade, idsDosDepositos]); // eslint-disable-line react-hooks/exhaustive-deps

  async function removerTodosSemSaldo() {
    setRemovendoTodos(true);
    try {
      const { removidos, mantidos } = await api.delete<{ removidos: number; mantidos: number }>(`/api/units/${unidade.id}/materials`);
      toast.success(`${removidos} material(is) removido(s) de ${unidade.nome}.${mantidos ? ` ${mantidos} ficaram por ter saldo ou histórico.` : ''}`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover materiais.');
    } finally {
      setRemovendoTodos(false);
    }
  }

  function fechar() {
    setSelecionados(new Set());
    setBusca('');
    onClose();
  }

  return (
    <Modal open={open} onClose={fechar} title={`Materiais de ${unidade.nome}`} subtitle={`${naUnidade.length} de ${catalogo.length} materiais do catálogo`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <SegmentedControl
          layoutId="materiais-da-unidade-aba"
          value={aba}
          onChange={(v) => { setAba(v as Aba); setBusca(''); }}
          options={[
            { value: 'adicionar', label: `Adicionar (${foraDaUnidade.length})` },
            { value: 'remover', label: `Na unidade (${naUnidade.length})` },
          ]}
        />

        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou categoria..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
          />
        </div>

        {aba === 'adicionar' ? (
          <>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{candidatos.length} disponível(is){q ? ' para a busca' : ''}</span>
              {candidatos.length > 0 && (
                <button type="button" onClick={selecionarFiltrados} className="font-semibold text-[var(--brand)] hover:underline">
                  Selecionar {q ? 'estes' : 'todos'} ({candidatos.length})
                </button>
              )}
            </div>
            <ul className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)]">
              {candidatos.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                  {foraDaUnidade.length === 0 ? 'Todos os materiais do catálogo já estão nesta unidade.' : 'Nada encontrado.'}
                </li>
              )}
              {candidatos.slice(0, 200).map((m) => {
                const marcado = selecionados.has(m.id);
                return (
                  <li key={m.id}>
                    <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-[var(--brand)]/5 ${marcado ? 'bg-[var(--brand)]/10' : ''}`}>
                      <input type="checkbox" checked={marcado} onChange={() => alternar(m.id)} className="accent-[var(--brand)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[var(--text)]">{m.nome}</span>
                        <span className="block truncate text-[11px] text-[var(--text-muted)]">{m.categoria} · {m.unidade_medida}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
              {candidatos.length > 200 && (
                <li className="px-3 py-2 text-center text-[11px] text-[var(--text-muted)]">Mostrando 200 de {candidatos.length}. Refine a busca.</li>
              )}
            </ul>
            <Button fullWidth icon={<Plus size={15} />} loading={salvando} disabled={selecionados.size === 0} onClick={adicionar}>
              Adicionar {selecionados.size > 0 ? `${selecionados.size} material(is)` : ''} a {unidade.nome}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
              <span>Só dá para remover material com saldo zero e sem movimentação nesta unidade.</span>
              {semSaldo > 0 && (
                <Button size="sm" variant="outline" loading={removendoTodos} onClick={removerTodosSemSaldo}>
                  Remover todos sem saldo ({semSaldo})
                </Button>
              )}
            </div>
            <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)]">
              {presentes.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                  {naUnidade.length === 0 ? 'Esta unidade ainda não tem materiais. Use a aba Adicionar.' : 'Nada encontrado.'}
                </li>
              )}
              {presentes.slice(0, 200).map((m) => {
                const saldo = saldoAqui(m);
                return (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--text)]">{m.nome}</span>
                      <span className="block truncate text-[11px] text-[var(--text-muted)]">{m.categoria}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
                      {formatNumber(saldo)} {m.unidade_medida}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Minus size={13} />}
                      loading={removendo === m.id}
                      disabled={saldo !== 0}
                      title={saldo !== 0 ? 'Zere o saldo antes de remover' : 'Remover desta unidade'}
                      onClick={() => remover(m)}
                    >
                      Remover
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
