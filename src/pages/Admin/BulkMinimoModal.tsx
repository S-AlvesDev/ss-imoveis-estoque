import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import type { Material } from '@/shared/types';

interface BulkMinimoModalProps {
  open: boolean;
  materials: Material[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

export function BulkMinimoModal({ open, materials, onClose, onDone }: BulkMinimoModalProps) {
  const [minimo, setMinimo] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(minimo);
    if (minimo === '' || Number.isNaN(value) || value < 0) {
      return toast.error('Informe um estoque mínimo válido.');
    }
    setSaving(true);
    try {
      await api.patch('/api/materials/bulk-minimo', { ids: materials.map((m) => m.id), estoque_minimo: value });
      toast.success(`Estoque mínimo atualizado em ${materials.length} material(is).`);
      setMinimo('');
      onClose();
      await onDone();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar estoque mínimo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Definir Estoque Mínimo" subtitle={`${materials.length} material(is) selecionado(s)`}>
      <div className="mb-4 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3">
        {materials.map((m) => (
          <p key={m.id} className="truncate text-xs text-slate-600">
            &bull; {m.nome} <span className="text-slate-400">(atual: {m.estoque_minimo})</span>
          </p>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Novo estoque mínimo"
          required
          type="number"
          step="0.01"
          min={0}
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
        <p className="text-xs text-slate-400">Vale para todos os materiais selecionados, substituindo o valor atual de cada um.</p>
        <Button type="submit" fullWidth loading={saving}>
          Aplicar a {materials.length} material(is)
        </Button>
      </form>
    </Modal>
  );
}
