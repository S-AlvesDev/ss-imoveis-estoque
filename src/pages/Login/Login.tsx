import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Lock, User } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Stripes } from '@/shared/ui/Stripes';
import { LogoProduto } from '@/shared/ui/Logo';
import { PRODUTO } from '@/shared/produto';
import { useAuth } from '@/store/auth';
import { Link, ROTAS } from '@/app/router';
import type { AuthUser } from '@/shared/types';
import { entrarNaSevla, sessaoDoProduto, deveCairNoLoginAntigo } from '@/shared/sevlaNavegador';
import { LinhaSevla } from '@/shared/ui/SeloSevla';
import { CriarConta } from './CriarConta';
import { EsqueciSenha } from './EsqueciSenha';
import { RedefinirSenha } from './RedefinirSenha';

const metrics = [
  { label: 'Unidades por conta', value: '∞' },
  { label: 'Movimentações com origem e destino', value: '100%' },
  { label: 'Isolamento entre empresas', value: 'no banco' },
];

export type ModoDeAcesso = 'entrar' | 'criar' | 'esqueci' | 'redefinir';

/**
 * As telas de acesso: entrar, criar conta, esqueci a senha e redefinir — a
 * rota decide qual. O painel da esquerda é a marca do produto, sempre navy:
 * ninguém entrou ainda, então não há organização para vestir.
 */
export function Login({ modo }: { modo: ModoDeAcesso }) {
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);

  const [semStok, setSemStok] = useState(false);

  /** O login de sempre: matrícula ou e-mail direto na tabela do Stok Aí. */
  async function entrarPeloStok() {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matricula, senha }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Falha ao entrar.');
    setSession(body.user as AuthUser, body.token as string);
    toast.success(`Bem-vindo(a), ${body.user.nome.split(' ')[0]}!`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSemStok(false);
    try {
      // Com e-mail, a identidade é a SEVLA: entra uma vez e abre o Stok Aí com o token dele.
      // Matrícula (ou a SEVLA indisponível) segue pelo caminho de sempre.
      if (matricula.includes('@')) {
        try {
          const sevla = await entrarNaSevla(matricula.trim(), senha);
          const emitida = await sessaoDoProduto(sevla.token, 'stok');
          if (emitida.produto !== 'stok') throw new Error('Resposta inesperada.');
          setSession(emitida.user as AuthUser, emitida.token);
          toast.success(`Bem-vindo(a), ${emitida.user.nome.split(' ')[0]}!`);
          return;
        } catch (err) {
          if (!deveCairNoLoginAntigo(err)) {
            // A conta existe e a senha está certa — só não tem o Stok Aí.
            setSemStok(true);
            return;
          }
        }
      }
      await entrarPeloStok();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[#050b18] lg:grid-cols-[1.15fr_1fr]">
      {/* ---- Esquerda: a marca ---- */}
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        {/* grade técnica */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 15%, rgba(255,138,36,0.32), transparent 42%), radial-gradient(circle at 90% 85%, rgba(34,197,94,0.12), transparent 45%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 grain" />

        {/* a faixa diagonal, assinatura do sistema */}
        <Stripes className="absolute -right-10 top-0 h-full w-16 -skew-x-[14deg] opacity-90" color="rgba(255,138,36,0.85)" />
        <Stripes className="absolute -right-10 top-0 h-full w-16 -skew-x-[14deg] opacity-90 mix-blend-multiply" color="rgba(5,11,24,0.9)" />

        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative z-10">
          <Link href={ROTAS.home} className="inline-flex rounded-lg" aria-label="Stok Aí — voltar para o site">
            <LogoProduto height={40} fundo="escuro" />
          </Link>
        </motion.div>

        <div className="relative z-10 max-w-lg">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-[#ff8a24]"
          >
            Controle de estoque por depósito
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-3 text-5xl font-extrabold leading-[1.05] tracking-tight text-white"
          >
            Sua operação,
            <br />
            no controle.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.26 }}
            className="mt-5 max-w-md text-sm leading-relaxed text-slate-400"
          >
            {PRODUTO.descricao}
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.36 }} className="mt-10 flex gap-8">
            {metrics.map((m) => (
              <div key={m.label} className="border-l border-white/10 pl-4">
                <p className="text-2xl font-extrabold text-white">{m.value}</p>
                <p className="mt-1 max-w-[9rem] text-[11px] leading-tight text-slate-500">{m.label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.5 }} className="relative z-10 font-mono text-[11px] tracking-wide text-slate-600">
          {PRODUTO.nome} · {PRODUTO.slogan}
        </motion.p>
      </div>

      {/* ---- Direita: o formulário ---- */}
      <div className="relative flex items-center justify-center bg-[var(--surface)] p-6 sm:p-10">
        <Stripes className="absolute inset-x-0 top-0 h-1.5 lg:hidden" color="rgba(255,138,36,0.9)" />
        <Link
          href={ROTAS.home}
          className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] sm:left-8 sm:top-8"
        >
          <ArrowLeft size={14} /> Voltar para o site
        </Link>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="w-full max-w-sm">
          <div className="mb-8 flex lg:hidden">
            <LogoProduto height={36} fundo="auto" />
          </div>

          {modo === 'criar' && <CriarConta />}
          {modo === 'esqueci' && <EsqueciSenha />}
          {modo === 'redefinir' && <RedefinirSenha />}
          {modo === 'entrar' && (
            <>
              <h2 className="font-display text-3xl font-bold text-[var(--text)]">Acessar painel</h2>
              <p className="mt-1.5 text-sm text-[var(--text-muted)]">Entre com sua matrícula ou e-mail cadastrado.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div className="relative">
                  <User size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
                  <Input label="Matrícula ou e-mail" required value={matricula} onChange={(e) => setMatricula(e.target.value)} className="pl-9" autoFocus />
                </div>
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute left-3 top-[38px] text-[var(--text-muted)]" />
                  <Input label="Senha" required type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="pl-9" autoComplete="current-password" />
                </div>
                <div className="-mt-1 text-right">
                  <Link href={ROTAS.esqueciSenha} className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--brand)] hover:underline">
                    Esqueci minha senha
                  </Link>
                </div>
                <Button type="submit" fullWidth size="lg" loading={loading} icon={!loading ? <ArrowRight size={16} /> : undefined}>
                  Entrar
                </Button>
              </form>
              {semStok && (
                <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                  <p className="font-bold">Sua conta SEVLA ainda não tem o Stok Aí.</p>
                  <p className="mt-1">A conta existe (talvez pelo Atende Aí), mas nenhuma empresa sua usa o Stok Aí. Conheça os planos ou peça acesso ao administrador da sua empresa.</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
                    <a href="/#planos" className="text-[var(--brand)] hover:underline">
                      Conhecer os planos
                    </a>
                    <a href="/cloud/conta" className="text-[var(--brand)] hover:underline">
                      Ver minha SEVLA
                    </a>
                  </div>
                </div>
              )}

              <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
                Sua empresa ainda não usa o sistema?{' '}
                <Link href={ROTAS.criarConta} className="font-semibold text-[var(--brand)] hover:underline">
                  Criar conta
                </Link>
              </p>

              <div className="mt-10 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                <span className="h-px flex-1 bg-[var(--border)]" />
                <span className="font-mono">acesso restrito</span>
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <LinhaSevla origem="login-stok" className="mt-4 text-center" />
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
