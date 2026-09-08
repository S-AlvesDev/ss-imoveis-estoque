import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input, Select, Textarea } from '@/shared/ui/Field';
import { MaterialMultiPicker } from '@/shared/ui/MaterialMultiPicker';
import { api } from '@/lib/api';
import type { Material, TicketPrioridade, TicketTipo } from '@/shared/types';
import { TICKET_TIPOS } from '@/features/suporte/constants';

interface NewTicketModalProps {
  open: boolean;
  materials: Material[];
  /** Pré-seleciona materiais quando o chamado nasce de outra tela. */
  initialMaterialIds?: number[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

export function NewTicketModal({ open, materials, initialMaterialIds = [], onClose, onCreated }: NewTicketModalProps) {
  const [tipo, setTipo] = useState<TicketTipo>('DUPLICADO');
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<TicketPrioridade>('NORMAL');
  const [materialIds, setMaterialIds] = useState<number[]>(initialMaterialIds);
  const [saving, setSaving] = useState(false);

  const meta = useMemo(() => TICKET_TIPOS.find((t) => t.value === tipo)!, [tipo]);
  const faltamMateriais = materialIds.length < meta.minMateriais;

  function reset() {
    setTipo('DUPLICADO');
    setAssunto('');
    setDescricao('');
    setPrioridade('NORMAL');
    setMaterialIds([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (faltamMateriais) {
      return toast.error(
        meta.minMateriais === 2
          ? 'Selecione pelo menos dois materiais para relatar duplicidade.'
          : 'Selecione pelo menos um material.'
      );
    }
    setSaving(true);
    try {
      await api.post('/api/support', {
        tipo,
        assunto: assunto.trim(),
        descricao: descricao.trim(),
        prioridade,
        material_ids: materialIds,
      });
      toast.success('Chamado aberto. A gestão foi notificada.');
      reset();
      await onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao abrir chamado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Abrir chamado"
      subtitle="Relate um problema de cadastro para a gestão revisar"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select label="Tipo" required value={tipo} onChange={(e) => setTipo(e.target.value as TicketTipo)}>
          {TICKET_TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <p className="-mt-2 text-[11px] text-[var(--text-muted)]">{meta.hint}</p>

        <MaterialMultiPicker
          materials={materials}
          value={materialIds}
          onChange={setMaterialIds}
          hint={
            meta.minMateriais === 0
              ? 'Opcional para este tipo de chamado.'
              : `Obrigatório: pelo menos ${meta.minMateriais} material(is).`
          }
        />

        <Input
          label="Assunto"
          required
          maxLength={160}
          placeholder="Ex.: Dois cadastros de Abraçadeira de Nilon"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
        />

        <Textarea
          label="Descrição"
          required
          rows={5}
          maxLength={4000}
          placeholder="Explique o que está errado e, se souber, qual seria o correto."
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />

        <Select label="Prioridade" value={prioridade} onChange={(e) => setPrioridade(e.target.value as TicketPrioridade)}>
          <option value="BAIXA">Baixa — pode esperar</option>
          <option value="NORMAL">Normal</option>
          <option value="ALTA">Alta — está travando o trabalho</option>
        </Select>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} icon={<Send size={15} />}>
            Enviar chamado
          </Button>
        </div>
      </form>
    </Modal>
  );
}
