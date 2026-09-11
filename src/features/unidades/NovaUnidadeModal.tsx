import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import type { Deposito, Unidade } from '@/shared/types';

interface NovaUnidadeModalProps {
  open: boolean;
  onClose: () => void;
  /** Recebe a unidade criada para o app já trocar para ela. */
  onCreated: (unidade: Unidade) => Promise<void> | void;
}

/**
 * Cria uma filial. O servidor cria junto o Almoxarifado Central e o de Obra
 * dela, com saldo zero em todos os materiais — a unidade nova já nasce
 * aparecendo em toda tela.
 */
export function NovaUnidadeModal({ open, onClose, onCreated }: NovaUnidadeModalProps) {
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const limpo = nome.trim();
    if (limpo.length < 2) return toast.error('Informe o nome da unidade.');

    setSaving(true);
    try {
      const { unidade } = await api.post<{ unidade: Unidade; depositos: Deposito[] }>('/api/units', { nome: limpo });
      toast.success(`Unidade "${unidade.nome}" criada com Central e Obra.`);
      setNome('');
      onClose();
      await onCreated(unidade);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar unidade.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova unidade" subtitle="Uma filial com o próprio Central e a própria Obra">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nome da unidade"
          required
          maxLength={60}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Natal"
          autoFocus
        />
        <p className="text-xs text-[var(--text-muted)]">
          Todos os materiais passam a existir nela com saldo zero. O estoque das outras unidades não muda.
        </p>
        <Button type="submit" fullWidth loading={saving}>
          Criar unidade
        </Button>
      </form>
    </Modal>
  );
}
