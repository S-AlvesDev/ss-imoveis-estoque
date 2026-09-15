import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, CreditCard, Crown, FileText, Lock, Mail, MessageCircle, Receipt, RefreshCw, XCircle } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Input, Select } from '@/shared/ui/Field';
import { useAuth } from '@/store/auth';
import { usePlano } from '@/features/planos/usePlano';
import { EscolherPlano } from '@/features/planos/EscolherPlano';
import { PagamentoPendente, type PedidoAvulso } from '@/features/planos/PagamentoAvulso';
import { baixarReciboPdf } from '@/features/planos/reciboPdf';
import { useMarca } from '@/store/marca';
import { api } from '@/lib/api';
import { formatDateTime } from '@/features/estoque/utils';
import { DEFINICOES, NOME_DO_CICLO, NOME_DO_METODO, NOME_DO_PLANO, formatarPreco, descreverLimite, detalheDoPagamento, type Ciclo, type Conta, type Limite, type Plano, type Recurso } from '@/shared/planos';
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
  metodo: 'cartao' | 'pix' | 'boleto';
  valor: number;
  data: string;
  detalhe: string | null;
  plano: Plano | null;
  ciclo: Ciclo | null;
  periodo_de: string | null;
  periodo_ate: string | null;
  mp_payment_id: string | null;
  mp_authorized_payment_id: string | null;
  pagador: Record<string, unknown> | null;
  nf_status: 'pendente' | 'emitida' | 'erro' | 'cancelada' | null;
  nf_numero: string | null;
  nf_url: string | null;
}

interface Resumo {
  conta: Conta | null;
  assinatura: Assinatura | null;
  pagamentos: Pagamento[];
  disponivel: Partial<Record<Ciclo, boolean>>;
  modo_teste: boolean;
  avaliacao_dias: number;
  mp_public_key: string | null;
  meu_email: string | null;
  pendente_avulso: PedidoAvulso | null;
  avulso_disponivel: boolean;
  nf_configurada: boolean;
  emitente: string;
  ceo: { id: number; nome: string; email: string | null } | null;
  sou_ceo: boolean;
  administradores: Array<{ id: number; nome: string; email: string | null; role: string }>;
}

