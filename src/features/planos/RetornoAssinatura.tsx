import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { MarcaProduto } from '@/shared/ui/Logo';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { ROTAS, useRouter } from '@/app/router';
import { NOME_DO_PLANO, type Conta } from '@/shared/planos';

type Estado = { fase: 'confirmando' } | { fase: 'ativa'; plano: string } | { fase: 'pendente' } | { fase: 'erro'; mensagem: string };

/**
 * Para onde o Mercado Pago manda a pessoa depois do checkout. Confirmamos a
 * assinatura na hora (sem esperar o webhook) e mostramos o resultado.
 * Se veio sem `preapproval_id`, ou o MP ainda está processando, o webhook
 * termina o serviço em instantes — a pessoa só precisa voltar ao painel.
 */
export function RetornoAssinatura() {
  const navigate = useRouter((s) => s.navigate);
  const [estado, setEstado] = useState<Estado>({ fase: 'confirmando' });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get('preapproval_id');
    if (!id) {
      setEstado({ fase: 'pendente' });
      return;
    }
    api
      .post<{ conta: Conta | null; assinatura: { status: string; plano: string } | null }>('/api/assinatura/sincronizar', { preapproval_id: id })
      .then((r) => {
        if (r.assinatura?.status === 'autorizada') {
          track('assinatura_confirmada', { plano: r.assinatura.plano });
          setEstado({ fase: 'ativa', plano: r.assinatura.plano });
        } else {
          setEstado({ fase: 'pendente' });
        }
      })
      .catch((err: any) => setEstado({ fase: 'erro', mensagem: err.message || 'Não foi possível confirmar.' }));
  }, []);

  function voltar() {
    // Recarrega inteiro: o /api/data precisa ver a conta já liberada.
    window.location.href = ROTAS.home;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
        <MarcaProduto size={48} className="mx-auto rounded-2xl" />
        {estado.fase === 'confirmando' && (
          <>
            <Clock size={28} className="mx-auto mt-6 animate-pulse text-[var(--brand)]" />
            <h1 className="mt-3 text-lg font-bold text-[var(--text)]">Confirmando com o Mercado Pago…</h1>
          </>
        )}
        {estado.fase === 'ativa' && (
          <>
            <CheckCircle2 size={32} className="mx-auto mt-6 text-[var(--verde)]" />
            <h1 className="mt-3 text-lg font-bold text-[var(--text)]">Assinatura ativa</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Plano <strong className="text-[var(--text)]">{NOME_DO_PLANO[estado.plano as keyof typeof NOME_DO_PLANO] ?? estado.plano}</strong>. Obrigado por confiar no Stok Aí.
            </p>
          </>
        )}
        {estado.fase === 'pendente' && (
          <>
            <Clock size={32} className="mx-auto mt-6 text-[var(--brand)]" />
            <h1 className="mt-3 text-lg font-bold text-[var(--text)]">Quase lá</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">O Mercado Pago ainda está confirmando o pagamento. Assim que aprovar, a gente libera a conta sozinho — não precisa fazer nada.</p>
          </>
        )}
        {estado.fase === 'erro' && (
          <>
            <XCircle size={32} className="mx-auto mt-6 text-[var(--vermelho)]" />
            <h1 className="mt-3 text-lg font-bold text-[var(--text)]">Não deu para confirmar agora</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{estado.mensagem} Se o pagamento foi aprovado, a conta é liberada automaticamente em instantes.</p>
          </>
        )}
        {estado.fase !== 'confirmando' && (
          <Button className="mt-6" onClick={voltar} fullWidth>
            Ir para o painel
          </Button>
        )}
        {estado.fase === 'confirmando' && (
          <button type="button" onClick={() => navigate(ROTAS.home)} className="mt-6 text-xs text-[var(--text-muted)] hover:underline">
            Ir para o painel sem esperar
          </button>
        )}
      </div>
    </div>
  );
}
