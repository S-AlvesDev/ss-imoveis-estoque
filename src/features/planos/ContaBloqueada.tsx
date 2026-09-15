import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Lock, LogOut, MessageCircle, RefreshCw, RotateCcw } from 'lucide-react';
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
  avulso_disponivel: boolean;
  ceo: { nome: string; email: string | null } | null;
  sou_ceo: boolean;
}

/**
 * A tela que substitui o sistema quando a conta está bloqueada: a avaliação
 * terminou, o cartão foi recusado além da carência — ou o CEO encerrou a
 * conta, e o que resta é exportar (ou reabrir, se ele mudar de ideia). O administrador
 * escolhe um plano e vai ao checkout; quem não é administrador só vê o
 * recado e a quem pedir.
 */
export function ContaBloqueada({ conta }: { conta: Conta }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const admin = ADMIN_ROLES.includes(user?.role ?? '');
  const [resumo, setResumo] = useState<ResumoDaAssinatura | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);

  /** Encerrada, o que ainda dá para fazer: levar os dados embora. */
  async function baixarTudo() {
    setBaixando(true);
    try {
      const { token } = useAuth.getState();
      for (const tabela of ['materiais', 'movimentacoes', 'emprestimos', 'usuarios', 'fornecedores', 'cotacoes']) {
        const r = await fetch(`/api/exportar/${tabela}.csv`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!r.ok) continue;
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tabela}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      toast.success('Baixando os seis arquivos.');
    } catch {
      toast.error('Não foi possível baixar agora.');
    } finally {
      setBaixando(false);
    }
  }

  async function reabrir() {
    setReabrindo(true);
    try {
      await api.post('/api/assinatura/reabrir', {});
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível reabrir.');
      setReabrindo(false);
    }
  }

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

  const encerrada = conta.situacao === 'encerrada';
  const apagaEm = conta.ate ? new Date(conta.ate).toLocaleDateString('pt-BR') : null;
  const porQue = conta.plano !== 'avaliacao' ? 'O pagamento da assinatura não foi aprovado e a carência terminou.' : 'Os dias grátis da sua conta terminaram.';
  const nome = resumo?.organizacao?.nome;
  // Só o CEO escolhe plano; administradores e operadores veem a quem pedir.
  const souCeo = resumo?.sou_ceo ?? false;
  const quemResolve = resumo?.ceo ? `${resumo.ceo.nome}${resumo.ceo.email ? ` (${resumo.ceo.email})` : ''}` : 'o CEO da conta';

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
              <h1 className="text-xl font-bold text-[var(--text)]">{encerrada ? 'Esta conta foi encerrada' : 'Assine para continuar'}</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {encerrada ? (
                  <>
                    O sistema parou de operar{apagaEm ? <>, e os dados ficam disponíveis para exportação até <strong className="text-[var(--text)]">{apagaEm}</strong></> : ''}. {souCeo ? 'Se foi engano, dá para reabrir a conta abaixo.' : `Fale com ${quemResolve}.`}
                  </>
                ) : (
                  <>
                    {porQue} Nada foi apagado: seus materiais, estoques e histórico estão aqui, esperando. {souCeo ? 'Escolha um plano e em um minuto está tudo de volta.' : `Peça a ${quemResolve} para escolher um plano.`}
                  </>
                )}
              </p>
            </div>
          </div>

          {encerrada && admin && (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" icon={<Download size={14} />} onClick={baixarTudo} loading={baixando}>
                Baixar meus dados (CSV)
              </Button>
              {souCeo && (
                <Button variant="secondary" icon={<RotateCcw size={14} />} loading={reabrindo} onClick={reabrir}>
                  Reabrir a conta
                </Button>
              )}
            </div>
          )}

          {!encerrada && admin && souCeo && (
            <div className="mt-6">
              <EscolherPlano disponivel={resumo?.disponivel ?? { mensal: true, anual: true }} modoTeste={resumo?.modo_teste ?? false} publicKey={resumo?.mp_public_key ?? null} emailInicial={resumo?.meu_email ?? ''} avulsoDisponivel={resumo?.avulso_disponivel ?? false} onAssinou={() => window.location.reload()} />
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
