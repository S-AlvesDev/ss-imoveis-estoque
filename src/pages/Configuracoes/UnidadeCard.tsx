import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Package, PackageOpen, Pencil, Plus, Power, Warehouse, X } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { api } from '@/lib/api';
import type { Deposito, Material, Unidade } from '@/shared/types';
import { MateriaisDaUnidadeModal } from './MateriaisDaUnidadeModal';
import { EstoqueModal } from '@/features/estoques/EstoqueModal';
import { MODO_LABELS } from '@/shared/constants';

interface UnidadeCardProps {
  unidade: Unidade;
  depositos: Deposito[];
  catalogo: Material[];
  podeDesativar: boolean;
  refetch: () => Promise<void>;
  onSelecionar: () => void;
}

/** Campo que vira editável ao clicar no lápis. Salva no Enter, cancela no Esc. */
function NomeEditavel({
  valor,
  onSalvar,
  className = '',
}: {
  valor: string;
  onSalvar: (novo: string) => Promise<void>;
  className?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const limpo = rascunho.trim();
    if (limpo === valor || limpo.length < 2) return setEditando(false);
    setSalvando(true);
    try {
      await onSalvar(limpo);
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <span className={`group inline-flex min-w-0 items-center gap-1.5 ${className}`}>
        <span className="truncate">{valor}</span>
        <button
          type="button"
          onClick={() => { setRascunho(valor); setEditando(true); }}
          className="shrink-0 rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--brand)] group-hover:opacity-100 focus:opacity-100"
          title="Renomear"
        >
          <Pencil size={12} />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        value={rascunho}
        maxLength={60}
        disabled={salvando}
        onChange={(e) => setRascunho(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') salvar();
          if (e.key === 'Escape') setEditando(false);
        }}
        className="rounded-md border border-[var(--brand)] bg-[var(--bg)] px-2 py-0.5 text-sm text-[var(--text)] outline-none ring-2 ring-[var(--brand)]/20"
      />
      <button type="button" onClick={salvar} disabled={salvando} className="rounded p-1 text-emerald-600 hover:bg-emerald-500/10" title="Salvar">
        <Check size={14} />
      </button>
      <button type="button" onClick={() => setEditando(false)} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-2)]" title="Cancelar">
        <X size={14} />
      </button>
    </span>
  );
}

export function UnidadeCard({ unidade, depositos, catalogo, podeDesativar, refetch, onSelecionar }: UnidadeCardProps) {
  const [materiaisOpen, setMateriaisOpen] = useState(false);
  const [mudandoAtivo, setMudandoAtivo] = useState(false);

  // Materiais que existem NESTA unidade — não na selecionada no seletor.
  const idsDosDepositos = useMemo(() => new Set(depositos.map((d) => d.id)), [depositos]);
  const naUnidade = useMemo(
    () => catalogo.filter((m) => Object.keys(m.saldos).some((id) => idsDosDepositos.has(id))),
    [catalogo, idsDosDepositos],
  );

  async function renomearUnidade(nome: string) {
    try {
      await api.patch(`/api/units/${unidade.id}`, { nome });
      toast.success('Unidade renomeada.');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao renomear unidade.');
      throw err;
    }
  }

  const [estoqueModal, setEstoqueModal] = useState<{ open: boolean; deposito: Deposito | null }>({ open: false, deposito: null });

  async function alternarEstoque(deposito: Deposito) {
    try {
      await api.patch(`/api/warehouses/${deposito.id}`, { ativo: !deposito.ativo });
      toast.success(deposito.ativo ? `${deposito.nome} desativado. Some do menu; saldo e histórico ficam.` : `${deposito.nome} reativado.`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar estoque.');
    }
  }

  async function alternarAtivo() {
    setMudandoAtivo(true);
    try {
      await api.patch(`/api/units/${unidade.id}`, { ativo: !unidade.ativo });
      toast.success(unidade.ativo ? 'Unidade desativada. Ela some do seletor; nada foi apagado.' : 'Unidade reativada.');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar unidade.');
    } finally {
      setMudandoAtivo(false);
    }
  }

  const ordem = { CENTRAL: 0, OBRA: 1, OUTRO: 2 };
  const depositosOrdenados = [...depositos].sort((a, b) => Number(b.ativo) - Number(a.ativo) || ordem[a.tipo] - ordem[b.tipo] || a.nome.localeCompare(b.nome));

  return (
    <Card className={`p-5 ${unidade.ativo ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <NomeEditavel valor={unidade.nome} onSalvar={renomearUnidade} className="font-display text-lg font-bold text-[var(--text)]" />
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{unidade.slug}</p>
        </div>
        <Badge variant={unidade.ativo ? 'success' : 'neutral'}>{unidade.ativo ? 'Ativa' : 'Desativada'}</Badge>
      </div>

      <div className="mt-4 space-y-2">
        {depositosOrdenados.map((d) => (
          <div key={d.id} className={`flex items-center gap-3 rounded-xl bg-[var(--bg-2)] px-3 py-2.5 ${d.ativo ? '' : 'opacity-60'}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--brand)]">
              {d.modo === 'emprestimo' ? <PackageOpen size={15} /> : <Warehouse size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text)]">{d.nome}</p>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                {MODO_LABELS[d.modo]?.nome ?? d.modo}
                {d.modo === 'emprestimo' && d.prazo_padrao_horas ? ` · prazo ${d.prazo_padrao_horas} h` : ''}
                {d.ativo ? '' : ' · desativado'}
              </p>
            </div>
            <button type="button" onClick={() => setEstoqueModal({ open: true, deposito: d })} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--brand)]" title="Editar estoque">
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => alternarEstoque(d)}
              disabled={d.ativo && depositos.filter((x) => x.ativo).length <= 1}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--brand)] disabled:opacity-40"
              title={d.ativo ? (depositos.filter((x) => x.ativo).length <= 1 ? 'A unidade precisa de pelo menos um estoque ativo' : 'Desativar') : 'Reativar'}
            >
              <Power size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEstoqueModal({ open: true, deposito: null })}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
        >
          <Plus size={15} /> Novo estoque
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={() => setMateriaisOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)] hover:text-[var(--brand)]"
        >
          <Package size={15} />
          {naUnidade.length} de {catalogo.length} materiais
          <span className="text-xs font-normal text-[var(--text-muted)]">· gerenciar</span>
        </button>
        <div className="flex items-center gap-2">
          {unidade.ativo && (
            <Button size="sm" variant="outline" onClick={onSelecionar}>
              Ver esta unidade
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Power size={13} />}
            loading={mudandoAtivo}
            disabled={unidade.ativo && !podeDesativar}
            title={unidade.ativo && !podeDesativar ? 'Não dá para desativar a única unidade ativa' : undefined}
            onClick={alternarAtivo}
          >
            {unidade.ativo ? 'Desativar' : 'Reativar'}
          </Button>
        </div>
      </div>

      <EstoqueModal open={estoqueModal.open} deposito={estoqueModal.deposito} unidade={unidade} onClose={() => setEstoqueModal((m) => ({ ...m, open: false }))} onSaved={refetch} />
      <MateriaisDaUnidadeModal
        open={materiaisOpen}
        onClose={() => setMateriaisOpen(false)}
        unidade={unidade}
        depositos={depositos}
        catalogo={catalogo}
        naUnidade={naUnidade}
        refetch={refetch}
      />
    </Card>
  );
}
