import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Merge } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { api } from '@/lib/api';
import type { Material, Deposito } from '@/shared/types';
import { formatNumber, saldoEm } from '@/features/estoque/utils';

interface MergeModalProps {
  open: boolean;
  materials: Material[];
  /** Estoques ativos da unidade em uso, para mostrar o saldo em cada um. */
  depositos: Deposito[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

export function MergeModal({ open, materials, depositos, onClose, onDone }: MergeModalProps) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && materials.length > 0) {
      const biggest = [...materials].sort((a, b) => b.saldo_unidade - a.saldo_unidade)[0];
      setTargetId(biggest.id);
    }
  }, [open, materials]);

  const target = materials.find((m) => m.id === targetId) || null;
  const donors = materials.filter((m) => m.id !== targetId);

  const unidadesDiferentes = useMemo(
    () => !!target && donors.some((d) => d.unidade_medida !== target.unidade_medida),
    [target, donors]
  );

  // O saldo unificado, estoque por estoque: o do alvo mais o de cada doador.
  const previewPorEstoque = depositos
    .filter((d) => d.ativo)
    .map((d) => ({ deposito: d, saldo: saldoEm(target ?? { saldos_unidade: {}, saldo_unidade: 0, estoque_minimo: 0 }, d.id) + donors.reduce((s, m) => s + saldoEm(m, d.id), 0) }));

  async function handleMerge() {
    if (!target) return;
    if (unidadesDiferentes) return toast.error('As unidades de medida precisam ser iguais para unificar.');
    setSaving(true);
    try {
      await api.post('/api/materials/merge', { targetId: target.id, sourceIds: donors.map((d) => d.id) });
      toast.success(`${donors.length} material(is) unificado(s) em "${target.nome}".`);
      onClose();
      await onDone();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao unificar materiais.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unificar Materiais"
      subtitle={`${materials.length} selecionados — escolha qual fica como principal`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-2">
        {materials.map((m) => (
          <label
            key={m.id}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
              targetId === m.id ? 'border-[var(--brand)] bg-[var(--brand)]/10' : 'border-[var(--border)] hover:border-[var(--brand)]/50'
            }`}
          >
            <input
              type="radio"
              name="merge-target"
              checked={targetId === m.id}
              onChange={() => setTargetId(m.id)}
              className="accent-blue-600"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text)]">{m.nome}</p>
              <p className="font-mono text-[11px] text-[var(--text-muted)]">
                {depositos.filter((d) => d.ativo).map((d) => `${d.nome}: ${formatNumber(saldoEm(m, d.id))}`).join(' · ')} {m.unidade_medida}
              </p>
            </div>
            {targetId === m.id && (
              <span className="shrink-0 rounded-full bg-[var(--brand)] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                Principal
              </span>
            )}
          </label>
        ))}
      </div>

      {unidadesDiferentes && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>As unidades de medida são diferentes entre os selecionados. Ajuste-as antes de unificar (edite cada material individualmente).</p>
        </div>
      )}

      {target && !unidadesDiferentes && (
        <div className="mt-4 rounded-lg bg-[var(--bg-2)] p-3 text-xs text-[var(--text-muted)]">
          <p className="mb-1 font-bold uppercase tracking-wide text-[var(--text-muted)]">Resultado</p>
          <p>
            <strong className="text-[var(--text)]">{target.nome}</strong> passa a ter{' '}
            {previewPorEstoque.map((p, i) => (
              <span key={p.deposito.id}>
                {i > 0 ? ', ' : ''}
                {p.deposito.nome}: <strong className="text-[var(--text)]">{formatNumber(p.saldo)}</strong>
              </span>
            ))}{' '}
            {target.unidade_medida}.
          </p>
          <p className="mt-1 text-[var(--text-muted)]">
            {donors.map((d) => d.nome).join(', ')} — {donors.length > 1 ? 'serão removidos' : 'será removido'}, com o histórico
            preservado na auditoria.
          </p>
        </div>
      )}

      <Button
        fullWidth
        className="mt-5"
        icon={<Merge size={16} />}
        loading={saving}
        disabled={unidadesDiferentes || donors.length === 0}
        onClick={handleMerge}
      >
        Unificar em "{target?.nome || '...'}"
      </Button>
    </Modal>
  );
}
