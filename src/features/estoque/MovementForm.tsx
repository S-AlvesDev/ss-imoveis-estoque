import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/Field';
import { MaterialPicker } from '@/shared/ui/MaterialPicker';
import type { Material } from '@/shared/types';
import { formatNumber } from './utils';

export interface OperationOption {
  value: string;
  label: string;
  color: string; // tailwind classes for the toggle button when active
}

interface MovementFormProps {
  materials: Material[];
  operations: OperationOption[];
  onSubmit: (payload: { material_id: number; tipo_operacao: string; quantidade: number; justificativa: string }) => Promise<void>;
  allowNegative?: (op: string) => boolean;
}

export function MovementForm({ materials, operations, onSubmit, allowNegative }: MovementFormProps) {
  const [operacao, setOperacao] = useState(operations[0]?.value || '');
  const [materialId, setMaterialId] = useState(materials.length === 1 ? String(materials[0].id) : '');
  const [quantidade, setQuantidade] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(() => materials.find((m) => String(m.id) === materialId), [materials, materialId]);
  const canBeNegative = allowNegative?.(operacao) ?? false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!materialId) return toast.error('Selecione um material.');
    const qty = Number(quantidade);
    if (!quantidade || (qty === 0) || (!canBeNegative && qty < 0)) {
      return toast.error('Informe uma quantidade válida.');
    }
    if (!justificativa.trim()) return toast.error('Justificativa é obrigatória.');

    setSubmitting(true);
    try {
      await onSubmit({ material_id: Number(materialId), tipo_operacao: operacao, quantidade: qty, justificativa });
      setQuantidade('');
      setJustificativa('');
      toast.success('Movimentação registrada com sucesso.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar movimentação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Operação</p>
        <div className="flex flex-wrap gap-2">
          {operations.map((op) => (
            <button
              type="button"
              key={op.value}
              onClick={() => setOperacao(op.value)}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                operacao === op.value ? op.color : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <MaterialPicker label="Material" required materials={materials} value={materialId} onChange={setMaterialId} />

      {selected && (
        <div className="flex gap-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <span>
            Saldo Central: <strong className="text-slate-700">{formatNumber(selected.saldo_central)}</strong>
          </span>
          <span>
            Saldo Obra: <strong className="text-slate-700">{formatNumber(selected.saldo_obra)}</strong>
          </span>
          <span>
            Mínimo: <strong className="text-slate-700">{formatNumber(selected.estoque_minimo)}</strong>
          </span>
        </div>
      )}

      <Input
        label="Quantidade"
        required
        type="number"
        step="0.01"
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value)}
        placeholder={canBeNegative ? 'Pode ser negativo (ex: -5)' : '0.00'}
      />

      <Textarea
        label="Justificativa / NFe / Guia"
        required
        rows={2}
        value={justificativa}
        onChange={(e) => setJustificativa(e.target.value)}
        placeholder="Descreva o motivo desta movimentação..."
      />

      <Button type="submit" fullWidth loading={submitting}>
        Registrar Movimentação
      </Button>
    </form>
  );
}
