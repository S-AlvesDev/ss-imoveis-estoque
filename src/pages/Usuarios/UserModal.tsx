import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import type { ManagedUser } from '@/shared/types';
import { ASSIGNABLE_ROLES, MIN_PASSWORD_LENGTH, ROLE_HINTS, ROLE_LABELS } from '@/features/usuarios/constants';

interface UserModalProps {
  open: boolean;
  /** `null` cria um usuário novo. */
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/** Senha aleatória legível, para o admin entregar ao funcionário e ele trocar depois. */
function generatePassword(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function UserModal({ open, user, onClose, onSaved }: UserModalProps) {
  const isEdit = !!user;
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(ASSIGNABLE_ROLES[0]);
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(user?.nome ?? '');
    setMatricula(user?.matricula ?? '');
    setEmail(user?.email ?? '');
    setRole(user?.role ?? ASSIGNABLE_ROLES[0]);
    setSenha('');
    setShowSenha(false);
  }, [open, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return toast.error('Informe o nome.');
    if (!isEdit && !matricula.trim()) return toast.error('Informe a matrícula.');
    if (!isEdit && senha.length < MIN_PASSWORD_LENGTH) {
      return toast.error(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
    if (isEdit && senha && senha.length < MIN_PASSWORD_LENGTH) {
      return toast.error(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/api/users/${user!.id}`, {
          nome: nome.trim(),
          email: email.trim() || null,
          role,
          ...(senha ? { senha } : {}),
        });
        toast.success(senha ? 'Usuário atualizado e senha redefinida.' : 'Usuário atualizado.');
      } else {
        await api.post('/api/users', {
          nome: nome.trim(),
          matricula: matricula.trim(),
          email: email.trim() || null,
          role,
          senha,
        });
        toast.success('Usuário criado.');
      }
      await onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar usuário' : 'Novo usuário'}
      subtitle={isEdit ? user!.matricula : 'Acesso ao sistema de estoque'}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />

        <Input
          label="Matrícula"
          required={!isEdit}
          disabled={isEdit}
          value={matricula}
          onChange={(e) => setMatricula(e.target.value)}
          placeholder="Ex.: E1042"
        />
        {isEdit && <p className="-mt-2 text-[11px] text-[var(--text-muted)]">A matrícula identifica o histórico e não pode mudar.</p>}

        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="opcional — também serve para entrar"
        />

        <Select label="Perfil" required value={role} onChange={(e) => setRole(e.target.value)}>
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r] || r}
            </option>
          ))}
        </Select>
        <p className="-mt-2 text-[11px] text-[var(--text-muted)]">{ROLE_HINTS[role]}</p>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            {isEdit ? 'Nova senha' : 'Senha'} {!isEdit && <span className="text-rose-500">*</span>}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={isEdit ? 'Deixe em branco para manter a atual' : `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                autoComplete="new-password"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-3 pr-10 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
              />
              <button
                type="button"
                onClick={() => setShowSenha((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)]"
                title={showSenha ? 'Ocultar' : 'Mostrar'}
              >
                {showSenha ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              icon={<RefreshCw size={14} />}
              onClick={() => {
                setSenha(generatePassword());
                setShowSenha(true);
              }}
            >
              Gerar
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            A senha é gravada com bcrypt — nem você nem o banco conseguem lê-la depois. Copie e entregue ao funcionário
            antes de salvar.
          </p>
        </div>

        {isEdit && user?.senha_em_texto_puro && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-[var(--text)]">
            A senha atual deste usuário está em <strong>texto puro</strong> no banco. Defina uma nova aqui para
            protegê-la.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Salvar alterações' : 'Criar usuário'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
