import { useState } from 'react';
import { toast } from 'sonner';
import { Check, CreditCard, ExternalLink } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { DEFINICOES, PLANOS, CICLOS, NOME_DO_CICLO, MESES_GRATIS_NO_ANUAL, formatarPreco, precoDo, type Ciclo, type Plano } from '@/shared/planos';

interface EscolherPlanoProps {
  /** O plano em vigor, para marcar "atual" e desabilitar. */
  atual?: Plano | null;
  /** Já existe assinatura: o botão troca em vez de assinar. */
  trocar?: boolean;
  /** Que ciclos têm caminho de pagamento hoje (vem do servidor). */
  disponivel?: Partial<Record<Ciclo, boolean>>;
  /** Plano de R$ 0,50 no lugar do Essencial mensal (só em teste). */
  modoTeste?: boolean;
  compacto?: boolean;
}

/**
 * Os três planos com o ciclo (mensal/anual) e o botão que leva ao checkout
 * do Mercado Pago. O servidor decide a URL; aqui só se escolhe e se vai.
 */
export function EscolherPlano({ atual = null, trocar = false, disponivel = { mensal: true, anual: true }, modoTeste = false, compacto = false }: EscolherPlanoProps) {
  const [ciclo, setCiclo] = useState<Ciclo>('mensal');
  const [indo, setIndo] = useState<Plano | null>(null);

  async function assinar(plano: Plano) {
    setIndo(plano);
    try {
      track('assinatura_iniciar', { plano, ciclo, trocar });
      const r = await api.post<{ url: string }>('/api/assinatura', { plano, ciclo, trocar });
      window.location.href = r.url;
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível abrir o pagamento.');
      setIndo(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg bg-[var(--bg-2)] p-1 text-xs font-bold">
          {CICLOS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCiclo(c)}
              disabled={disponivel[c] === false}
              className={`rounded-md px-3 py-1.5 transition-colors disabled:opacity-40 ${ciclo === c ? 'bg-[var(--surface)] text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)]'}`}
            >
              {NOME_DO_CICLO[c]}
              {c === 'anual' && <span className="ml-1 rounded-full bg-[var(--verde)]/15 px-1.5 py-0.5 text-[10px] text-[var(--verde)]">{MESES_GRATIS_NO_ANUAL} meses grátis</span>}
            </button>
          ))}
        </div>
        <p className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <CreditCard size={12} /> Cartão de crédito, pelo Mercado Pago. Cancele quando quiser.
        </p>
      </div>

      <div className={`grid gap-3 ${compacto ? 'sm:grid-cols-3' : 'lg:grid-cols-3'}`}>
        {PLANOS.map((p) => {
          const d = DEFINICOES[p];
          const eAtual = atual === p;
          const destaque = p === 'profissional';
          const teste = modoTeste && p === 'essencial' && ciclo === 'mensal';
          return (
            <div key={p} className={`flex flex-col rounded-xl border p-4 ${destaque ? 'border-[var(--brand)]/60 bg-[var(--brand)]/5' : 'border-[var(--border)]'}`}>
              <p className="text-sm font-bold text-[var(--text)]">{d.nome}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{d.publico}</p>
              <p className="mt-3 flex items-baseline gap-1 text-[var(--text)]">
                <span className="text-2xl font-extrabold tracking-tight">{formatarPreco(teste ? 0.5 : precoDo(p, ciclo))}</span>
                <span className="text-xs text-[var(--text-muted)]">/{ciclo === 'anual' ? 'ano' : 'mês'}</span>
              </p>
              {teste && <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand)]">plano de teste</p>}
              {!compacto && (
                <ul className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
                  {d.destaques.slice(0, 4).map((x) => (
                    <li key={x} className="flex items-start gap-1.5">
                      <Check size={12} className="mt-0.5 shrink-0 text-[var(--verde)]" /> {x}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-4">
                <Button fullWidth size="sm" variant={destaque ? 'primary' : 'outline'} disabled={eAtual || disponivel[ciclo] === false} loading={indo === p} onClick={() => assinar(p)} icon={indo === p ? undefined : <ExternalLink size={13} />}>
                  {eAtual ? 'Plano atual' : trocar ? `Mudar para ${d.nome}` : `Assinar ${d.nome}`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
