import { useState } from 'react';
import { toast } from 'sonner';
import { Check, CreditCard, ExternalLink, QrCode, Receipt } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { DEFINICOES, PLANOS, CICLOS, NOME_DO_CICLO, MESES_GRATIS_NO_ANUAL, formatarPreco, precoDo, type Ciclo, type Metodo, type Plano } from '@/shared/planos';
import { FormularioCartao } from './FormularioCartao';
import { FormularioPagador, PagamentoPendente, type PedidoAvulso } from './PagamentoAvulso';

interface EscolherPlanoProps {
  /** O plano em vigor, para marcar "atual" e desabilitar. */
  atual?: Plano | null;
  /** Já existe assinatura: o botão troca em vez de assinar. */
  trocar?: boolean;
  /** Que ciclos têm caminho de pagamento hoje (vem do servidor). */
  disponivel?: Partial<Record<Ciclo, boolean>>;
  /** Plano de R$ 0,50 no lugar do Essencial mensal (só em teste). */
  modoTeste?: boolean;
  /** Chave pública do Mercado Pago: com ela o cartão é digitado aqui; sem, vai ao checkout do MP. */
  publicKey?: string | null;
  /** E-mail do administrador, sugerido para o recibo. */
  emailInicial?: string;
  /** Pix e boleto (pagamento do período, renovação manual) estão configurados no servidor? */
  avulsoDisponivel?: boolean;
  compacto?: boolean;
  /** Assinou ou pagou aqui mesmo — quem chama recarrega. */
  onAssinou?: () => void;
}

const METODOS_DA_TELA: Array<{ id: Metodo; nome: string; icone: React.ReactNode; dica: string }> = [
  { id: 'cartao', nome: 'Cartão de crédito', icone: <CreditCard size={13} />, dica: 'Cobrança automática a cada período. Cancele quando quiser.' },
  { id: 'pix', nome: 'Pix', icone: <QrCode size={13} />, dica: 'Paga o período de uma vez; a conta libera em segundos. Renovação manual, com aviso antes de vencer.' },
  { id: 'boleto', nome: 'Boleto', icone: <Receipt size={13} />, dica: 'Paga o período de uma vez; compensa em até 2 dias úteis. Renovação manual, com aviso antes de vencer.' },
];

/**
 * Os três planos com o ciclo (mensal/anual). Com a chave pública do MP, o
 * segundo passo é o cartão dentro do site; sem ela, o servidor devolve a
 * URL do checkout do MP e a pessoa vai para lá.
 */
