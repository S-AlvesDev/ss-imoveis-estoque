import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Clock, CreditCard, Mail, RefreshCw, ShieldAlert, Sparkles, XCircle } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { BASE_DE_TODO_PLANO, DEFINICOES_ATENDE, NOME_DO_CICLO_ATENDE, NOME_DO_PLANO_ATENDE, PLANOS_ATENDE, definicaoAtende, ehCicloAtende, ehPlanoAtende, precoFormatado, type CicloAtende, type PlanoAtende } from '../../shared/planos';
import { ATENDE } from '../../shared/produto';
import { linkWhatsApp } from '@/shared/produto';
import type { SituacaoDaAssinatura } from '../../shared/tipos';

/**
 * O plano da empresa (administrador): a situação de hoje, o uso frente aos
 * limites, os três planos e o pedido. O Atende Aí ainda não cobra pelo
 * gateway — o pedido fica registrado, a equipe da SEVLA combina o
 * pagamento e ativa o plano. Nada aqui promete cobrança automática.
 */

/** A escolha feita na vitrine (/atende/planos) antes de entrar ou criar a conta. */
export const CHAVE_DO_PLANO_ESCOLHIDO = 'atende-plano-escolhido';

export function lerPlanoEscolhido(): { plano: PlanoAtende; ciclo: CicloAtende } | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_DO_PLANO_ESCOLHIDO);
    if (!bruto) return null;
    const e = JSON.parse(bruto);
    return ehPlanoAtende(e?.plano) ? { plano: e.plano, ciclo: ehCicloAtende(e?.ciclo) ? e.ciclo : 'mensal' } : null;
  } catch {
    return null;
  }
}

export function guardarPlanoEscolhido(plano: PlanoAtende, ciclo: CicloAtende) {
  try {
    sessionStorage.setItem(CHAVE_DO_PLANO_ESCOLHIDO, JSON.stringify({ plano, ciclo }));
  } catch {
    /* sem storage: a pessoa escolhe de novo na tela */
  }
}

function esquecerPlanoEscolhido() {
  try {
    sessionStorage.removeItem(CHAVE_DO_PLANO_ESCOLHIDO);
  } catch {
    /* nada */
  }
}

const dataCurta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : null);

