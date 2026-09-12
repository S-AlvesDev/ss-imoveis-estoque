import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, CreditCard, Lock, MessageCircle, Receipt, XCircle } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { usePlano } from '@/features/planos/usePlano';
import { EscolherPlano } from '@/features/planos/EscolherPlano';
import { api } from '@/lib/api';
import { formatDateTime } from '@/features/estoque/utils';
import { DEFINICOES, NOME_DO_CICLO, NOME_DO_PLANO, formatarPreco, descreverLimite, type Ciclo, type Conta, type Limite, type Plano, type Recurso } from '@/shared/planos';
import { linkWhatsApp } from '@/shared/produto';
import type { Deposito, Unidade } from '@/shared/types';

interface PlanoSectionProps {
  unidades: Unidade[];
  depositos: Deposito[];
  refetch: () => Promise<void>;
}

interface Assinatura {
  id: string;
  plano: Plano;
  ciclo: Ciclo;
  valor: number;
  status: 'pendente' | 'autorizada' | 'pausada' | 'cancelada';
  proxima_cobranca: string | null;
  autorizada_em: string | null;
  cancelada_em: string | null;
  payer_email: string | null;
}

interface Pagamento {
  id: string;
  status: 'agendado' | 'aprovado' | 'recusado' | 'cancelado' | 'reembolsado' | 'pendente';
  valor: number;
  data: string;
  detalhe: string | null;
}

interface Resumo {
  conta: Conta | null;
  assinatura: Assinatura | null;
  pagamentos: Pagamento[];
  disponivel: Partial<Record<Ciclo, boolean>>;
  modo_teste: boolean;
  avaliacao_dias: number;
}

const RECURSOS_VISIVEIS: Array<{ id: Recurso; nome: string }> = [
  { id: 'transferencia', nome: 'Transferência entre depósitos' },
  { id: 'identidade-visual', nome: 'Logo e cor da empresa' },
  { id: 'exportacoes', nome: 'Auditoria em PDF e exportações' },
  { id: 'alertas-por-email', nome: 'Alertas por e-mail' },
  { id: 'whatsapp', nome: 'Avisos por WhatsApp (em breve)' },
  { id: 'relatorios-automaticos', nome: 'Relatórios automáticos (em breve)' },
];

const BADGE_PAGAMENTO: Record<Pagamento['status'], { variant: 'success' | 'critical' | 'warning' | 'neutral' | 'info'; texto: string }> = {
  aprovado: { variant: 'success', texto: 'Pago' },
  recusado: { variant: 'critical', texto: 'Recusado' },
  pendente: { variant: 'warning', texto: 'Pendente' },
  agendado: { variant: 'info', texto: 'Agendado' },
  cancelado: { variant: 'neutral', texto: 'Cancelado' },
  reembolsado: { variant: 'neutral', texto: 'Reembolsado' },
};

const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

