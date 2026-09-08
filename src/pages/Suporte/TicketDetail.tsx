import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessageSquare, Package, Send } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Select, Textarea } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import type { SupportTicket, TicketComment, TicketStatus } from '@/shared/types';
import { formatDateTime } from '@/features/estoque/utils';
import { PRIORIDADE_META, STATUS_META, tipoLabel } from '@/features/suporte/constants';

interface TicketDetailProps {
  ticket: SupportTicket | null;
  isAdmin: boolean;
  currentMatricula: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

export function TicketDetail({ ticket, isAdmin, currentMatricula, onClose, onChanged }: TicketDetailProps) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [sending, setSending] = useState(false);
  const [resolucao, setResolucao] = useState('');

  useEffect(() => {
    if (!ticket) return;
    setMensagem('');
    setResolucao(ticket.resolucao || '');
    setLoading(true);
    api
      .get<{ comments: TicketComment[] }>(`/api/support/${ticket.id}/comments`)
      .then((r) => setComments(r.comments))
      .catch((err) => toast.error(err.message || 'Erro ao carregar mensagens.'))
      .finally(() => setLoading(false));
  }, [ticket]);

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket || !mensagem.trim()) return;
    setSending(true);
    try {
      const { comment } = await api.post<{ comment: TicketComment }>(`/api/support/${ticket.id}/comments`, {
        mensagem: mensagem.trim(),
      });
      setComments((c) => [...c, comment]);
      setMensagem('');
      await onChanged();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  }

  async function updateTicket(patch: { status?: TicketStatus; resolucao?: string }) {
    if (!ticket) return;
    try {
      await api.patch(`/api/support/${ticket.id}`, patch);
      toast.success('Chamado atualizado.');
      await onChanged();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar chamado.');
    }
  }

  if (!ticket) return null;

  const status = STATUS_META[ticket.status];
  const prioridade = PRIORIDADE_META[ticket.prioridade];

  return (
    <Modal
      open={!!ticket}
      onClose={onClose}
      title={ticket.assunto}
      subtitle={`#${ticket.id} · ${tipoLabel(ticket.tipo)} · aberto por ${ticket.autor_nome} em ${formatDateTime(ticket.created_at)}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          <span className={`text-xs font-bold ${prioridade.className}`}>Prioridade {prioridade.label}</span>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-4">
          <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{ticket.descricao}</p>
        </div>

        {ticket.materiais.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <Package size={13} /> Materiais citados ({ticket.materiais.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ticket.materiais.map((m) => (
                <span
                  key={m.id}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    m.material_id
                      ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
                      : 'bg-[var(--bg-2)] text-[var(--text-muted)] line-through'
                  }`}
                  title={m.material_id ? undefined : 'Material excluído ou unificado após a abertura do chamado'}
                >
                  {m.material_nome}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ---- Conversa ---- */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            <MessageSquare size={13} /> Conversa
          </p>

          {loading ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">Carregando mensagens...</p>
          ) : comments.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">Nenhuma mensagem ainda.</p>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {comments.map((c) => {
                const mine = c.autor_matricula === currentMatricula;
                return (
                  <div
                    key={c.id}
                    className={`rounded-xl px-3 py-2 ${
                      mine ? 'ml-6 bg-[var(--brand)]/10' : 'mr-6 bg-[var(--bg-2)]'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--text)]">{c.autor_nome}</span>
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">{formatDateTime(c.created_at)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text)]">{c.mensagem}</p>
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={sendComment} className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <Textarea
                rows={2}
                placeholder="Escreva uma mensagem..."
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
            </div>
            <Button type="submit" loading={sending} disabled={!mensagem.trim()} icon={<Send size={15} />}>
              Enviar
            </Button>
          </form>
        </div>

        {/* ---- Ações da gestão ---- */}
        {isAdmin && (
          <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Ações da gestão</p>

            <Select
              label="Status"
              value={ticket.status}
              onChange={(e) => updateTicket({ status: e.target.value as TicketStatus })}
            >
              {(Object.keys(STATUS_META) as TicketStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </Select>

            <Textarea
              label="Resolução"
              rows={3}
              placeholder="O que foi feito para resolver? Fica registrado para auditoria."
              value={resolucao}
              onChange={(e) => setResolucao(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={resolucao === (ticket.resolucao || '')}
              onClick={() => updateTicket({ resolucao })}
            >
              Salvar resolução
            </Button>

            {ticket.resolvido_por && ticket.resolved_at && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Encerrado por {ticket.resolvido_por} em {formatDateTime(ticket.resolved_at)}.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
