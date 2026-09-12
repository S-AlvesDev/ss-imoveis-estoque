import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Mail, MailCheck } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Link, ROTAS } from '@/app/router';
import { linkWhatsApp } from '@/shared/produto';

/**
 * Pede o link de redefinição. A resposta do servidor é a mesma exista a
 * conta ou não, e a tela repete isso — o que a pessoa precisa saber é
 * "olha a caixa de entrada", não "esse e-mail existe".
 */
export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/senha/esqueci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Não foi possível enviar agora.');
      setEnviado(true);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível enviar agora.');
    } finally {
      setLoading(false);
    }
  }

  if (enviado) {
    return (
      <>
        <MailCheck size={40} className="text-[var(--brand)]" />
        <h2 className="font-display mt-4 text-3xl font-bold text-[var(--text)]">Confira seu e-mail</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
          Se existir uma conta com <span className="font-medium text-[var(--text)]">{email.trim().toLowerCase()}</span>, enviamos um link para criar uma senha nova. Ele vale por 1 hora.
        </p>
        <p className="mt-4 text-sm text-[var(--text-muted)]">Não chegou? Olhe o spam, ou espere um minuto e peça de novo.</p>
        <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
          <Link href={ROTAS.entrar} className="font-semibold text-[var(--brand)] hover:underline">
            Voltar para entrar
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="font-display text-3xl font-bold text-[var(--text)]">Esqueci minha senha</h2>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">Informe o e-mail da sua conta. Enviamos um link para criar uma senha nova.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
          <Input label="E-mail" required type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" autoComplete="email" autoFocus />
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading} icon={!loading ? <ArrowRight size={16} /> : undefined}>
          Enviar link
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-4 text-xs leading-relaxed text-[var(--text-muted)]">
        Entra por <strong className="text-[var(--text)]">matrícula</strong> e não tem e-mail cadastrado? Quem troca a sua senha é o administrador da sua empresa, em Usuários.
        Se você é o administrador e perdeu o acesso ao e-mail,{' '}
        <a href={linkWhatsApp('Olá! Perdi o acesso à minha conta do Stok Aí e preciso de ajuda.')} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--brand)] hover:underline">
          fale com a gente no WhatsApp
        </a>
        .
      </div>

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Lembrou?{' '}
        <Link href={ROTAS.entrar} className="font-semibold text-[var(--brand)] hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
