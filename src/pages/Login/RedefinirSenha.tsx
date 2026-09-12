import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Lock, LinkIcon } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Link, ROTAS } from '@/app/router';
import { useAuth } from '@/store/auth';
import { MIN_PASSWORD_LENGTH } from '@/features/usuarios/constants';
import type { AuthUser } from '@/shared/types';

/**
 * A página do link do e-mail: /redefinir-senha?token=... Cria a senha nova e
 * já entra — quem acabou de digitá-la não precisa digitar de novo. Sem
 * token na URL (alguém digitou o endereço à mão), manda pedir um link.
 */
export function RedefinirSenha() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') ?? '', []);
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < MIN_PASSWORD_LENGTH) return toast.error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (senha !== confirmar) return toast.error('As senhas não conferem.');

    setLoading(true);
    try {
      const res = await fetch('/api/senha/redefinir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senha }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Não foi possível redefinir agora.');
      if (body.user && body.token) {
        setSession(body.user as AuthUser, body.token as string);
        toast.success(`Senha nova salva. Bem-vindo(a) de volta, ${String(body.user.nome).split(' ')[0]}!`);
      } else {
        toast.success('Senha nova salva. Entre com ela.');
        window.history.replaceState(null, '', ROTAS.entrar);
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível redefinir agora.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <>
        <LinkIcon size={40} className="text-[var(--text-muted)]" />
        <h2 className="font-display mt-4 text-3xl font-bold text-[var(--text)]">Link incompleto</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
          Esta página só funciona pelo link que enviamos por e-mail. Se ele não abriu direito, copie o endereço inteiro do e-mail — ou peça um novo.
        </p>
        <div className="mt-8">
          <Link href={ROTAS.esqueciSenha} className="font-semibold text-[var(--brand)] hover:underline">
            Pedir um novo link
          </Link>
        </div>
      </>
    );
  }

  const icone = 'pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]';

  return (
    <>
      <h2 className="font-display text-3xl font-bold text-[var(--text)]">Criar nova senha</h2>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">Escolha uma senha com pelo menos {MIN_PASSWORD_LENGTH} caracteres. Você já entra em seguida.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="relative">
          <Lock size={16} className={icone} />
          <Input label="Nova senha" required type="password" minLength={MIN_PASSWORD_LENGTH} value={senha} onChange={(e) => setSenha(e.target.value)} className="pl-9" autoComplete="new-password" autoFocus />
        </div>
        <div className="relative">
          <Lock size={16} className={icone} />
          <Input label="Confirmar nova senha" required type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className="pl-9" autoComplete="new-password" />
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading} icon={!loading ? <ArrowRight size={16} /> : undefined}>
          Salvar e entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        O link expirou?{' '}
        <Link href={ROTAS.esqueciSenha} className="font-semibold text-[var(--brand)] hover:underline">
          Pedir outro
        </Link>
      </p>
    </>
  );
}
