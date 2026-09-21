import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Pencil, Plus, ShieldAlert, Trash2, Users } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import type { ManagedUser } from '@/shared/types';
import { formatDateTime } from '@/features/estoque/utils';
import { ROLE_LABELS } from '@/features/usuarios/constants';
import { CEO } from '@/shared/constants';
import { formatarWhatsapp } from '@/shared/whatsapp';
import { UserModal } from './UserModal';
import { usePlano } from '@/features/planos/usePlano';
import { Cadeado } from '@/features/planos/Cadeado';

export function Usuarios() {
  const currentUser = useAuth((s) => s.user);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [creating, setCreating] = useState(false);
  const planoAtual = usePlano();
  const cabeUsuario = planoAtual.cabeMaisUm('usuarios', users.length);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { users } = await api.get<{ users: ManagedUser[] }>('/api/users');
      setUsers(users);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inseguros = useMemo(() => users.filter((u) => u.senha_em_texto_puro).length, [users]);
  const deletingUser = useMemo(() => users.find((u) => u.id === deletingId) || null, [users, deletingId]);

  async function handleDelete(id: number) {
    try {
      await api.delete(`/api/users/${id}`);
      toast.success('Usuário excluído.');
      setDeletingId(null);
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir usuário.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Usuários</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {users.length} usuário(s) com acesso ao sistema de estoque.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button icon={<Plus size={15} />} onClick={() => setCreating(true)} disabled={!cabeUsuario}>
            Novo usuário
          </Button>
          {!cabeUsuario && <Cadeado texto={planoAtual.porQueNaoMais('usuarios')} />}
        </div>
      </div>

      {inseguros > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-rose-500" />
          <div>
            <p className="text-sm font-bold text-[var(--text)]">
              {inseguros} senha(s) ainda em texto puro no banco
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Essas contas vêm do cadastro antigo e a senha está legível para quem tiver acesso ao banco. Defina uma
              nova senha em cada uma — o sistema grava com bcrypt a partir de agora e o login continua funcionando.
            </p>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <p className="p-10 text-center text-sm text-[var(--text-muted)]">Carregando usuários...</p>
        ) : users.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title="Nenhum usuário encontrado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead className="bg-[var(--surface)]">
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Usuário</th>
                  <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Matrícula</th>
                  <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Perfil</th>
                  <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Senha</th>
                  <th className="hidden px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] lg:table-cell">
                    Criado em
                  </th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="border-b border-[var(--border)] transition-colors hover:bg-[var(--brand)]/5">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--text)]">
                          {u.nome}
                          {isSelf && <span className="ml-2 text-[10px] font-bold text-[var(--brand)]">VOCÊ</span>}
                        </p>
                        {u.email && <p className="text-[11px] text-[var(--text-muted)]">{u.email}</p>}
                        {u.whatsapp && <p className="text-[11px] text-[var(--text-muted)]">WhatsApp {formatarWhatsapp(u.whatsapp)}</p>}
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px] text-[var(--text-muted)]">{u.matricula}</td>
                      <td className="px-3 py-3">
                        {u.role === CEO ? <Badge variant="indigo">CEO</Badge> : <span className="text-xs font-semibold text-[var(--text)]">{ROLE_LABELS[u.role] || u.role}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {u.senha_em_texto_puro ? (
                          <Badge variant="critical" dot>
                            Texto puro
                          </Badge>
                        ) : (
                          <Badge variant="success">Protegida</Badge>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-[11px] text-[var(--text-muted)] lg:table-cell">
                        {formatDateTime(u.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditing(u)}
                            disabled={u.role === CEO && !isSelf}
                            className="rounded-full p-1.5 text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10 disabled:cursor-not-allowed disabled:opacity-30"
                            title={u.role === CEO && !isSelf ? 'Só o CEO altera os próprios dados' : 'Editar'}
                          >
                            <Pencil size={15} />
                          </button>
                          {u.role === CEO ? (
                            <span className="p-1.5 text-[11px] text-[var(--text-muted)]" title="O CEO não pode ser excluído; transfira a titularidade em Plano e assinatura">
                              —
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeletingId(u.id)}
                              disabled={isSelf}
                              className="rounded-full p-1.5 text-rose-500 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                              title={isSelf ? 'Você não pode excluir a própria conta' : 'Excluir'}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="flex items-start gap-2 text-[11px] text-[var(--text-muted)]">
        <KeyRound size={13} className="mt-0.5 shrink-0" />
        Este gerenciador só enxerga perfis do estoque. Usuários de outros produtos da mesma organização ficam de fora
        e não podem ser alterados por aqui, mesmo compartilhando a mesma tabela.
      </p>

      <UserModal
        open={creating || !!editing}
        user={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={load}
      />

      <Modal
        open={!!deletingUser}
        onClose={() => setDeletingId(null)}
        title="Excluir usuário"
        footer={
          deletingUser && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeletingId(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => handleDelete(deletingUser.id)}>
                Excluir
              </Button>
            </div>
          )
        }
      >
        {deletingUser && (
          <p className="text-sm text-[var(--text)]">
            Excluir <strong>{deletingUser.nome}</strong>? Essa ação não pode ser desfeita.
          </p>
        )}
      </Modal>
    </div>
  );
}
