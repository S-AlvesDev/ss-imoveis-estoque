import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PackageOpen, Warehouse } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import type { Deposito, ModoEstoque, Unidade } from '@/shared/types';
import { MODO_LABELS } from '@/shared/constants';

interface EstoqueModalProps {
  open: boolean;
  onClose: () => void;
  unidade: Unidade;
  /** Presente = editar; ausente = criar nesta unidade. */
  deposito?: Deposito | null;
  onSaved: () => Promise<void>;
}

/** Os cartões de modo, compartilhados por criar, editar e o primeiro acesso. */
export function SeletorDeModo({ value, onChange, disabled }: { value: ModoEstoque; onChange: (m: ModoEstoque) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(['almoxarifado', 'emprestimo'] as ModoEstoque[]).map((m) => {
        const ativo = value === m;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            aria-pressed={ativo}
            className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${ativo ? 'border-[var(--brand)] bg-[var(--brand)]/10' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]/50'}`}
          >
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${ativo ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>
              {m === 'almoxarifado' ? <Warehouse size={16} /> : <PackageOpen size={16} />}
            </span>
            <p className="mt-2 text-sm font-bold text-[var(--text)]">{MODO_LABELS[m].nome}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">{MODO_LABELS[m].descricao}</p>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Cria ou edita um estoque de uma unidade: nome, modo e — no modo empréstimo
 * — o prazo padrão. Mudar o modo com retirada pendente é o servidor que
 * recusa, e a mensagem dele aparece aqui.
 */
export function EstoqueModal({ open, onClose, unidade, deposito, onSaved }: EstoqueModalProps) {
  const [nome, setNome] = useState('');
  const [modo, setModo] = useState<ModoEstoque>('almoxarifado');
  const [prazo, setPrazo] = useState('2');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(deposito?.nome ?? '');
    setModo(deposito?.modo ?? 'almoxarifado');
    setPrazo(String(deposito?.prazo_padrao_horas ?? 2));
  }, [open, deposito]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const corpo = { nome: nome.trim(), modo, prazo_padrao_horas: modo === 'emprestimo' ? Number(prazo) : undefined };
      if (deposito) {
        await api.patch(`/api/warehouses/${deposito.id}`, corpo);
        toast.success('Estoque atualizado.');
      } else {
        const r = await api.post<{ deposito: Deposito; materiais: number }>(`/api/units/${unidade.id}/estoques`, corpo);
        toast.success(r.materiais > 0 ? `${r.deposito.nome} criado com ${r.materiais} materiais da unidade (saldo zero).` : `${r.deposito.nome} criado.`);
      }
      onClose();
      await onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível salvar o estoque.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={deposito ? `Editar ${deposito.nome}` : `Novo estoque em ${unidade.nome}`} subtitle="Nome, modo de operação e prazo">
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Modo</p>
          <SeletorDeModo value={modo} onChange={setModo} />
        </div>
        <Input label="Nome" required minLength={2} maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={modo === 'emprestimo' ? 'Ex.: Coordenação de Esportes' : 'Ex.: Almoxarifado'} autoFocus={!deposito} />
        {modo === 'emprestimo' && (
          <Input label="Prazo padrão de devolução (horas)" required type="number" min="1" max="8760" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        )}
        {!deposito && <p className="text-xs text-[var(--text-muted)]">Os materiais que esta unidade já trabalha entram no estoque novo com saldo zero.</p>}
        <Button type="submit" fullWidth loading={saving}>
          {deposito ? 'Salvar' : 'Criar estoque'}
        </Button>
      </form>
    </Modal>
  );
}
