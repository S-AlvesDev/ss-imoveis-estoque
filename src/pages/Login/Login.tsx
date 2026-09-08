import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { ArrowRight, Lock, User } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Stripes } from '@/shared/ui/Stripes';
import { Logo } from '@/shared/ui/Logo';
import { useAuth } from '@/store/auth';
import type { AuthUser } from '@/shared/types';

const metrics = [
  { label: 'Materiais sob controle', value: '300+' },
  { label: 'Movimentações auditadas', value: '600+' },
  { label: 'Disponibilidade', value: '24/7' },
];

export function Login() {
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricula, senha }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao entrar.');
      setSession(body.user as AuthUser, body.token as string);
      toast.success(`Bem-vindo(a), ${body.user.nome.split(' ')[0]}!`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-slate-950 lg:grid-cols-[1.15fr_1fr]">
      {/* ---- Left: brand panel ---- */}
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        {/* blueprint grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 15%, rgba(255,142,41,0.35), transparent 42%), radial-gradient(circle at 90% 85%, rgba(39,208,149,0.14), transparent 45%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 grain" />

        {/* signature stripe ribbon */}
        <Stripes className="absolute -right-10 top-0 h-full w-16 -skew-x-[14deg] opacity-90" color="rgba(255,142,41,0.85)" />
        <Stripes className="absolute -right-10 top-0 h-full w-16 -skew-x-[14deg] opacity-90 mix-blend-multiply" color="rgba(11,15,25,0.9)" />

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 flex items-center gap-2.5 text-white"
        >
          <Logo size={36} className="rounded-full bg-white/95 p-1 shadow-lg" />
          <span className="font-mono text-[11px] font-semibold tracking-[0.25em] text-slate-300">SS IMÓVEIS / ESTOQUE</span>
        </motion.div>

        <div className="relative z-10 max-w-lg">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-[var(--brand)]"
          >
            Gestão de Almoxarifado
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="font-display mt-3 text-5xl font-bold leading-[1.05] text-white"
          >
            Cada material,
            <br />
            no lugar certo.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.26 }}
            className="mt-5 max-w-md text-sm leading-relaxed text-slate-400"
          >
            Controle de central e obra, transferências rastreadas, auditoria completa de movimentações e alertas
            automáticos de estoque crítico — em um painel só.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.36 }}
            className="mt-10 flex gap-8"
          >
            {metrics.map((m, i) => (
              <div key={m.label} className="border-l border-white/10 pl-4" style={{ transitionDelay: `${i * 40}ms` }}>
                <p className="font-display text-2xl font-bold text-white">{m.value}</p>
                <p className="mt-1 max-w-[9rem] text-[11px] leading-tight text-slate-500">{m.label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="relative z-10 font-mono text-[11px] tracking-wide text-slate-600"
        >
          Imobiliária São Severino · Sistema Interno · Nova Cruz-RN
        </motion.p>
      </div>

      {/* ---- Right: form ---- */}
      <div className="relative flex items-center justify-center bg-[var(--surface)] p-6 sm:p-10">
        <Stripes className="absolute inset-x-0 top-0 h-1.5 lg:hidden" color="rgba(255,142,41,0.9)" />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={36} />
            <span className="font-mono text-xs font-semibold tracking-[0.2em] text-[var(--text)]">SS IMÓVEIS / ESTOQUE</span>
          </div>

          <h2 className="font-display text-3xl font-bold text-[var(--text)]">Acessar painel</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">Entre com sua matrícula ou e-mail cadastrado.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="relative">
              <User size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
              <Input
                label="Matrícula ou e-mail"
                required
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
              <Input
                label="Senha"
                required
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" fullWidth size="lg" loading={loading} icon={!loading ? <ArrowRight size={16} /> : undefined}>
              Entrar
            </Button>
          </form>

          <div className="mt-10 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="font-mono">acesso restrito</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
