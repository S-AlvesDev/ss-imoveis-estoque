import { useState } from 'react';
import { AVALIACAO_DIAS } from '@/shared/planos';
import { toast } from 'sonner';
import { ArrowRight, Building2, Lock, Mail, User } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { useAuth } from '@/store/auth';
import { Link, ROTAS } from '@/app/router';
import { MIN_PASSWORD_LENGTH } from '@/features/usuarios/constants';
import type { AuthUser } from '@/shared/types';

/**
 * Uma empresa nova entra sozinha. O servidor cria a organização, a primeira
 * unidade com Central e Obra, e quem preencheu vira administrador — e já
 * entra logado, no painel, com o catálogo vazio.
 */
export function CriarConta() {
  const [empresa, setEmpresa] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
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
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa, nome, email, senha }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Não foi possível criar a conta.');
      setSession(body.user as AuthUser, body.token as string);
      toast.success(`Conta de ${body.organizacao?.nome ?? empresa} criada. Bem-vindo(a), ${nome.split(' ')[0]}!`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar a conta.');
    } finally {
      setLoading(false);
    }
  }

  const icone = 'pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]';

  return (
    <>
      <h2 className="font-display text-3xl font-bold text-[var(--text)]">Criar conta</h2>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">
        <strong className="text-[var(--text)]">{AVALIACAO_DIAS} dias grátis, sem cartão.</strong> Sua empresa ganha o próprio estoque e você entra como administrador. Depois, escolha o plano que couber.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="relative">
          <Building2 size={16} className={icone} />
          <Input label="Nome da empresa" required maxLength={60} value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="pl-9" autoFocus placeholder="Ex.: Construtora Alfa" />
        </div>
        <div className="relative">
          <User size={16} className={icone} />
          <Input label="Seu nome" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} className="pl-9" />
        </div>
        <div className="relative">
          <Mail size={16} className={icone} />
          <Input label="Seu e-mail" required type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" autoComplete="email" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Lock size={16} className={icone} />
            <Input label="Senha" required type="password" minLength={MIN_PASSWORD_LENGTH} value={senha} onChange={(e) => setSenha(e.target.value)} className="pl-9" autoComplete="new-password" />
          </div>
          <div className="relative">
            <Lock size={16} className={icone} />
            <Input label="Confirmar" required type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className="pl-9" autoComplete="new-password" />
          </div>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">Você entra pelo e-mail. Os funcionários que você cadastrar entram por matrícula.</p>
        <Button type="submit" fullWidth size="lg" loading={loading} icon={!loading ? <ArrowRight size={16} /> : undefined}>
          Criar conta e entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Já tem conta?{' '}
        <Link href={ROTAS.entrar} className="font-semibold text-[var(--brand)] hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