const RECURSOS_VISIVEIS: Array<{ id: Recurso; nome: string }> = [
  { id: 'transferencia', nome: 'Transferência entre depósitos' },
  { id: 'identidade-visual', nome: 'Logo e cor da empresa' },
  { id: 'exportacoes', nome: 'Auditoria em PDF e exportações' },
  { id: 'alertas-por-email', nome: 'Alertas por e-mail' },
  { id: 'whatsapp', nome: 'Stok Aí no WhatsApp' },
  { id: 'cotacoes', nome: 'Cotações a fornecedores pelo WhatsApp' },
  { id: 'relatorios-automaticos', nome: 'Resumo semanal por e-mail' },
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
    return <p className="text-xs font-semibold text-[var(--vermelho)]">Pagamento não confirmado. A conta trava em {ate}: {conta.renovacao === 'manual' ? 'gere um novo Pix ou boleto' : 'atualize o cartão no Mercado Pago ou assine de novo'}.</p>;
  }
  if (conta.renovacao === 'manual' && ate) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        <strong className="text-[var(--text)]">Pago por Pix/boleto</strong> até <strong className="text-[var(--text)]">{ate}</strong> ({conta.dias_restantes} {conta.dias_restantes === 1 ? 'dia' : 'dias'}). A renovação é manual: pague o próximo período antes de vencer e ele começa onde este termina.
      </p>
    );
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
  const [confirmando, setConfirmando] = useState(false);
  const [verPendente, setVerPendente] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [paraId, setParaId] = useState('');
  const [salvandoTransferencia, setSalvandoTransferencia] = useState(false);
  const logout = useAuth((s) => s.logout);
  const organizacao = useMarca((s) => s.organizacao);
  const [enviandoRecibo, setEnviandoRecibo] = useState<Pagamento | null>(null);
  const [emailDoRecibo, setEmailDoRecibo] = useState('');
  const [mandando, setMandando] = useState(false);

  function abrirEnvio(p: Pagamento) {
    setEnviandoRecibo(p);
    setEmailDoRecibo(String((p.pagador as any)?.email ?? resumo?.meu_email ?? ''));
  }

  async function mandarRecibo() {
    if (!enviandoRecibo) return;
    setMandando(true);
    try {
      const r = await api.post<{ para: string }>(`/api/assinatura/pagamentos/${enviandoRecibo.id}/recibo`, { email: emailDoRecibo });
      toast.success(`Recibo enviado para ${r.para}.`);
      setEnviandoRecibo(null);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível enviar.');
    } finally {
      setMandando(false);
    }
  }

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
  // Só o CEO mexe na cobrança. Enquanto o resumo não chegou, ninguém — evita o botão aparecer e sumir.
  const souCeo = resumo?.sou_ceo ?? false;

  async function transferir() {
    if (!paraId) return toast.error('Escolha para quem vai a titularidade.');
    setSalvandoTransferencia(true);
    try {
      const r = await api.post<{ ceo: { nome: string } }>('/api/assinatura/transferir', { user_id: Number(paraId) });
      toast.success(`${r.ceo.nome} agora é o CEO da conta. Entre de novo para atualizar a sua sessão.`);
      setTransferindo(false);
      setTimeout(logout, 1500);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível transferir.');
    } finally {
      setSalvandoTransferencia(false);
    }
  }
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

  /** Pagou e a conta não liberou (webhook atrasado, pagou pelo link direto): procura no MP e aplica. */
  async function confirmarPagamento() {
    setConfirmando(true);
    try {
      const r = await api.post<Resumo>('/api/assinatura/sincronizar', {});
      setResumo(r);
      toast.success(r.assinatura?.status === 'autorizada' ? 'Assinatura confirmada.' : 'Assinatura encontrada, mas ainda não autorizada pelo Mercado Pago.');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível confirmar.');
    } finally {
      setConfirmando(false);
    }
  }

  const unidadesAtivas = unidades.filter((u) => u.ativo);
  const maisDepositos = Math.max(0, ...unidadesAtivas.map((u) => depositos.filter((x) => x.unit_id === u.id && x.ativo).length));
  const usos: Array<{ limite: Limite; rotulo: string; atual: number }> = [
    { limite: 'unidades', rotulo: 'Unidades', atual: unidadesAtivas.length },
    { limite: 'depositosPorUnidade', rotulo: 'Depósitos na maior unidade', atual: maisDepositos },
  ];

  const tituloDoPlano = conta.situacao === 'avaliacao' ? 'Avaliação' : NOME_DO_PLANO[planoAtual.plano];
  const subtituloDoPlano = conta.situacao === 'avaliacao' ? `${resumo?.avaliacao_dias ?? 7} dias grátis · tudo do Empresarial` : cortesia ? `${d.publico} · sem cobrança` : conta.renovacao === 'manual' ? `${d.publico} · pago por Pix/boleto` : `${formatarPreco(d.preco)}/mês · ${d.publico}`;

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
            {resumo && !souCeo && (
              <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-[var(--text-muted)]">
                <Crown size={13} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                <span>
                  Só o CEO da conta{resumo.ceo ? <> — <strong className="text-[var(--text)]">{resumo.ceo.nome}</strong>{resumo.ceo.email ? ` (${resumo.ceo.email})` : ''}</> : ''} — assina, troca ou cancela o plano.
                </span>
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {!cortesia && souCeo && (
                <Button size="sm" onClick={() => setEscolhendo(true)} icon={<CreditCard size={14} />}>
                  {emVigor ? 'Trocar de plano' : conta.situacao === 'avaliacao' ? 'Assinar um plano' : conta.renovacao === 'manual' ? 'Renovar / mudar' : 'Assinar'}
                </Button>
              )}
              {resumo?.pendente_avulso && souCeo && (
                <Button size="sm" variant="outline" onClick={() => setVerPendente(true)} icon={<Receipt size={14} />}>
                  {resumo.pendente_avulso.metodo === 'pix' ? 'Ver Pix pendente' : 'Ver boleto pendente'}
                </Button>
              )}
              {souCeo && (
                <Button size="sm" variant="ghost" onClick={() => setTransferindo(true)} icon={<Crown size={14} />} title="Passar o cargo de CEO a outro administrador">
                  Transferir titularidade
                </Button>
              )}
              {emVigor && souCeo && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmarCancelar(true)} icon={<XCircle size={14} />}>
                  Cancelar assinatura
                </Button>
              )}
              {!emVigor && !cortesia && souCeo && (
                <Button size="sm" variant="ghost" loading={confirmando} onClick={confirmarPagamento} icon={confirmando ? undefined : <RefreshCw size={14} />} title="Pagou e a conta não liberou? Procura a assinatura no Mercado Pago.">
                  Já paguei
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
                    <span className="text-[var(--text-muted)]"> · {NOME_DO_METODO[p.metodo] ?? p.metodo}</span>
                    {p.periodo_ate && p.status === 'aprovado' && <span className="text-[var(--text-muted)]"> · até {fmtData.format(new Date(p.periodo_ate))}</span>}
                    {p.detalhe && p.status !== 'aprovado' && <span className="text-[var(--text-muted)]"> · {detalheDoPagamento(p.detalhe)}</span>}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {p.status === 'aprovado' && (
                      <button
                        type="button"
                        onClick={() => baixarReciboPdf(p, organizacao?.nome ?? 'sua empresa', resumo?.emitente ?? 'Stok Aí').catch(() => toast.error('Não foi possível gerar o recibo.'))}
                        className="inline-flex items-center gap-1 font-semibold text-[var(--brand)] hover:underline"
                      >
                        <Receipt size={12} /> Recibo
                      </button>
                    )}
                    {p.status === 'aprovado' && (
                      <button type="button" onClick={() => abrirEnvio(p)} className="inline-flex items-center gap-1 font-semibold text-[var(--brand)] hover:underline" title="Enviar o recibo por e-mail">
                        <Mail size={12} /> Enviar
                      </button>
                    )}
                    {p.nf_status === 'emitida' && p.nf_url && (
                      <a href={p.nf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--brand)] hover:underline">
                        <FileText size={12} /> Nota fiscal{p.nf_numero ? ` ${p.nf_numero}` : ''}
                      </a>
                    )}
                    {p.status === 'aprovado' && p.nf_status !== 'emitida' && resumo?.nf_configurada && <span className="text-[11px] text-[var(--text-muted)]">nota fiscal a caminho</span>}
                    <Badge variant={BADGE_PAGAMENTO[p.status].variant}>{BADGE_PAGAMENTO[p.status].texto}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Modal open={escolhendo} onClose={() => setEscolhendo(false)} title={emVigor ? 'Trocar de plano' : 'Assinar o Stok Aí'} subtitle={emVigor ? 'A nova assinatura substitui a atual; o que já foi pago vale até o fim do período.' : resumo?.mp_public_key ? 'Escolha o plano e pague com cartão aqui mesmo. A conta libera na hora.' : 'Você conclui o pagamento no Mercado Pago e volta para cá com a conta liberada.'} maxWidth="max-w-3xl">
        <EscolherPlano
          atual={emVigor ? assinatura?.plano : null}
          trocar={emVigor}
          disponivel={resumo?.disponivel ?? { mensal: true, anual: true }}
          modoTeste={resumo?.modo_teste ?? false}
          publicKey={resumo?.mp_public_key ?? null}
          emailInicial={resumo?.meu_email ?? ''}
          avulsoDisponivel={resumo?.avulso_disponivel ?? false}
          onAssinou={async () => {
            setEscolhendo(false);
            await carregar();
            await refetch();
          }}
        />
      </Modal>

      <Modal open={verPendente && Boolean(resumo?.pendente_avulso)} onClose={() => setVerPendente(false)} title="Pagamento pendente" subtitle="O mesmo Pix/boleto de antes — ainda vale.">
        {resumo?.pendente_avulso && (
          <PagamentoPendente
            pedido={resumo.pendente_avulso}
            onAprovado={async () => {
              toast.success('Pagamento confirmado. Plano liberado.');
              setVerPendente(false);
              await carregar();
              await refetch();
            }}
            onGerarOutro={() => {
              setVerPendente(false);
              setEscolhendo(true);
            }}
          />
        )}
      </Modal>

      <Modal open={enviandoRecibo !== null} onClose={() => setEnviandoRecibo(null)} title="Enviar recibo por e-mail" subtitle={enviandoRecibo ? `${formatarPreco(Number(enviandoRecibo.valor))} · ${formatDateTime(enviandoRecibo.data)}` : undefined}>
        <div className="space-y-4">
          <Input label="Para" required type="email" value={emailDoRecibo} onChange={(e) => setEmailDoRecibo(e.target.value)} placeholder="quem recebe o recibo" autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEnviandoRecibo(null)}>
              Cancelar
            </Button>
            <Button loading={mandando} onClick={mandarRecibo} icon={mandando ? undefined : <Mail size={14} />}>
              Enviar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={transferindo} onClose={() => setTransferindo(false)} title="Transferir a titularidade" subtitle="Quem receber vira o CEO: passa a assinar, trocar e cancelar o plano e a receber recibos e notas. Você continua como administrador.">
        <div className="space-y-4">
          {(resumo?.administradores ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Não há outro administrador ativo. Crie um em Usuários (com e-mail) e volte aqui.</p>
          ) : (
            <Select label="Novo CEO" required value={paraId} onChange={(e) => setParaId(e.target.value)}>
              <option value="">Escolha…</option>
              {(resumo?.administradores ?? []).map((a) => (
                <option key={a.id} value={a.id} disabled={!a.email}>
                  {a.nome}
                  {a.email ? ` — ${a.email}` : ' (sem e-mail: cadastre antes)'}
                </option>
              ))}
            </Select>
          )}
          <p className="text-[11px] text-[var(--text-muted)]">Depois da transferência você precisa entrar de novo. Não dá para desfazer sozinho — só o novo CEO pode devolver.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTransferindo(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={salvandoTransferencia} disabled={!paraId} onClick={transferir} icon={salvandoTransferencia ? undefined : <Crown size={14} />}>
              Transferir
            </Button>
          </div>
        </div>
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
