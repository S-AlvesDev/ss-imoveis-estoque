import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import type { Deposito, ModoEstoque, Unidade } from '@/shared/types';
import { CONFIG_PADRAO, CamposDoModo, SeletorDeModo, corpoDoEstoque, type ConfigDoModo } from '@/features/estoques/EstoqueModal';
import { MODO_LABELS } from '@/shared/constants';

interface NovaUnidadeModalProps {
  open: boolean;
  onClose: () => void;
  /** Recebe a unidade criada para o app já trocar para ela. */
  onCreated: (unidade: Unidade) => Promise<void> | void;
}

/**
 * Cria uma filial já com o primeiro estoque dela — nome e modo à escolha.
 * Outros estoques entram depois, no cartão da unidade.
 */
export function NovaUnidadeModal({ open, onClose, onCreated }: NovaUnidadeModalProps) {
  const [nome, setNome] = useState('');
  const [estoqueNome, setEstoqueNome] = useState('Almoxarifado');
  const [modo, setModo] = useState<ModoEstoque>('almoxarifado');
  const [config, setConfig] = useState<ConfigDoModo>(CONFIG_PADRAO);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const limpo = nome.trim();
    if (limpo.length < 2) return toast.error('Informe o nome da unidade.');
    if (estoqueNome.trim().length < 2) return toast.error('Informe o nome do primeiro estoque.');

    setSaving(true);
    try {
      const { unidade } = await api.post<{ unidade: Unidade; depositos: Deposito[] }>('/api/units', {
        nome: limpo,
        estoque: corpoDoEstoque(estoqueNome, modo, config),
      });
      toast.success(`Unidade "${unidade.nome}" criada com o estoque ${estoqueNome.trim()}.`);
      setNome('');
      setEstoqueNome('Almoxarifado');
      setModo('almoxarifado');
      onClose();
      await onCreated(unidade);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar unidade.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova unidade" subtitle="Uma filial com o próprio estoque" maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nome da unidade" required maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Natal" autoFocus />
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Primeiro estoque</p>
          <SeletorDeModo value={modo} onChange={setModo} />
        </div>
        <Input label="Nome do estoque" required maxLength={60} value={estoqueNome} onChange={(e) => setEstoqueNome(e.target.value)} placeholder={`Ex.: ${MODO_LABELS[modo].exemplos.split(',')[0]}`} />
        <CamposDoModo modo={modo} config={config} onChange={setConfig} />
        <p className="text-xs text-[var(--text-muted)]">A unidade nova começa sem materiais; escolha quais ela trabalha no cartão dela, em “gerenciar”.</p>
        <Button type="submit" fullWidth loading={saving}>
          Criar unidade
        </Button>
      </form>
    </Modal>
  );
}