export function EscolherPlano({ atual = null, trocar = false, disponivel = { mensal: true, anual: true }, modoTeste = false, publicKey = null, emailInicial = '', avulsoDisponivel = false, compacto = false, onAssinou }: EscolherPlanoProps) {
  const [ciclo, setCiclo] = useState<Ciclo>('mensal');
  const [metodo, setMetodo] = useState<Metodo>('cartao');
  const [indo, setIndo] = useState<Plano | null>(null);
  const [escolhido, setEscolhido] = useState<Plano | null>(null);
  const [pedido, setPedido] = useState<PedidoAvulso | null>(null);

  const valorDe = (p: Plano) => (modoTeste && p === 'essencial' && ciclo === 'mensal' ? 0.5 : precoDo(p, ciclo));
  const metodos = METODOS_DA_TELA.filter((m) => m.id === 'cartao' || avulsoDisponivel);
  const metodoAtual = METODOS_DA_TELA.find((m) => m.id === metodo) ?? METODOS_DA_TELA[0];

  /** Sem chave pública: o checkout hospedado do MP. */
  async function irAoCheckout(plano: Plano) {
    setIndo(plano);
    try {
      track('assinatura_iniciar', { plano, ciclo, trocar, onde: 'mp' });
      const r = await api.post<{ url: string }>('/api/assinatura', { plano, ciclo, trocar });
      window.location.href = r.url;
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível abrir o pagamento.');
      setIndo(null);
    }
  }

  function escolher(plano: Plano) {
    if (metodo === 'cartao' && !publicKey) return irAoCheckout(plano);
    track('assinatura_iniciar', { plano, ciclo, trocar, onde: 'site', metodo });
    setEscolhido(plano);
  }

  /** Com chave pública: o token do cartão vai ao servidor e a assinatura nasce autorizada. */
  async function assinarComCartao(plano: Plano, dados: { cardTokenId: string; email: string }) {
    const r = await api.post<{ autorizada?: boolean; url?: string }>('/api/assinatura', { plano, ciclo, trocar, card_token_id: dados.cardTokenId, payer_email: dados.email });
    if (r.autorizada) {
      track('assinatura_confirmada', { plano, onde: 'site' });
      toast.success(`Assinatura do ${DEFINICOES[plano].nome} ativa.`);
      onAssinou?.();
      return;
    }
    // O MP aceitou mas ainda não autorizou (raro): segue para o checkout dele, se houver.
    if (r.url) window.location.href = r.url;
    else throw new Error('O Mercado Pago ainda não autorizou o pagamento. Tente de novo em instantes.');
  }

  if (pedido) {
    return (
      <PagamentoPendente
        pedido={pedido}
        onAprovado={() => {
          toast.success('Pagamento confirmado. Plano liberado.');
          onAssinou?.();
        }}
        onGerarOutro={() => setPedido(null)}
      />
    );
  }

  if (escolhido) {
    const d = DEFINICOES[escolhido];
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[var(--brand)]/40 bg-[var(--brand)]/5 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-[var(--text)]">
              {metodo === 'cartao' ? (trocar ? 'Mudar para' : 'Assinar') : 'Pagar'} {d.nome} · {NOME_DO_CICLO[ciclo].toLowerCase()} · {metodoAtual.nome}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">{d.publico}</p>
          </div>
          <p className="text-lg font-extrabold text-[var(--text)]">
            {formatarPreco(valorDe(escolhido))}
            <span className="text-xs font-normal text-[var(--text-muted)]">/{ciclo === 'anual' ? 'ano' : 'mês'}</span>
          </p>
        </div>
        {metodo === 'cartao' ? (
          <FormularioCartao
            publicKey={publicKey as string}
            emailInicial={emailInicial}
            rotuloDoBotao={`Assinar por ${formatarPreco(valorDe(escolhido))}`}
            onToken={(dados) => assinarComCartao(escolhido, dados)}
            onCancelar={() => setEscolhido(null)}
          />
        ) : (
          <FormularioPagador metodo={metodo} plano={escolhido} ciclo={ciclo} valor={valorDe(escolhido)} emailInicial={emailInicial} onGerado={setPedido} onCancelar={() => setEscolhido(null)} />
        )}
      </div>
    );
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
        {metodos.length > 1 && (
          <div className="inline-flex rounded-lg bg-[var(--bg-2)] p-1 text-xs font-bold">
            {metodos.map((m) => (
              <button key={m.id} type="button" onClick={() => setMetodo(m.id)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${metodo === m.id ? 'bg-[var(--surface)] text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)]'}`}>
                {m.icone} {m.nome}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">{metodoAtual.dica}{metodo === 'cartao' && !publicKey ? ' Você conclui no site do Mercado Pago e volta.' : ''}</p>

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
                <span className="text-2xl font-extrabold tracking-tight">{formatarPreco(valorDe(p))}</span>
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
                <Button
                  fullWidth
                  size="sm"
                  variant={destaque ? 'primary' : 'outline'}
                  disabled={(eAtual && metodo === 'cartao') || disponivel[ciclo] === false}
                  loading={indo === p}
                  onClick={() => escolher(p)}
                  icon={indo === p ? undefined : metodo === 'cartao' ? (publicKey ? <CreditCard size={13} /> : <ExternalLink size={13} />) : metodoAtual.icone}
                >
                  {eAtual && metodo === 'cartao' ? 'Plano atual' : metodo !== 'cartao' ? `Pagar ${d.nome}` : trocar ? `Mudar para ${d.nome}` : `Assinar ${d.nome}`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
