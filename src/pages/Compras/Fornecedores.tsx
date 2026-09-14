import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Store, Trash2 } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { Input, Textarea } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import { formatarWhatsapp } from '@/shared/whatsapp';
import type { Fornecedor } from '@/shared/cotacoes';

interface Props {
  fornecedores: Fornecedor[];
  loading: boolean;
  refetch: () => Promise<void>;
}

/** A lista de lojas que a empresa cota: nome, WhatsApp e quem atende. */
export function Fornecedores({ fornecedores, loading, refetch }: Props) {
  const [editing, setEditing] = useState<Fornecedor | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Fornecedor | null>(null);

  async function excluir(f: Fornecedor) {
    try {
      const r = await api.delete<{ inativado?: boolean }>(`/api/fornecedores/${f.id}`);
      toast.success(r.inativado ? 'Fornecedor desativado — ele já participou de cotações, então o histórico fica.' : 'Fornecedor excluído.');
      setDeleting(null);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir.');
    }
  }

  const ativos = fornecedores.filter((f) => f.ativo);
  const inativos = fornecedores.filter((f) => !f.ativo);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          {ativos.length} fornecedor(es). É para o WhatsApp deles que as cotações vão.
        </p>
        <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>
          Novo fornecedor
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <p className="p-10 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
        ) : fornecedores.length === 0 ? (
          <EmptyState icon={<Store size={20} />} title="Nenhum fornecedor ainda" subtitle="Cadastre as lojas com que você compra — nome e WhatsApp bastam." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="bg-[var(--surface)]">
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Fornecedor</th>
                  <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">WhatsApp</th>
                  <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Contato</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {[...ativos, ...inativos].map((f) => (
                  <tr key={f.id} className={`border-b border-[var(--border)] transition-colors hover:bg-[var(--brand)]/5 ${f.ativo ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--text)]">
                        {f.nome} {!f.ativo && <Badge variant="neutral">inativo</Badge>}
                      </p>
                      {f.observacoes && <p className="text-[11px] text-[var(--text-muted)]">{f.observacoes}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] text-[var(--text-muted)]">{formatarWhatsapp(f.whatsapp)}</td>
                    <td className="px-3 py-3 text-xs text-[var(--text)]">{f.contato ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(f)} className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--brand)]" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleting(f)} className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-rose-500/10 hover:text-rose-500" title="Excluir">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <FornecedorModal open={creating || !!editing} fornecedor={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={refetch} />

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Excluir fornecedor?"
        subtitle={deleting ? `${deleting.nome} sai da lista. Se já participou de cotações, fica só desativado.` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => deleting && excluir(deleting)}>Excluir</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-muted)]">Nenhuma mensagem é enviada ao fornecedor.</p>
      </Modal>
    </div>
  );
}

function FornecedorModal({ open, fornecedor, onClose, onSaved }: { open: boolean; fornecedor: Fornecedor | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [contato, setContato] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(fornecedor?.nome ?? '');
    setWhatsapp(fornecedor?.whatsapp ? formatarWhatsapp(fornecedor.whatsapp) : '');
    setContato(fornecedor?.contato ?? '');
    setObservacoes(fornecedor?.observacoes ?? '');
    setAtivo(fornecedor?.ativo ?? true);
  }, [open, fornecedor]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) return toast.error('Informe o nome do fornecedor.');
    if (whatsapp.replace(/\D/g, '').length < 10) return toast.error('Informe o WhatsApp com DDD.');
    setSaving(true);
    try {
      const corpo = { nome: nome.trim(), whatsapp, contato: contato.trim() || null, observacoes: observacoes.trim() || null, ativo };
      if (fornecedor) await api.patch(`/api/fornecedores/${fornecedor.id}`, corpo);
      else await api.post('/api/fornecedores', corpo);
      toast.success(fornecedor ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
      await onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}
      subtitle="A cotação chega no WhatsApp desta pessoa, em nome da sua empresa."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-fornecedor" loading={saving}>{fornecedor ? 'Salvar' : 'Cadastrar'}</Button>
        </>
      }
    >
      <form id="form-fornecedor" onSubmit={salvar} className="space-y-4">
        <Input label="Nome da loja / fornecedor" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Depósito Central Materiais" required />
        <Input label="WhatsApp" value={whatsapp} onChange={(e) => setWhatsapp(formatarWhatsapp(e.target.value))} inputMode="tel" placeholder="(84) 99999-9999" required />
        <Input label="Quem atende (opcional)" value={contato} onChange={(e) => setContato(e.target.value)} placeholder="João" />
        <Textarea label="Observações (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} placeholder="Entrega só com pedido mínimo de R$ 300; aceita boleto." />
        {fornecedor && (
          <label className="flex items-center gap-2 text-xs text-[var(--text)]">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo (aparece na hora de escolher fornecedores)
          </label>
        )}
      </form>
    </Modal>
  );
}
