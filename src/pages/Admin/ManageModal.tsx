import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { MovementForm } from '@/features/estoque/MovementForm';
import { api } from '@/lib/api';
import type { Material } from '@/shared/types';
import { CATEGORIES } from '@/shared/constants';
import { formatNumber } from '@/features/estoque/utils';

const ADMIN_OPERATIONS = [
  { value: 'ENTRADA_CENTRAL', label: 'Entrada Central', color: 'bg-emerald-600 text-white' },
  { value: 'SAIDA', label: 'Saída Central', color: 'bg-amber-600 text-white' },
  { value: 'REMESSA_OBRA', label: 'Remessa p/ Obra', color: 'bg-blue-600 text-white' },
  { value: 'DEVOLUCAO_CENTRAL', label: 'Devolução p/ Central', color: 'bg-indigo-600 text-white' },
  { value: 'AJUSTE_CENTRAL', label: 'Ajuste Central', color: 'bg-slate-800 text-white' },
  { value: 'AJUSTE_OBRA', label: 'Ajuste Obra', color: 'bg-slate-800 text-white' },
];

interface ManageModalProps {
  material: Material | null;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

export function ManageModal({ material, onClose, onUpdated }: ManageModalProps) {
  const [tab, setTab] = useState<'EDITAR' | 'MOVIMENTAR'>('EDITAR');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    nome: material?.nome || '',
    categoria: material?.categoria || CATEGORIES[0],
    unidade_medida: material?.unidade_medida || '',
    fator_multiplicador: material?.fator_multiplicador ?? 1,
    estoque_minimo: material?.estoque_minimo ?? 0,
  }));

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!material) return;
    setSaving(true);
    try {
      await api.put(`/api/materials/${material.id}`, form);
      toast.success('Material atualizado.');
      await onUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar material.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMovement(payload: { material_id: number; tipo_operacao: string; quantidade: number; justificativa: string }) {
    await api.post(`/api/materials/${payload.material_id}/movement`, payload);
    await onUpdated();
  }

  return (
    <Modal open={!!material} onClose={onClose} title={material?.nome || ''} subtitle="Gerenciar material" maxWidth="max-w-lg">
      <div className="mb-5 flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
        {(['EDITAR', 'MOVIMENTAR'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 rounded-md py-2 transition-colors ${tab === t ? 'text-blue-600' : 'text-slate-500'}`}
          >
            {tab === t && (
              <motion.div
                layoutId="manage-tab-pill"
                className="absolute inset-0 rounded-md bg-white shadow-sm"
                transition={{ type: 'spring', stiffness: 450, damping: 34 }}
              />
            )}
            <span className="relative">{t === 'EDITAR' ? 'Editar Cadastro' : 'Movimentar'}</span>
          </button>
        ))}
      </div>

      {tab === 'EDITAR' && (
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Input label="Nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <Select label="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            label="Unidade de Medida"
            required
            value={form.unidade_medida}
            onChange={(e) => setForm({ ...form, unidade_medida: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Fator Multiplicador"
              type="number"
              step="0.01"
              value={form.fator_multiplicador}
              onChange={(e) => setForm({ ...form, fator_multiplicador: Number(e.target.value) })}
            />
            <Input
              label="Estoque Mínimo"
              type="number"
              step="0.01"
              value={form.estoque_minimo}
              onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) })}
            />
          </div>
          {material && (
            <p className="text-xs text-slate-400">
              Saldo Central: <strong>{formatNumber(material.saldo_central)}</strong> · Saldo Obra:{' '}
              <strong>{formatNumber(material.saldo_obra)}</strong> (altere pela aba Movimentar)
            </p>
          )}
          <Button type="submit" fullWidth loading={saving}>
            Salvar Alterações
          </Button>
        </form>
      )}

      {tab === 'MOVIMENTAR' && material && (
        <MovementForm
          materials={[material]}
          operations={ADMIN_OPERATIONS}
          onSubmit={handleMovement}
          allowNegative={(op) => op === 'AJUSTE_CENTRAL' || op === 'AJUSTE_OBRA'}
        />
      )}
    </Modal>
  );
}
