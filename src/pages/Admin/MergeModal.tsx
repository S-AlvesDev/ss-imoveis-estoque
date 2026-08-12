import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Merge } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { api } from '@/lib/api';
import type { Material } from '@/shared/types';
import { formatNumber } from '@/features/estoque/utils';

interface MergeModalProps {
  open: boolean;
  materials: Material[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

export function MergeModal({ open, materials, onClose, onDone }: MergeModalProps) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && materials.length > 0) {
      const biggest = [...materials].sort(
        (a, b) => b.saldo_central + b.saldo_obra - (a.saldo_central + a.saldo_obra)
      )[0];
      setTargetId(biggest.id);
    }
  }, [open, materials]);

  const target = materials.find((m) => m.id === targetId) || null;
  const donors = materials.filter((m) => m.id !== targetId);

  const unidadesDiferentes = useMemo(
    () => !!target && donors.some((d) => d.unidade_medida !== target.unidade_medida),
    [target, donors]
  );

  const previewCentral = (target?.saldo_central || 0) + donors.reduce((s, d) => s + d.saldo_central, 0);
  const previewObra = (target?.saldo_obra || 0) + donors.reduce((s, d) => s + d.saldo_obra, 0);

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
              targetId === m.id ? 'border-blue-500 bg-blue-50/60' : 'border-slate-200 hover:border-slate-300'
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
              <p className="truncate text-sm font-semibold text-slate-800">{m.nome}</p>
              <p className="font-mono text-[11px] text-slate-400">
                Central: {formatNumber(m.saldo_central)} · Obra: {formatNumber(m.saldo_obra)} {m.unidade_medida}
              </p>
            </div>
            {targetId === m.id && (
              <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
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
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1 font-bold uppercase tracking-wide text-slate-400">Resultado</p>
          <p>
            <strong className="text-slate-800">{target.nome}</strong> passa a ter Central:{' '}
            <strong className="text-slate-800">{formatNumber(previewCentral)}</strong>, Obra:{' '}
            <strong className="text-slate-800">{formatNumber(previewObra)}</strong> {target.unidade_medida}.
          </p>
          <p className="mt-1 text-slate-400">
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
