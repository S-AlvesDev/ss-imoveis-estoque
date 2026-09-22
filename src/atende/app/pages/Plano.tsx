import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Clock, CreditCard, Mail, Receipt, RefreshCw, ShieldAlert, Sparkles, XCircle } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao, CabecalhoDoCartao, Rotulo } from '../ui/Cartao';
import { Etiqueta } from '../ui/Etiqueta';
import { Segmentado } from '../ui/Controles';
import { Entrada } from '../ui/Campo';
import { Pagina } from '../ui/Pagina';
import { Alerta, Erro, Esqueleto, Vazio } from '../ui/Estados';
import { Tabela, type Coluna } from '../ui/Tabela';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { BASE_DE_TODO_PLANO, DEFINICOES_ATENDE, NOME_DO_CICLO_ATENDE, NOME_DO_PLANO_ATENDE, PLANOS_ATENDE, definicaoAtende, ehCicloAtende, ehPlanoAtende, type CicloAtende, type PlanoAtende } from '../../shared/planos';
import { ATENDE } from '../../shared/produto';
import { linkWhatsApp } from '@/shared/produto';
import type { FaturamentoAtende, PagamentoAtende, SituacaoDaAssinatura } from '../../shared/tipos';

/**
 * O plano da empresa (administrador): a situação de hoje, o uso frente aos
 * limites, os três planos e o pedido. Com o Mercado Pago ligado, o pedido
 * vai para o checkout; sem, fica registrado e a equipe da SEVLA combina o
 * pagamento e ativa o plano.
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
const brl = (v: number, moeda = 'BRL') => v.toLocaleString('pt-BR', { style: 'currency', currency: moeda });

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
      <Pagina titulo="Plano" largura="md">
        <Erro mensagem={erro} />
      </Pagina>
    );
  }
  if (!dados) {
    return (
      <Pagina titulo="Plano" descricao={`O que a empresa tem hoje no ${ATENDE.nome}, e os planos para continuar.`} largura="lg">
        <div className="space-y-4">
          <Esqueleto className="h-32 w-full rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-3">
            <Esqueleto className="h-72 rounded-2xl" />
            <Esqueleto className="h-72 rounded-2xl" />
            <Esqueleto className="h-72 rounded-2xl" />
          </div>
        </div>
      </Pagina>
    );
  }

  const { conta, assinatura, uso, pagamento_online: online } = dados;
  const pendente = assinatura?.status === 'pendente' ? assinatura : null;
  const emVigor = assinatura && (assinatura.status === 'autorizada' || assinatura.status === 'pausada') ? assinatura : null;
  const def = definicaoAtende(conta.plano);

  return (
    <Pagina titulo="Plano" descricao={`O que a empresa tem hoje no ${ATENDE.nome}, e os planos para continuar.`} largura="lg">
      <div className="space-y-5">
        {/* ---- Hoje */}
        <Cartao className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <SituacaoIcone situacao={conta.situacao} />
              <div>
                <Rotulo>Situação</Rotulo>
                <p className="mt-1 text-lg font-semibold tracking-tight text-[var(--text)]">{rotuloDaSituacao(conta, emVigor?.ciclo ?? null)}</p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{explicacaoDaSituacao(conta)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:text-right">
              <Uso rotulo="Pessoas na equipe" atual={uso.atendentes} max={def.limites.atendentes} />
              <Uso rotulo="Setores" atual={uso.times} max={def.limites.times} />
            </div>
          </div>
          {pendente && !online && (
            <Alerta tom="ia" icone={<Mail size={16} />} className="mt-4" titulo={`Pedido registrado: plano ${NOME_DO_PLANO_ATENDE[pendente.plano]}, ${NOME_DO_CICLO_ATENDE[pendente.ciclo].toLowerCase()}`}>
              Feito em {dataCurta(pendente.created_at)}. A equipe da SEVLA INFINITY combina o pagamento por e-mail ({pendente.payer_email}) e ativa o plano. Quer mudar? Escolha outro abaixo — o pedido anterior é substituído.
            </Alerta>
          )}
          {pendente && online && (
            <Alerta
              tom="aviso"
              className="mt-4"
              titulo={`Checkout do plano ${NOME_DO_PLANO_ATENDE[pendente.plano]} (${NOME_DO_CICLO_ATENDE[pendente.ciclo].toLowerCase()}) iniciado em ${dataCurta(pendente.created_at)}, ainda sem confirmação do Mercado Pago.`}
              acao={
                <Botao variante="secundaria" tamanho="sm" carregando={sincronizando} icone={<RefreshCw size={14} />} onClick={sincronizar}>
                  Já paguei
                </Botao>
              }
            >
              Se você concluiu o pagamento, confira aqui; se não, escolha o plano de novo abaixo.
            </Alerta>
          )}
          {emVigor && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-semibold text-[var(--text)]">
                  Assinatura {emVigor.status === 'pausada' ? 'pausada' : 'ativa'} no Mercado Pago
                  <Etiqueta tom={emVigor.status === 'pausada' ? 'ambar' : 'verde'} ponto>
                    {NOME_DO_CICLO_ATENDE[emVigor.ciclo].toLowerCase()}
                  </Etiqueta>
                  {emVigor.combo && <Etiqueta tom="roxo">combo SEVLA</Etiqueta>}
                </p>
                <p className="mt-0.5 text-[var(--text-muted)]">
                  {emVigor.proxima_cobranca ? `Próxima cobrança em ${dataCurta(emVigor.proxima_cobranca)}.` : 'Sem próxima cobrança agendada.'} Cobrança no cartão, em {emVigor.payer_email}.
                </p>
              </div>
              <Botao variante="fantasma" tamanho="sm" carregando={cancelando} icone={<XCircle size={14} />} onClick={cancelar}>
                Cancelar assinatura
              </Botao>
            </div>
          )}
        </Cartao>

        {/* ---- Os planos */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">Os planos</h2>
            <p className="text-xs text-[var(--text-muted)]">O que cada plano inclui.</p>
          </div>
          <Segmentado valor={ciclo} onChange={setCiclo} opcoes={(['mensal', 'anual'] as const).map((c) => ({ valor: c, rotulo: NOME_DO_CICLO_ATENDE[c] }))} aria-label="Ciclo" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLANOS_ATENDE.map((id) => {
            const p = DEFINICOES_ATENDE[id];
            const atual = conta.situacao !== 'bloqueada' && conta.plano === id;
            const pedido = pendente?.plano === id && pendente.ciclo === ciclo;
            const sugerido = escolhido?.plano === id && !pendente && !atual;
            const destaque = p.destaque || sugerido;
            return (
              <Cartao key={id} className={`relative flex flex-col p-5 ${destaque ? 'border-[var(--brand)]/40 ring-1 ring-[var(--brand)]/20' : ''}`}>
                {destaque && !atual && <span className="absolute -top-2.5 left-5 rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{sugerido ? 'Escolhido na vitrine' : 'Mais escolhido'}</span>}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-semibold text-[var(--text)]">{p.nome}</p>
                  {atual && <Etiqueta tom="verde" ponto>Seu plano</Etiqueta>}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{p.publico}</p>
                <ul className="mt-4 flex-1 space-y-2">
                  {p.destaques.map((d) => (
                    <li key={d} className="flex gap-2 text-sm leading-5 text-[var(--text)]">
                      <Check size={15} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
                <Botao className="mt-5" largo variante={destaque ? 'primaria' : 'secundaria'} carregando={pedindo === id} disabled={pedindo !== null || (pedido && !online) || (Boolean(emVigor) && (atual || !online))} icone={<CreditCard size={15} />} onClick={() => pedir(id, Boolean(emVigor))}>
                  {emVigor && atual ? 'Plano atual' : emVigor && online ? `Trocar para o ${p.nome}` : pedido && !online ? 'Pedido feito' : online ? `Assinar o ${p.nome}` : `Pedir o ${p.nome}`}
                </Botao>
              </Cartao>
            );
          })}
        </div>

        {(dados.pagamentos.length > 0 || emVigor) && <Cobrancas pagamentos={dados.pagamentos} />}
        {(online || emVigor || dados.faturamento) && <Faturamento atual={dados.faturamento} aoSalvar={receber} />}

        <Cartao className="p-4 sm:p-5">
          <CabecalhoDoCartao titulo="Em todos os planos" />
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BASE_DE_TODO_PLANO.map((b) => (
              <li key={b} className="flex gap-2 text-sm leading-5 text-[var(--text-muted)]">
                <Check size={15} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
            {online ? 'Pagamento no cartão pelo Mercado Pago, renovado automaticamente a cada período. Cancele quando quiser: o plano vale até o fim do período pago.' : 'Como funciona a contratação hoje: você pede o plano aqui, a equipe da SEVLA INFINITY responde por e-mail para combinar o pagamento e ativa o plano na empresa.'} Dúvidas?{' '}
            <a href={linkWhatsApp(`Olá! Tenho uma dúvida sobre os planos do ${ATENDE.nome}.`)} target="_blank" rel="noreferrer" className="font-semibold text-[var(--brand)] hover:underline">
              Fale com a gente no WhatsApp
            </a>
            .
          </p>
        </Cartao>
      </div>
    </Pagina>
  );
}

function Uso({ rotulo, atual, max }: { rotulo: string; atual: number; max: number | null }) {
  const estourou = max !== null && atual >= max;
  const pct = max === null ? 0 : Math.min(100, (atual / max) * 100);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-left">
      <p className="text-[11px] font-medium text-[var(--text-muted)]">{rotulo}</p>
      <p className={`mt-1 text-lg font-semibold leading-none tabular-nums ${estourou ? 'text-amber-600' : 'text-[var(--text)]'}`}>
        {atual}
        <span className="text-sm font-medium text-[var(--text-muted)]"> / {max === null ? '∞' : max}</span>
      </p>
      {max !== null && (
        <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
          <span className={`block h-full rounded-full ${estourou ? 'bg-amber-500' : 'bg-[var(--brand)]'}`} style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  );
}

function SituacaoIcone({ situacao }: { situacao: SituacaoDaAssinatura['conta']['situacao'] }) {
  const cls = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl';
  if (situacao === 'assinada')
    return (
      <span className={`${cls} bg-emerald-50 text-emerald-600`}>
        <Sparkles size={20} />
      </span>
    );
  if (situacao === 'avaliacao')
    return (
      <span className={`${cls} bg-sky-50 text-sky-600`}>
        <Clock size={20} />
      </span>
    );
  return (
    <span className={`${cls} ${situacao === 'carencia' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
      <ShieldAlert size={20} />
    </span>
  );
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

const NOME_DO_STATUS: Record<PagamentoAtende['status'], string> = { aprovado: 'Aprovado', agendado: 'Agendado', pendente: 'Pendente', recusado: 'Recusado', cancelado: 'Cancelado', reembolsado: 'Reembolsado' };
const TOM_DO_STATUS: Record<PagamentoAtende['status'], 'verde' | 'ambar' | 'vermelho' | 'cinza'> = { aprovado: 'verde', agendado: 'ambar', pendente: 'ambar', recusado: 'vermelho', cancelado: 'vermelho', reembolsado: 'cinza' };

/** As cobranças da assinatura, com recibo e nota fiscal quando existem. */
function Cobrancas({ pagamentos }: { pagamentos: PagamentoAtende[] }) {
  const colunas: Coluna<PagamentoAtende>[] = [
    { chave: 'data', titulo: 'Data', render: (pg) => <span className="whitespace-nowrap text-[var(--text)]">{dataCurta(pg.data)}</span> },
    {
      chave: 'ref',
      titulo: 'Referente a',
      principal: true,
      render: (pg) => (
        <span className="text-[var(--text)]">
          {pg.plano ? `${NOME_DO_PLANO_ATENDE[pg.plano]}${pg.ciclo ? ` (${NOME_DO_CICLO_ATENDE[pg.ciclo].toLowerCase()})` : ''}` : 'Assinatura'}
          {pg.combo ? <Etiqueta tom="roxo" className="ml-1.5">combo</Etiqueta> : null}
          {pg.periodo_de && pg.periodo_ate ? (
            <span className="block text-xs font-normal text-[var(--text-muted)]">
              {dataCurta(pg.periodo_de)} a {dataCurta(pg.periodo_ate)}
            </span>
          ) : null}
        </span>
      ),
    },
    { chave: 'valor', titulo: 'Valor', alinhar: 'direita', render: (pg) => <span className="whitespace-nowrap font-semibold tabular-nums text-[var(--text)]">{brl(pg.valor, pg.moeda || 'BRL')}</span> },
    {
      chave: 'status',
      titulo: 'Situação',
      render: (pg) => (
        <span>
          <Etiqueta tom={TOM_DO_STATUS[pg.status]}>{NOME_DO_STATUS[pg.status]}</Etiqueta>
          {pg.detalhe && pg.status !== 'aprovado' ? <span className="block text-xs text-[var(--text-muted)]">{pg.detalhe}</span> : null}
        </span>
      ),
    },
    {
      chave: 'docs',
      titulo: 'Documentos',
      render: (pg) => (
        <span className="text-xs">
          {pg.status === 'aprovado' ? <span className="text-[var(--text-muted)]">{pg.recibo_enviado_em ? 'Recibo por e-mail' : 'Recibo a caminho'}</span> : null}
          {pg.nf_url ? (
            <a href={pg.nf_url} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-[var(--brand)] hover:underline">
              Nota fiscal{pg.nf_numero ? ` nº ${pg.nf_numero}` : ''}
            </a>
          ) : pg.status === 'aprovado' && pg.nf_status === 'erro' ? (
            <span className="ml-2 text-amber-600">Nota pendente: cadastre os dados de faturamento</span>
          ) : null}
        </span>
      ),
    },
  ];
  return (
    <Cartao className="p-4 sm:p-5">
      <CabecalhoDoCartao icone={<Receipt size={14} />} titulo="Cobranças" descricao="O que o Mercado Pago processou, com recibo e nota." />
      <div className="mt-3">
        <Tabela colunas={colunas} linhas={pagamentos} chave={(pg) => pg.id} compacta vazio={<Vazio compacto icone={<Receipt size={18} />} titulo="Nenhuma cobrança ainda." texto="A primeira aparece aqui quando o Mercado Pago processar." />} />
      </div>
    </Cartao>
  );
}

const FATURAMENTO_VAZIO = { nome: '', doc: '', email: '', cep: '', rua: '', numero: '', bairro: '', cidade: '', uf: '' };

/** Quem aparece no recibo e na nota fiscal: sem isso, o recibo sai em nome de quem assinou e a nota não sai. */
function Faturamento({ atual, aoSalvar }: { atual: FaturamentoAtende | null; aoSalvar: (d: SituacaoDaAssinatura) => void }) {
  const [aberto, setAberto] = useState(!atual);
  const [f, setF] = useState(() => (atual ? { nome: atual.nome, doc: atual.doc, email: atual.email ?? '', cep: atual.endereco?.cep ?? '', rua: atual.endereco?.rua ?? '', numero: atual.endereco?.numero ?? '', bairro: atual.endereco?.bairro ?? '', cidade: atual.endereco?.cidade ?? '', uf: atual.endereco?.uf ?? '' } : FATURAMENTO_VAZIO));
  const [salvando, setSalvando] = useState(false);
  const campo = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const temEndereco = [f.cep, f.rua, f.numero, f.bairro, f.cidade, f.uf].some((x) => x.trim());
      const d = await api.put<SituacaoDaAssinatura>('/assinatura/faturamento', { faturamento: { nome: f.nome, doc: f.doc, email: f.email || null, endereco: temEndereco ? { cep: f.cep, rua: f.rua, numero: f.numero, bairro: f.bairro, cidade: f.cidade, uf: f.uf } : null } });
      aoSalvar(d);
      setAberto(false);
      toast.success('Dados de faturamento salvos.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao className="p-4 sm:p-5">
      <CabecalhoDoCartao
        titulo="Dados de faturamento"
        descricao={atual ? `${atual.nome} · ${atual.tipoDoc} ${atual.doc}${atual.email ? ` · ${atual.email}` : ''}` : 'Sem CPF/CNPJ, o recibo sai em nome de quem assinou e a nota fiscal não é emitida.'}
        acoes={
          !aberto && (
            <Botao type="button" variante="secundaria" tamanho="sm" onClick={() => setAberto(true)}>
              {atual ? 'Editar' : 'Cadastrar'}
            </Botao>
          )
        }
      />
      {aberto && (
        <form onSubmit={salvar} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Entrada rotulo="Nome ou razão social" required value={f.nome} onChange={campo('nome')} maxLength={120} />
            <Entrada rotulo="CPF ou CNPJ" required value={f.doc} onChange={campo('doc')} inputMode="numeric" placeholder="Só números" />
            <Entrada rotulo="E-mail de cobrança (opcional)" type="email" value={f.email} onChange={campo('email')} />
          </div>
          <p className="text-xs text-[var(--text-muted)]">Endereço (opcional; alguns municípios exigem na nota):</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Entrada rotulo="CEP" value={f.cep} onChange={campo('cep')} inputMode="numeric" />
            <Entrada rotulo="Rua" value={f.rua} onChange={campo('rua')} className="sm:col-span-2" />
            <Entrada rotulo="Número" value={f.numero} onChange={campo('numero')} />
            <Entrada rotulo="Bairro" value={f.bairro} onChange={campo('bairro')} />
            <Entrada rotulo="Cidade" value={f.cidade} onChange={campo('cidade')} className="sm:col-span-2" />
            <Entrada rotulo="UF" value={f.uf} onChange={campo('uf')} maxLength={2} />
          </div>
          <div className="flex gap-2">
            <Botao type="submit" tamanho="sm" carregando={salvando}>
              Salvar
            </Botao>
            <Botao type="button" tamanho="sm" variante="fantasma" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}
    </Cartao>
  );
}
