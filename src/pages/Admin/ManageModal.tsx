import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { MovementForm, type MovimentoPayload } from '@/features/estoque/MovementForm';
import { api } from '@/lib/api';
import type { Deposito, Material } from '@/shared/types';
import { formatNumber, saldoEm } from '@/features/estoque/utils';

interface ManageModalProps {
  material: Material | null;
  categorias: string[];
  /** Estoques ativos da unidade em uso — a aba Movimentar escolhe um deles. */
  depositos: Deposito[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

export function ManageModal({ material, categorias, depositos, onClose, onUpdated }: ManageModalProps) {
  const [tab, setTab] = useState<'EDITAR' | 'MOVIMENTAR'>('EDITAR');
  const [saving, setSaving] = useState(false);
  const estoquesOperaveis = depositos.filter((d) => d.ativo && d.modo === 'almoxarifado');
  const [depositoId, setDepositoId] = useState(estoquesOperaveis[0]?.id ?? '');
  const deposito = estoquesOperaveis.find((d) => d.id === depositoId) ?? estoquesOperaveis[0] ?? null;
  const [form, setForm] = useState(() => ({
    nome: material?.nome || '',
    categoria: material?.categoria || categorias[0] || '',
    unidade_medida: material?.unidade_medida || '',
    fator_multiplicador: material?.fator_multiplicador ?? 1,
    estoque_minimo: material?.estoque_minimo ?? 0,
    validade_troca_dias: material?.validade_troca_dias == null ? '' : String(material.validade_troca_dias),
  }));
  const temEntrega = depositos.some((d) => d.ativo && d.modo === 'entrega');

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!material) return;
    setSaving(true);
    try {
      await api.put(`/api/materials/${material.id}`, { ...form, validade_troca_dias: form.validade_troca_dias === '' ? null : Number(form.validade_troca_dias) });
      toast.success('Material atualizado.');
      await onUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar material.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMovement(payload: MovimentoPayload) {
    if (!deposito) throw new Error('Escolha o estoque.');
    await api.post(`/api/estoques/${deposito.id}/movimentacoes`, payload);
    await onUpdated();
  }

  return (
    <Modal open={!!material} onClose={onClose} title={material?.nome || ''} subtitle="Gerenciar material" maxWidth="max-w-lg">
      <div className="mb-5 flex rounded-lg bg-[var(--bg-2)] p-1 text-xs font-bold">
        {(['EDITAR', 'MOVIMENTAR'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 rounded-md py-2 transition-colors ${tab === t ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}
          >
            {tab === t && (
              <motion.div
                layoutId="manage-tab-pill"
                className="absolute inset-0 rounded-md bg-[var(--surface)] shadow-sm"
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
            {categorias.map((c) => (
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
          {temEntrega && (
            <Input
              label="Validade de troca (dias)"
              type="number"
              min="1"
              max="3650"
              step="1"
              placeholder="Só para EPI: ex.: 180"
              value={form.validade_troca_dias}
              onChange={(e) => setForm({ ...form, validade_troca_dias: e.target.value })}
            />
          )}
          {material && (
            <p className="text-xs text-[var(--text-muted)]">
              {depositos.filter((d) => d.ativo).map((d) => (
                <span key={d.id} className="mr-3">
                  {d.nome}: <strong>{formatNumber(saldoEm(material, d.id))}</strong>
                </span>
              ))}
              (altere pela aba Movimentar)
            </p>
          )}
          <Button type="submit" fullWidth loading={saving}>
            Salvar Alterações
          </Button>
        </form>
      )}

      {tab === 'MOVIMENTAR' && material && (
        deposito ? (
          <div className="space-y-4">
            {estoquesOperaveis.length > 1 && (
              <Select label="Em qual estoque" value={deposito.id} onChange={(e) => setDepositoId(e.target.value)}>
                {estoquesOperaveis.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </Select>
            )}
            <MovementForm key={deposito.id} materials={[material]} deposito={deposito} outrosEstoques={depositos.filter((d) => d.ativo && d.id !== deposito.id)} onSubmit={handleMovement} />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Esta unidade não tem estoque no modo almoxarifado. Retiradas e devoluções são feitas na tela do estoque de empréstimo.</p>
        )
      )}
    </Modal>
  );
}