export function Plano() {
  const aplicar = useDadosAtende((s) => s.aplicar);
  const [dados, setDados] = useState<SituacaoDaAssinatura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido] = useState(() => lerPlanoEscolhido());
  const [ciclo, setCiclo] = useState<CicloAtende>(escolhido?.ciclo ?? 'mensal');
  const [pedindo, setPedindo] = useState<PlanoAtende | null>(null);

  const [sincronizando, setSincronizando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  function receber(d: SituacaoDaAssinatura) {
    setDados(d);
    aplicar({ conta: d.conta });
  }

  useEffect(() => {
    // Voltou do checkout do Mercado Pago (`?retorno=1&preapproval_id=…`): confere lá e aplica, antes de mostrar.
    const q = new URLSearchParams(window.location.search);
    const retorno = q.get('retorno') === '1';
    const preapprovalId = q.get('preapproval_id');
    if (retorno) window.history.replaceState(null, '', window.location.pathname);
    const pedido = retorno ? api.post<SituacaoDaAssinatura & { casou: boolean; motivo: string | null }>('/assinatura/sincronizar', { preapproval_id: preapprovalId }) : api.get<SituacaoDaAssinatura>('/assinatura');
    pedido
      .then((d) => {
        receber(d);
        if (retorno) {
          if ('casou' in d && d.casou && d.conta.situacao === 'assinada') {
            esquecerPlanoEscolhido();
            toast.success(`Assinatura confirmada: plano ${NOME_DO_PLANO_ATENDE[d.conta.plano]}.`);
          } else toast.info('O Mercado Pago ainda está processando. Se você concluiu o pagamento, clique em "Já paguei" em instantes.');
        }
      })
      .catch((e) => setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar o plano.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Com o Mercado Pago ligado, vai para o checkout dele; sem, registra o pedido para a equipe. */
  async function pedir(plano: PlanoAtende, trocar = false) {
    if (trocar && !window.confirm(`Trocar para o plano ${NOME_DO_PLANO_ATENDE[plano]} (${NOME_DO_CICLO_ATENDE[ciclo].toLowerCase()})? A assinatura atual é cancelada e você paga a nova no Mercado Pago.`)) return;
    setPedindo(plano);
    try {
      const d = await api.post<SituacaoDaAssinatura | { url: string }>('/assinatura', { plano, ciclo, trocar });
      if ('url' in d) {
        esquecerPlanoEscolhido();
        window.location.href = d.url;
        return;
      }
      receber(d);
      esquecerPlanoEscolhido();
      toast.success(`Pedido do plano ${NOME_DO_PLANO_ATENDE[plano]} registrado. A equipe entra em contato por e-mail.`);
    } catch (e) {
      toast.error(e instanceof ErroDaApi ? e.message : 'Não foi possível registrar o pedido.');
    } finally {
      setPedindo(null);
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      const d = await api.post<SituacaoDaAssinatura & { casou: boolean; motivo: string | null }>('/assinatura/sincronizar', {});
      receber(d);
      if (d.casou) toast.success('Assinatura encontrada e aplicada.');
      else toast.info(d.motivo ? `Ainda nada: ${d.motivo}.` : 'Ainda nada por lá.');
    } catch (e) {
      toast.error(e instanceof ErroDaApi ? e.message : 'Não foi possível conferir.');
    } finally {
      setSincronizando(false);
    }
  }

  async function cancelar() {
    if (!window.confirm('Cancelar a assinatura? O plano continua valendo até o fim do período já pago; depois o atendimento pausa.')) return;
    setCancelando(true);
    try {
      receber(await api.post<SituacaoDaAssinatura>('/assinatura/cancelar'));
      toast.success('Assinatura cancelada. O plano vale até o fim do período pago.');
    } catch (e) {
      toast.error(e instanceof ErroDaApi ? e.message : 'Não foi possível cancelar.');
    } finally {
      setCancelando(false);
    }
  }

  if (erro) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Plano</h1>
        <p className="mt-3 text-sm text-rose-600">{erro}</p>
      </div>
    );
  }
  if (!dados) return <p className="text-sm text-[var(--text-muted)]">Carregando o plano…</p>;

  const { conta, assinatura, uso, pagamento_online: online } = dados;
  const pendente = assinatura?.status === 'pendente' ? assinatura : null;
  const emVigor = assinatura && (assinatura.status === 'autorizada' || assinatura.status === 'pausada') ? assinatura : null;
  const def = definicaoAtende(conta.plano);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Plano</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">O que a empresa tem hoje no {ATENDE.nome}, e os planos para continuar.</p>
      </div>

      {/* ---- Hoje */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Situação</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-extrabold text-[var(--text)]">
              <SituacaoIcone situacao={conta.situacao} />
              {rotuloDaSituacao(conta, emVigor?.ciclo ?? null)}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{explicacaoDaSituacao(conta)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:text-right">
            <Uso rotulo="Pessoas na equipe" atual={uso.atendentes} max={def.limites.atendentes} />
            <Uso rotulo="Setores" atual={uso.times} max={def.limites.times} />
          </div>
        </div>
        {pendente && !online && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/[0.06] p-4 text-sm">
            <Mail size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" />
            <div>
              <p className="font-semibold text-[var(--text)]">
                Pedido registrado: plano {NOME_DO_PLANO_ATENDE[pendente.plano]}, {NOME_DO_CICLO_ATENDE[pendente.ciclo].toLowerCase()} · {pendente.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês
              </p>
              <p className="mt-0.5 text-[var(--text-muted)]">
                Feito em {dataCurta(pendente.created_at)}. A equipe da SEVLA INFINITY combina o pagamento por e-mail ({pendente.payer_email}) e ativa o plano. Quer mudar? Escolha outro abaixo — o pedido anterior é substituído.
              </p>
            </div>
          </div>
        )}
        {pendente && online && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--text)]">Checkout do plano {NOME_DO_PLANO_ATENDE[pendente.plano]} ({NOME_DO_CICLO_ATENDE[pendente.ciclo].toLowerCase()}) iniciado em {dataCurta(pendente.created_at)}, ainda sem confirmação do Mercado Pago.</p>
              <p className="mt-0.5 text-[var(--text-muted)]">Se você concluiu o pagamento, confira aqui; se não, escolha o plano de novo abaixo.</p>
            </div>
            <Button variant="outline" size="sm" loading={sincronizando} icon={<RefreshCw size={14} />} onClick={sincronizar}>
              Já paguei
            </Button>
          </div>
        )}
        {emVigor && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--text)]">
                Assinatura {emVigor.status === 'pausada' ? 'pausada' : 'ativa'} no Mercado Pago · {emVigor.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês, {NOME_DO_CICLO_ATENDE[emVigor.ciclo].toLowerCase()}
              </p>
              <p className="mt-0.5 text-[var(--text-muted)]">
                {emVigor.proxima_cobranca ? `Próxima cobrança em ${dataCurta(emVigor.proxima_cobranca)}.` : 'Sem próxima cobrança agendada.'} Cobrança no cartão, em {emVigor.payer_email}.
              </p>
            </div>
            <Button variant="ghost" size="sm" loading={cancelando} icon={<XCircle size={14} />} onClick={cancelar}>
              Cancelar assinatura
            </Button>
          </div>
        )}
      </Card>

      {/* ---- Os planos */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-[var(--text)]">Os planos</h2>
          <p className="text-sm text-[var(--text-muted)]">No anual, dois meses de desconto. Preços por mês.</p>
        </div>
        <div role="tablist" className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-1 text-sm font-semibold">
          {(['mensal', 'anual'] as const).map((c) => (
            <button key={c} type="button" role="tab" aria-selected={ciclo === c} onClick={() => setCiclo(c)} className={`rounded-lg px-4 py-1.5 transition-colors ${ciclo === c ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
              {NOME_DO_CICLO_ATENDE[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLANOS_ATENDE.map((id) => {
          const p = DEFINICOES_ATENDE[id];
          const atual = conta.situacao !== 'bloqueada' && conta.plano === id;
          const pedido = pendente?.plano === id && pendente.ciclo === ciclo;
          const sugerido = escolhido?.plano === id && !pendente && !atual;
          return (
            <Card key={id} className={`flex flex-col p-5 ${p.destaque || sugerido ? 'border-[var(--brand)]/50 ring-1 ring-[var(--brand)]/30' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-extrabold text-[var(--text)]">{p.nome}</p>
                {atual && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Seu plano</span>}
                {sugerido && <span className="rounded-full bg-[var(--brand)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--brand)]">Escolhido na vitrine</span>}
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{p.publico}</p>
              <p className="mt-4 text-3xl font-extrabold tracking-tight text-[var(--text)]">
                {precoFormatado(id, ciclo)}
                <span className="text-sm font-medium text-[var(--text-muted)]">/mês</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {p.destaques.map((d) => (
                  <li key={d} className="flex gap-2 text-sm text-[var(--text)]">
                    <Check size={15} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-5" fullWidth variant={p.destaque || sugerido ? 'primary' : 'outline'} loading={pedindo === id} disabled={pedindo !== null || (pedido && !online) || (Boolean(emVigor) && (atual || !online))} icon={<CreditCard size={15} />} onClick={() => pedir(id, Boolean(emVigor))}>
                {emVigor && atual ? 'Plano atual' : emVigor && online ? `Trocar para o ${p.nome}` : pedido && !online ? 'Pedido feito' : online ? `Assinar o ${p.nome}` : `Pedir o ${p.nome}`}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <CardHeader title="Em todos os planos" />
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BASE_DE_TODO_PLANO.map((b) => (
            <li key={b} className="flex gap-2 text-sm text-[var(--text-muted)]">
              <Check size={15} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          {online
            ? 'Pagamento no cartão pelo Mercado Pago, renovado automaticamente a cada período. Cancele quando quiser: o plano vale até o fim do período pago.'
            : 'Como funciona a contratação hoje: você pede o plano aqui, a equipe da SEVLA INFINITY responde por e-mail para combinar o pagamento e ativa o plano na empresa.'}{' '}
          Dúvidas?{' '}
          <a href={linkWhatsApp(`Olá! Tenho uma dúvida sobre os planos do ${ATENDE.nome}.`)} target="_blank" rel="noreferrer" className="font-semibold text-[var(--brand)] hover:underline">
            Fale com a gente no WhatsApp
          </a>
          .
        </p>
      </Card>
    </div>
  );
}

function Uso({ rotulo, atual, max }: { rotulo: string; atual: number; max: number | null }) {
  const estourou = max !== null && atual >= max;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">{rotulo}</p>
      <p className={`mt-1 text-lg font-extrabold ${estourou ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text)]'}`}>
        {atual}
        <span className="text-sm font-medium text-[var(--text-muted)]"> / {max === null ? '∞' : max}</span>
      </p>
    </div>
  );
}

function SituacaoIcone({ situacao }: { situacao: SituacaoDaAssinatura['conta']['situacao'] }) {
  if (situacao === 'assinada') return <Sparkles size={18} className="text-emerald-500" />;
  if (situacao === 'avaliacao') return <Clock size={18} className="text-sky-500" />;
  return <ShieldAlert size={18} className={situacao === 'carencia' ? 'text-amber-500' : 'text-rose-500'} />;
}

export function rotuloDaSituacao(conta: SituacaoDaAssinatura['conta'], ciclo: CicloAtende | null): string {
  switch (conta.situacao) {
    case 'assinada':
      return `Plano ${NOME_DO_PLANO_ATENDE[conta.plano]}${ciclo ? ` · ${NOME_DO_CICLO_ATENDE[ciclo].toLowerCase()}` : ''}`;
    case 'avaliacao':
      return conta.dias_restantes === null ? 'Avaliação' : conta.dias_restantes <= 0 ? 'Avaliação termina hoje' : `Avaliação: ${conta.dias_restantes} ${conta.dias_restantes === 1 ? 'dia' : 'dias'} restantes`;
    case 'carencia':
      return `Plano ${NOME_DO_PLANO_ATENDE[conta.plano]} vencido — em carência`;
    default:
      return 'Sem plano';
  }
}

function explicacaoDaSituacao(conta: SituacaoDaAssinatura['conta']): string {
  switch (conta.situacao) {
    case 'assinada':
      return conta.ate ? `Vale até ${dataCurta(conta.ate)}.` : 'Sem data de término.';
    case 'avaliacao':
      return conta.ate ? `Tudo liberado (como no Empresarial) até ${dataCurta(conta.ate)}. Depois, a empresa precisa de um plano.` : 'Tudo liberado (como no Empresarial). Quando a cobrança começar, a empresa escolhe um plano.';
    case 'carencia':
      return `O plano ainda vale até ${dataCurta(conta.ate)}. Depois disso, o atendimento para até a renovação.`;
    default:
      return 'A avaliação terminou (ou o plano venceu). O atendimento fica pausado até um plano ser ativado.';
  }
}
