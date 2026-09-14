import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock, LogOut, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { MarcaProduto } from '@/shared/ui/Logo';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { ADMIN_ROLES } from '@/shared/constants';
import { linkWhatsApp } from '@/shared/produto';
import type { Conta, Ciclo } from '@/shared/planos';
import { EscolherPlano } from './EscolherPlano';

interface ResumoDaAssinatura {
  organizacao: { nome: string } | null;
  conta: Conta | null;
  disponivel: Partial<Record<Ciclo, boolean>>;
  modo_teste: boolean;
  mp_public_key: string | null;
  meu_email: string | null;
}

/**
 * A tela que substitui o sistema quando a conta está bloqueada: a avaliação
 * terminou, ou o cartão foi recusado além da carência. O administrador
 * escolhe um plano e vai ao checkout; quem não é administrador só vê o
 * recado e a quem pedir.
 */
export function ContaBloqueada({ conta }: { conta: Conta }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const admin = ADMIN_ROLES.includes(user?.role ?? '');
  const [resumo, setResumo] = useState<ResumoDaAssinatura | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  async function jaPaguei() {
    setConfirmando(true);
    try {
      const r = await api.post<{ assinatura: { status: string } | null }>('/api/assinatura/sincronizar', {});
      if (r.assinatura?.status === 'autorizada') window.location.reload();
      else toast.error('Achamos a assinatura, mas o Mercado Pago ainda não a autorizou. Tente de novo em instantes.');
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível confirmar.');
    } finally {
      setConfirmando(false);
    }
  }

  useEffect(() => {
    if (!admin) return;
    api.get<ResumoDaAssinatura>('/api/assinatura').then(setResumo).catch(() => setResumo(null));
  }, [admin]);

  const porQue = conta.plano !== 'avaliacao' ? 'O pagamento da assinatura não foi aprovado e a carência terminou.' : 'Os dias grátis da sua conta terminaram.';
  const nome = resumo?.organizacao?.nome;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <MarcaProduto size={40} className="rounded-xl" />
          <div>
            <p className="text-sm font-bold text-[var(--text)]">{nome ?? 'Sua conta'}</p>
            <p className="text-xs text-[var(--text-muted)]">{user?.nome}</p>
          </div>
          <Button variant="ghost" size="sm" icon={<LogOut size={14} />} onClick={logout} className="ml-auto">
            Sair
          </Button>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)]/12 text-[var(--brand)]">
              <Lock size={18} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-[var(--text)]">Assine para continuar</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {porQue} Nada foi apagado: seus materiais, estoques e histórico estão aqui, esperando. {admin ? 'Escolha um plano e em um minuto está tudo de volta.' : 'Peça ao administrador da empresa para escolher um plano.'}
              </p>
            </div>
          </div>

          {admin && (
            <div className="mt-6">
              <EscolherPlano disponivel={resumo?.disponivel ?? { mensal: true, anual: true }} modoTeste={resumo?.modo_teste ?? false} publicKey={resumo?.mp_public_key ?? null} emailInicial={resumo?.meu_email ?? ''} onAssinou={() => window.location.reload()} />
              <div className="mt-4 text-center">
                <Button variant="ghost" size="sm" loading={confirmando} onClick={jaPaguei} icon={confirmando ? undefined : <RefreshCw size={14} />}>
                  Já paguei — confirmar
                </Button>
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
            Dúvida sobre planos ou pagamento?{' '}
            <a href={linkWhatsApp(`Olá! Minha conta no Stok Aí (${nome ?? ''}) está bloqueada e quero ajuda com a assinatura.`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--brand)] hover:underline">
              <MessageCircle size={12} /> Fale com a gente
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