/** Uma barra "x de y" — ou "x, sem limite". */
function Uso({ rotulo, atual, max }: { rotulo: string; atual: number; max: number | null }) {
  const pct = max === null ? 0 : Math.min(100, Math.round((atual / max) * 100));
  const cheio = max !== null && atual >= max;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[var(--text-muted)]">{rotulo}</span>
        <span className={`font-semibold tabular-nums ${cheio ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>
          {atual}
          {max === null ? ' · sem limite' : ` de ${max}`}
        </span>
      </div>
      {max !== null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
          <div className="h-full rounded-full bg-[var(--brand)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/** A linha de situação: assinada até, avaliação até, carência, cortesia. */
function Situacao({ conta, assinatura }: { conta: Conta; assinatura: Assinatura | null }) {
  const ate = conta.ate ? fmtData.format(new Date(conta.ate)) : null;
  if (conta.situacao === 'avaliacao') {
    return <p className="text-xs text-[var(--text-muted)]">{ate ? <>Avaliação gratuita até <strong className="text-[var(--text)]">{ate}</strong> ({conta.dias_restantes} {conta.dias_restantes === 1 ? 'dia' : 'dias'}). Enquanto isso, tudo do Empresarial.</> : 'Conta sem cobrança: tudo do Empresarial liberado.'}</p>;
  }
  if (conta.situacao === 'carencia') {
    return <p className="text-xs font-semibold text-[var(--vermelho)]">Pagamento não aprovado. A conta trava em {ate}: atualize o cartão no Mercado Pago ou assine de novo.</p>;
  }
  if (assinatura?.status === 'autorizada') {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        Assinatura <strong className="text-[var(--text)]">{NOME_DO_CICLO[assinatura.ciclo].toLowerCase()}</strong> de {formatarPreco(Number(assinatura.valor))}
        {assinatura.proxima_cobranca && <> · próxima cobrança {fmtData.format(new Date(assinatura.proxima_cobranca))}</>}
        {assinatura.payer_email && <> · recibos em {assinatura.payer_email}</>}
      </p>
    );
  }
  if (assinatura?.status === 'cancelada' && conta.ate) {
    return <p className="text-xs text-[var(--text-muted)]">Assinatura cancelada. O plano continua até <strong className="text-[var(--text)]">{ate}</strong>; depois a conta trava até assinar de novo.</p>;
  }
  return <p className="text-xs text-[var(--text-muted)]">{ate ? <>Plano válido até <strong className="text-[var(--text)]">{ate}</strong>.</> : 'Plano sem vencimento — cortesia.'}</p>;
}

/**
 * O plano da organização: qual é, quanto do limite está em uso, o que
 * libera — e a assinatura: assinar, trocar, cancelar, ver as cobranças.
 */
export function PlanoSection({ unidades, depositos, refetch }: PlanoSectionProps) {
  const planoAtual = usePlano();
  const d = planoAtual.definicao;
  const conta = planoAtual.conta;

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setResumo(await api.get<Resumo>('/api/assinatura'));
    } catch {
      setResumo(null);
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const assinatura = resumo?.assinatura ?? null;
  const emVigor = assinatura?.status === 'autorizada' || assinatura?.status === 'pausada';
  // Cortesia: plano gravado, sem vencimento, sem assinatura — não tem o que assinar.
  const cortesia = conta.situacao === 'assinada' && conta.ate === null && !emVigor;

  async function cancelar() {
    setCancelando(true);
    try {
      setResumo(await api.post<Resumo>('/api/assinatura/cancelar', {}));
      toast.success('Assinatura cancelada. O plano continua até o fim do período pago.');
      setConfirmarCancelar(false);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível cancelar.');
    } finally {
      setCancelando(false);
    }
  }

  const unidadesAtivas = unidades.filter((u) => u.ativo);
  const maisDepositos = Math.max(0, ...unidadesAtivas.map((u) => depositos.filter((x) => x.unit_id === u.id && x.ativo).length));
  const usos: Array<{ limite: Limite; rotulo: string; atual: number }> = [
    { limite: 'unidades', rotulo: 'Unidades', atual: unidadesAtivas.length },
    { limite: 'depositosPorUnidade', rotulo: 'Depósitos na maior unidade', atual: maisDepositos },
  ];

  const tituloDoPlano = conta.situacao === 'avaliacao' ? 'Avaliação' : NOME_DO_PLANO[planoAtual.plano];
  const subtituloDoPlano = conta.situacao === 'avaliacao' ? `${resumo?.avaliacao_dias ?? 7} dias grátis · tudo do Empresarial` : cortesia ? `${d.publico} · sem cobrança` : `${formatarPreco(d.preco)}/mês · ${d.publico}`;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Plano e assinatura</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">O que a sua conta inclui, quanto do limite já está em uso e a cobrança.</p>
      </div>

      <Card className="p-5">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr_1.2fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]">
                <CreditCard size={18} />
              </span>
              <div>
                <p className="text-lg font-bold leading-tight text-[var(--text)]">{tituloDoPlano}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{subtituloDoPlano}</p>
              </div>
            </div>
            <div className="mt-3">
              <Situacao conta={conta} assinatura={assinatura} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!cortesia && (
                <Button size="sm" onClick={() => setEscolhendo(true)} icon={<CreditCard size={14} />}>
                  {emVigor ? 'Trocar de plano' : conta.situacao === 'avaliacao' ? 'Assinar um plano' : 'Assinar'}
                </Button>
              )}
              {emVigor && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmarCancelar(true)} icon={<XCircle size={14} />}>
                  Cancelar assinatura
                </Button>
              )}
            </div>
            <a href={linkWhatsApp(`Olá! Quero falar sobre o plano do Stok Aí (${tituloDoPlano}).`)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] hover:underline">
              <MessageCircle size={14} /> Falar com a gente
            </a>
          </div>

          <div className="space-y-3">
            {usos.map((u) => (
              <Uso key={u.limite} rotulo={u.rotulo} atual={u.atual} max={planoAtual.limite(u.limite)} />
            ))}
            <p className="text-[11px] text-[var(--text-muted)]">Inclui {descreverLimite('usuarios', planoAtual.limite('usuarios'))} — veja em Usuários.</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(Object.keys(DEFINICOES) as Plano[]).map((p) => (
                <Badge key={p} variant={p === planoAtual.plano ? 'info' : 'neutral'}>
                  {DEFINICOES[p].nome} · {formatarPreco(DEFINICOES[p].preco)}
                </Badge>
              ))}
            </div>
          </div>

          <ul className="grid gap-1.5 text-xs sm:grid-cols-2 lg:grid-cols-1">
            {RECURSOS_VISIVEIS.map((r) => {
              const tem = planoAtual.libera(r.id);
              return (
                <li key={r.id} className={`flex items-center gap-2 ${tem ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                  {tem ? <Check size={14} className="shrink-0 text-[var(--verde)]" /> : <Lock size={13} className="shrink-0" />}
                  {r.nome}
                </li>
              );
            })}
          </ul>
        </div>

        {resumo && resumo.pagamentos.length > 0 && (
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <Receipt size={12} /> Cobranças
            </p>
            <ul className="divide-y divide-[var(--border)]">
              {resumo.pagamentos.slice(0, 12).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <span className="text-[var(--text)]">
                    {formatDateTime(p.data)} · <strong>{formatarPreco(Number(p.valor))}</strong>
                    {p.detalhe && <span className="text-[var(--text-muted)]"> · {p.detalhe}</span>}
                  </span>
                  <Badge variant={BADGE_PAGAMENTO[p.status].variant}>{BADGE_PAGAMENTO[p.status].texto}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Modal open={escolhendo} onClose={() => setEscolhendo(false)} title={emVigor ? 'Trocar de plano' : 'Assinar o Stok Aí'} subtitle={emVigor ? 'A assinatura atual é cancelada e a nova começa no checkout do Mercado Pago. O que já foi pago vale até o fim do período.' : 'Você conclui o pagamento no Mercado Pago e volta para cá com a conta liberada.'} maxWidth="max-w-3xl">
        <EscolherPlano atual={emVigor ? assinatura?.plano : null} trocar={emVigor} disponivel={resumo?.disponivel ?? { mensal: true, anual: true }} modoTeste={resumo?.modo_teste ?? false} />
      </Modal>

      <Modal open={confirmarCancelar} onClose={() => setConfirmarCancelar(false)} title="Cancelar a assinatura?" subtitle="Não há cobrança nova. O plano continua até o fim do período já pago; depois a conta trava até assinar de novo. Nada é apagado.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmarCancelar(false)}>
            Manter
          </Button>
          <Button variant="danger" loading={cancelando} onClick={cancelar}>
            Cancelar assinatura
          </Button>
        </div>
      </Modal>
    </section>
  );
}
