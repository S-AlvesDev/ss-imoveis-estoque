import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, Check, Copy, CreditCard, ExternalLink, Layers, QrCode, RefreshCw, XCircle } from 'lucide-react';
import { PRODUTOS } from './produto';
import { Eyebrow, Revelar, cta } from './ui';
import { NOME_DO_PRODUTO, type ProdutoSevla } from '@/shared/sevla';
import { ErroDaSevlaNoNavegador } from '@/shared/sevlaNavegador';
import { DEFINICOES, PLANOS, NOME_DO_CICLO, precoDo, type Plano, type Ciclo } from '@/shared/planos';
import { DEFINICOES_ATENDE, PLANOS_ATENDE, precoDoPeriodoAtende, type PlanoAtende, type CicloAtende } from '@/atende/shared/planos';

/**
 * As assinaturas dos dois produtos, pela Minha SEVLA: o que cada empresa
 * tem em cada produto, assinar/trocar (cartão pelo checkout do Mercado
 * Pago, Pix ou boleto), cancelar, as últimas cobranças — e os combos: os
 * dois produtos no mesmo plano com desconto em cada um. No cartão são duas
 * assinaturas (uma por produto, cada uma já com o desconto); no Pix/boleto,
 * um pagamento só. Cada produto emite o próprio recibo e nota.
 */

type Metodo = 'cartao' | 'pix' | 'boleto';
type SituacaoDaConta = { situacao: string; plano: string; ate: string | null; dias_restantes: number | null; renovacao: string | null } | null;
interface AssinaturaResumo {
  plano: string;
  ciclo: string;
  valor: number;
  status: string;
  proxima_cobranca: string | null;
  combo?: string | null;
}
interface Pagamento {
  id: string;
  status: string;
  valor: number;
  data: string;
  metodo: string;
  plano: string | null;
  ciclo: string | null;
  vence_em?: string | null;
  nf_url?: string | null;
  nf_numero?: string | null;
  combo?: string | null;
  dados?: { qr_code?: string | null; qr_code_base64?: string | null; ticket_url?: string | null; linha_digitavel?: string | null } | null;
}
/** O Pix/boleto único de um combo: o total, mais a parte de cada produto. */
interface PagamentoCombo extends Pagamento {
  combo: string;
  stok: Pagamento;
  atende: Pagamento;
}
interface Lado {
  acesso: boolean;
  gerencia: boolean;
  papel: string | null;
  conta: SituacaoDaConta;
  assinatura: AssinaturaResumo | null;
  pagamentos: Pagamento[];
  pendente_avulso: Pagamento | null;
  empresa_id?: string;
}
interface Empresa {
  organization_id: string;
  organizacao: string;
  stok: Lado | null;
  atende: Lado | null;
  combo_pendente: PagamentoCombo | null;
}
interface PrecosDoCombo {
  stok: number;
  atende: number;
  total: number;
  cheio: number;
  economia: number;
}
interface Combo {
  id: string;
  nome: string;
  stok: Plano;
  atende: PlanoAtende;
  desconto: number;
  precos: Record<'mensal' | 'anual', PrecosDoCombo | null>;
}
interface Dados {
  empresas: Empresa[];
  pagamento_online: boolean;
  cartao: { stok: Record<string, boolean>; atende: Record<string, boolean> };
  combos: Combo[];
}

async function pedir<T>(token: string, caminho: string, corpo?: unknown): Promise<T> {
  const res = await fetch(`/api/sevla${caminho}`, { method: corpo === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const body = res.headers.get('content-type')?.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ErroDaSevlaNoNavegador(body?.error || `Erro ${res.status}.`, res.status, body?.motivo ?? null);
  return body as T;
}

const brl = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const data = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const NOME_DO_PLANO: Record<string, string> = { essencial: 'Essencial', profissional: 'Profissional', empresarial: 'Empresarial', avaliacao: 'Avaliação' };
const NOME_DA_SITUACAO: Record<string, string> = { assinada: 'Plano ativo', avaliacao: 'Em avaliação', carencia: 'Pagamento pendente', bloqueada: 'Bloqueada', encerrada: 'Encerrada' };
const NOME_DO_STATUS: Record<string, string> = { aprovado: 'Aprovado', agendado: 'Agendado', pendente: 'Pendente', recusado: 'Recusado', cancelado: 'Cancelado', reembolsado: 'Reembolsado' };
const corDaSituacao = (s: string | undefined) => (s === 'assinada' ? 'text-emerald-300' : s === 'avaliacao' ? 'text-sky-300' : s === 'carencia' ? 'text-amber-300' : 'text-rose-300');
const emVigor = (lado: Lado | null) => Boolean(lado?.assinatura && (lado.assinatura.status === 'autorizada' || lado.assinatura.status === 'pausada'));

/** O que se pede num "Assinar": um produto, ou o combo (os dois, com desconto). */
interface Pedido {
  organization_id: string;
  organizacao: string;
  alvo: ProdutoSevla | 'combo';
  planoStok: Plano;
  planoAtende: PlanoAtende;
  combo: string;
  trocar: boolean;
  /** No combo: qual produto já tem assinatura em vigor (será substituída). */
  substitui: ProdutoSevla[];
}

export function Assinaturas({ token }: { token: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [verCombo, setVerCombo] = useState<{ organization_id: string; pagamento: PagamentoCombo } | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  const carregar = () =>
    pedir<Dados>(token, '/assinaturas')
      .then((d) => {
        setDados(d);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar as assinaturas.'));
  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function cancelar(e: Empresa, produto: ProdutoSevla) {
    const outro = produto === 'stok' ? e.atende : e.stok;
    const aviso = e[produto]?.assinatura?.combo && emVigor(outro) && outro?.assinatura?.combo ? ` Como é um combo, o ${NOME_DO_PRODUTO[produto === 'stok' ? 'atende' : 'stok']} volta ao preço normal na renovação seguinte.` : '';
    if (!window.confirm(`Cancelar a assinatura do ${NOME_DO_PRODUTO[produto]} da ${e.organizacao}? O plano vale até o fim do período pago; depois o produto trava.${aviso}`)) return;
    setCancelando(`${e.organization_id}:${produto}`);
    try {
      setDados(await pedir<Dados>(token, '/cancelar', { organization_id: e.organization_id, produto }));
      cta(`assinaturas-cancelar-${produto}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível cancelar.');
    } finally {
      setCancelando(null);
    }
  }

  /** Abre o modal do combo para uma empresa em que a pessoa manda nos dois produtos. */
  function pedirCombo(e: Empresa, combo = 'profissional') {
    const substitui = (['stok', 'atende'] as const).filter((p) => emVigor(e[p]));
    setPedido({ organization_id: e.organization_id, organizacao: e.organizacao, alvo: 'combo', planoStok: 'profissional', planoAtende: 'profissional', combo, trocar: substitui.length > 0, substitui });
  }

  if (erro && !dados) return <p className="mt-10 text-sm text-rose-300">{erro}</p>;
  if (!dados) return <p className="mt-10 text-sm text-[var(--texto-suave)]">Carregando as assinaturas…</p>;
  if (dados.empresas.length === 0) return null;

  const empresasDeCombo = dados.empresas.filter((e) => e.stok?.gerencia && e.atende?.gerencia);
  const desconto = dados.combos[0]?.desconto ?? 5;

  return (
    <section className="mt-14">
      <Revelar>
        <Eyebrow className="mb-3">Assinaturas</Eyebrow>
        <h2 className="text-[clamp(1.5rem,3.5vw,2.25rem)] font-bold leading-[1.1] text-white">Os planos dos seus produtos, num lugar só.</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--texto-suave)]">Assine, troque ou cancele o Stok Aí e o Atende Aí de cada empresa. Cartão pelo Mercado Pago (renovação automática), ou Pix e boleto por período. Cada produto emite o próprio recibo e nota.</p>
      </Revelar>
      {erro && <p className="mt-4 text-sm text-rose-300">{erro}</p>}

      <div className="mt-8 space-y-6">
        {dados.empresas.map((e, i) => (
          <Revelar key={e.organization_id} delay={0.05 * i}>
            <article className="cartao rounded-3xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold text-white">{e.organizacao}</h3>
                {e.stok?.gerencia && e.atende?.gerencia && (
                  <button type="button" onClick={() => pedirCombo(e)} className="inline-flex items-center gap-2 rounded-full border border-[var(--primaria)]/60 px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--primaria)]/10">
                    <Layers size={14} /> Assinar um combo · {desconto}% off
                  </button>
                )}
              </div>
              {e.combo_pendente && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
                  <span>
                    Há um {e.combo_pendente.metodo === 'pix' ? 'Pix' : 'boleto'} do combo de <strong>{brl(e.combo_pendente.valor)}</strong> aguardando pagamento{e.combo_pendente.vence_em ? ` (vale até ${data(e.combo_pendente.vence_em)})` : ''} — um pagamento só para os dois produtos.
                  </span>
                  <button type="button" onClick={() => setVerCombo({ organization_id: e.organization_id, pagamento: e.combo_pendente! })} className="rounded-full border border-amber-300/50 px-3 py-1 font-semibold text-white hover:bg-amber-300/10">
                    Ver o {e.combo_pendente.metodo === 'pix' ? 'Pix' : 'boleto'}
                  </button>
                </div>
              )}
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {(['stok', 'atende'] as const).map((produto) => {
                  const lado = e[produto];
                  const p = PRODUTOS.find((x) => x.id === produto)!;
                  if (!lado) {
                    return (
                      <div key={produto} className="rounded-2xl border border-dashed border-[var(--linha)] p-4 text-sm text-[var(--texto-suave)]">
                        <span className="font-semibold text-white">{p.nome}</span> — esta empresa ainda não usa. {produto === 'atende' ? 'Ative pela seção acima.' : ''}
                      </div>
                    );
                  }
                  const chave = `${e.organization_id}:${produto}`;
                  const vigente = emVigor(lado);
                  return (
                    <div key={produto} className="rounded-2xl border border-[var(--linha)] bg-[var(--fundo)]/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <img src={p.simbolo} alt="" className="h-7 w-7 rounded-lg object-contain" aria-hidden />
                          <span className="font-display text-sm font-bold text-white">{p.nome}</span>
                          {vigente && lado.assinatura?.combo && <span className="rounded-full border border-[var(--primaria)]/50 bg-[var(--primaria)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--primaria-clara)]">combo · −{desconto}%</span>}
                        </div>
                        {lado.conta && (
                          <span className={`text-xs font-semibold ${corDaSituacao(lado.conta.situacao)}`}>
                            {NOME_DA_SITUACAO[lado.conta.situacao] ?? lado.conta.situacao}
                            {lado.conta.situacao === 'assinada' && lado.conta.plano ? ` · ${NOME_DO_PLANO[lado.conta.plano] ?? lado.conta.plano}` : ''}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-[var(--texto-suave)]">
                        {lado.conta?.situacao === 'avaliacao' && lado.conta.dias_restantes !== null ? `Avaliação: ${lado.conta.dias_restantes} dia(s) restante(s).` : lado.conta?.ate ? `Vale até ${data(lado.conta.ate)}${lado.conta.renovacao === 'automatica' ? ' · renovação automática' : lado.conta.renovacao === 'manual' ? ' · renovação manual (Pix/boleto)' : ''}.` : lado.conta?.situacao === 'bloqueada' ? 'Sem plano: o produto está travado até assinar.' : 'Sem prazo definido.'}
                        {vigente && lado.assinatura?.proxima_cobranca ? ` Próxima cobrança em ${data(lado.assinatura.proxima_cobranca)}.` : ''}
                      </p>
                      {lado.pendente_avulso && !lado.pendente_avulso.combo && (
                        <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                          Há um {lado.pendente_avulso.metodo === 'pix' ? 'Pix' : 'boleto'} de {brl(lado.pendente_avulso.valor)} aguardando pagamento{lado.pendente_avulso.vence_em ? ` (vale até ${data(lado.pendente_avulso.vence_em)})` : ''}.
                        </p>
                      )}
                      {lado.gerencia ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => setPedido({ organization_id: e.organization_id, organizacao: e.organizacao, alvo: produto, planoStok: (lado.conta?.plano && lado.conta.plano !== 'avaliacao' ? lado.conta.plano : 'profissional') as Plano, planoAtende: (lado.conta?.plano && lado.conta.plano !== 'avaliacao' ? lado.conta.plano : 'profissional') as PlanoAtende, combo: 'profissional', trocar: vigente, substitui: [] })} className="fundo-gradiente inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white hover:brightness-110">
                            <CreditCard size={14} /> {vigente ? 'Trocar de plano' : lado.conta?.situacao === 'assinada' ? 'Renovar / mudar' : 'Assinar'}
                          </button>
                          {vigente && (
                            <button type="button" onClick={() => cancelar(e, produto)} disabled={cancelando !== null} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-[var(--texto-suave)] hover:bg-white/[0.06] hover:text-white disabled:opacity-50">
                              <XCircle size={14} /> {cancelando === chave ? 'Cancelando…' : 'Cancelar'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-[var(--suave)]">Você é {lado.papel} aqui — a assinatura é de quem {produto === 'stok' ? 'é o titular (CEO)' : 'administra'}.</p>
                      )}
                      {lado.pagamentos.length > 0 && (
                        <ul className="mt-4 divide-y divide-[var(--linha)] border-t border-[var(--linha)] text-xs">
                          {lado.pagamentos.slice(0, 4).map((pg) => (
                            <li key={pg.id} className="flex items-center justify-between gap-3 py-1.5">
                              <span className="text-[var(--texto-suave)]">
                                {data(pg.data)} · {pg.plano ? NOME_DO_PLANO[pg.plano] ?? pg.plano : 'assinatura'}
                                {pg.ciclo ? ` (${pg.ciclo})` : ''} · {pg.metodo}
                                {pg.combo ? ' · combo' : ''}
                              </span>
                              <span className="flex items-center gap-2 whitespace-nowrap">
                                <span className="text-white">{brl(pg.valor)}</span>
                                <span className={pg.status === 'aprovado' ? 'text-emerald-300' : pg.status === 'pendente' || pg.status === 'agendado' ? 'text-amber-300' : 'text-rose-300'}>{NOME_DO_STATUS[pg.status] ?? pg.status}</span>
                                {pg.nf_url && (
                                  <a href={pg.nf_url} target="_blank" rel="noreferrer" className="text-[var(--primaria-clara)] hover:underline">
                                    NF
                                  </a>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          </Revelar>
        ))}
      </div>

      {/* Combos */}
      <Revelar delay={0.1} className="mt-10">
        <Eyebrow className="mb-3">Combos</Eyebrow>
        <p className="text-sm text-[var(--texto-suave)]">
          Stok Aí + Atende Aí no mesmo plano, com <span className="font-semibold text-white">{desconto}% de desconto em cada produto</span>. No cartão são duas assinaturas, uma por produto, cada uma já com o desconto; no Pix ou boleto, um pagamento só. Cada produto emite o próprio recibo e nota.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {dados.combos.map((c) => {
            return (
              <div key={c.id} className="cartao flex flex-col rounded-2xl p-5">
                <p className="font-display text-base font-bold text-white">{c.nome}</p>
                <p className="mt-1 text-xs text-[var(--texto-suave)]">
                  {DEFINICOES[c.stok].nome} no Stok Aí + {DEFINICOES_ATENDE[c.atende].nome} no Atende Aí
                </p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--primaria-clara)]">{desconto}% de desconto em cada produto</p>
                {empresasDeCombo.length > 0 ? (
                  <button type="button" onClick={() => pedirCombo(empresasDeCombo[0], c.id)} className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--primaria)]/60 px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--primaria)]/10">
                    <Layers size={14} /> Assinar {empresasDeCombo.length > 1 ? `na ${empresasDeCombo[0].organizacao}` : 'este combo'}
                  </button>
                ) : (
                  <p className="mt-3 text-[11px] text-[var(--suave)]">Para assinar, é preciso administrar os dois produtos na mesma empresa.</p>
                )}
              </div>
            );
          })}
        </div>
      </Revelar>

      {pedido && <ModalDeAssinatura token={token} dados={dados} pedido={pedido} onFechar={() => setPedido(null)} onMudou={carregar} />}
      {verCombo && (
        <ModalSimples titulo="Pagamento do combo" subtitulo="O mesmo Pix/boleto de antes — ainda vale. Um pagamento só para os dois produtos." onFechar={() => setVerCombo(null)}>
          <PagamentoPendente token={token} caminho={`/combo/${verCombo.organization_id}/${verCombo.pagamento.id}`} inicial={verCombo.pagamento} onAprovado={carregar} />
        </ModalSimples>
      )}
    </section>
  );
}

function ModalSimples({ titulo, subtitulo, onFechar, children }: { titulo: string; subtitulo?: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-[var(--linha)] bg-[var(--fundo-2)] p-5 sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-xl font-bold text-white">{titulo}</h3>
            {subtitulo && <p className="mt-1 text-sm text-[var(--texto-suave)]">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onFechar} className="rounded-lg px-2 py-1 text-sm text-[var(--texto-suave)] hover:bg-white/[0.06] hover:text-white">
            Fechar
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  O modal: plano, ciclo, meio de pagamento — e o resultado (checkout ou Pix/boleto)
// ---------------------------------------------------------------------------

type Resultado = { produto: ProdutoSevla; metodo: 'cartao'; url: string } | { produto: ProdutoSevla; metodo: 'pix' | 'boleto'; pagamento: Pagamento };
type ResultadoDoCombo = { metodo: 'cartao'; combo: string; checkouts: Array<{ produto: ProdutoSevla; url: string }> } | { metodo: 'pix' | 'boleto'; combo: string; pagamento: PagamentoCombo };

function ModalDeAssinatura({ token, dados, pedido, onFechar, onMudou }: { token: string; dados: Dados; pedido: Pedido; onFechar: () => void; onMudou: () => void }) {
  const [ciclo, setCiclo] = useState<'mensal' | 'anual'>('mensal');
  const [metodo, setMetodo] = useState<Metodo>('cartao');
  const [planoStok, setPlanoStok] = useState<Plano>(pedido.planoStok);
  const [planoAtende, setPlanoAtende] = useState<PlanoAtende>(pedido.planoAtende);
  const [comboId, setComboId] = useState(pedido.combo);
  const [pagador, setPagador] = useState({ nome: '', doc: '', email: '', cep: '', rua: '', numero: '', bairro: '', cidade: '', uf: 'RN' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [resultadoDoCombo, setResultadoDoCombo] = useState<ResultadoDoCombo | null>(null);

  const ehCombo = pedido.alvo === 'combo';
  const combo = ehCombo ? (dados.combos.find((c) => c.id === comboId) ?? dados.combos[0]) : null;
  const precosDoCombo = combo?.precos[ciclo] ?? null;
  const produtos: ProdutoSevla[] = ehCombo ? ['stok', 'atende'] : [pedido.alvo as ProdutoSevla];
  const total = ehCombo ? (precosDoCombo?.total ?? 0) : produtos.reduce((s, p) => s + ((p === 'stok' ? precoDo(planoStok, ciclo as Ciclo) : precoDoPeriodoAtende(planoAtende, ciclo as CicloAtende)) ?? 0), 0);
  const precisaPagador = metodo !== 'cartao';

  const corpoDoPagador = () => ({ nome: pagador.nome, tipoDoc: pagador.doc.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF', doc: pagador.doc, email: pagador.email, endereco: metodo === 'boleto' ? { cep: pagador.cep, rua: pagador.rua, numero: pagador.numero, bairro: pagador.bairro, cidade: pagador.cidade, uf: pagador.uf } : null });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    if (ehCombo && combo) {
      try {
        const corpo: Record<string, unknown> = { organization_id: pedido.organization_id, combo: combo.id, ciclo, metodo, trocar: pedido.trocar };
        if (precisaPagador) corpo.pagador = corpoDoPagador();
        setResultadoDoCombo(await pedir<ResultadoDoCombo>(token, '/assinar-combo', corpo));
        cta(`assinaturas-combo-${combo.id}-${metodo}`);
        onMudou();
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Não foi possível iniciar o combo.');
      } finally {
        setEnviando(false);
      }
      return;
    }
    const feitos: Resultado[] = [];
    try {
      for (const produto of produtos) {
        const corpo: Record<string, unknown> = { organization_id: pedido.organization_id, produto, plano: produto === 'stok' ? planoStok : planoAtende, ciclo, metodo, trocar: pedido.trocar };
        if (precisaPagador) corpo.pagador = corpoDoPagador();
        feitos.push(await pedir<Resultado>(token, '/assinar', corpo));
        cta(`assinaturas-assinar-${produto}-${metodo}`);
      }
      setResultados(feitos);
      onMudou();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível iniciar.');
      if (feitos.length) setResultados(feitos);
    } finally {
      setEnviando(false);
    }
  }

  const campo = 'w-full rounded-xl border border-[var(--linha)] bg-[var(--fundo)] px-3 py-2 text-sm text-white placeholder:text-[var(--suave)] focus:border-[var(--primaria)] focus:outline-none';
  const rotulo = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--suave)]';
  const botaoConcluir = (
    <div className="flex justify-end">
      <button type="button" onClick={onFechar} className="rounded-full border border-[var(--linha)] px-4 py-2 text-sm font-semibold text-white hover:bg-white/[0.06]">
        Concluir
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Assinar">
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-[var(--linha)] bg-[var(--fundo-2)] p-5 sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>{ehCombo ? 'Combo' : NOME_DO_PRODUTO[pedido.alvo as ProdutoSevla]}</Eyebrow>
            <h3 className="mt-1 font-display text-xl font-bold text-white">{pedido.trocar ? 'Trocar de plano' : 'Assinar'} · {pedido.organizacao}</h3>
          </div>
          <button type="button" onClick={onFechar} className="rounded-lg px-2 py-1 text-sm text-[var(--texto-suave)] hover:bg-white/[0.06] hover:text-white">
            Fechar
          </button>
        </div>

        {resultadoDoCombo ? (
          <div className="mt-6 space-y-5">
            {resultadoDoCombo.metodo === 'cartao' ? (
              <>
                <div className="rounded-2xl border border-[var(--linha)] bg-[var(--fundo)] p-4 text-sm text-[var(--texto-suave)]">
                  <p>
                    São <span className="font-semibold text-white">duas assinaturas</span> no Mercado Pago, uma por produto, cada uma já com o desconto. Pague as duas: o checkout abre em outra aba e cada assinatura entra sozinha quando o Mercado Pago avisa o sistema.
                  </p>
                  <p className="mt-2 text-xs">O desconto vale enquanto as duas estiverem ativas. Se uma for cancelada — ou não for concluída em 48 horas — a outra volta ao preço normal na renovação seguinte.</p>
                </div>
                {resultadoDoCombo.checkouts.map((c) => (
                  <div key={c.produto} className="rounded-2xl border border-[var(--linha)] bg-[var(--fundo)] p-4">
                    <p className="font-display text-sm font-bold text-white">{NOME_DO_PRODUTO[c.produto]}</p>
                    <a href={c.url} target="_blank" rel="noreferrer" onClick={() => cta(`assinaturas-checkout-combo-${c.produto}`)} className="fundo-gradiente mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110">
                      Pagar o {NOME_DO_PRODUTO[c.produto]} no Mercado Pago <ExternalLink size={14} />
                    </a>
                  </div>
                ))}
              </>
            ) : (
              <div className="rounded-2xl border border-[var(--linha)] bg-[var(--fundo)] p-4">
                <p className="font-display text-sm font-bold text-white">Stok Aí + Atende Aí — um pagamento só</p>
                <p className="mt-1 text-xs text-[var(--texto-suave)]">
                  {brl(resultadoDoCombo.pagamento.stok.valor)} do Stok Aí + {brl(resultadoDoCombo.pagamento.atende.valor)} do Atende Aí. Quando cair, os dois planos entram juntos; cada produto manda o próprio recibo.
                </p>
                <PagamentoPendente token={token} caminho={`/combo/${pedido.organization_id}/${resultadoDoCombo.pagamento.id}`} inicial={resultadoDoCombo.pagamento} onAprovado={onMudou} />
              </div>
            )}
            {erro && <p className="text-sm text-rose-300">{erro}</p>}
            {botaoConcluir}
          </div>
        ) : resultados ? (
          <div className="mt-6 space-y-5">
            {resultados.map((r) => (
              <div key={r.produto} className="rounded-2xl border border-[var(--linha)] bg-[var(--fundo)] p-4">
                <p className="font-display text-sm font-bold text-white">{NOME_DO_PRODUTO[r.produto]}</p>
                {r.metodo === 'cartao' ? (
                  <>
                    <p className="mt-1 text-sm text-[var(--texto-suave)]">O checkout do Mercado Pago abre em outra aba. Pague lá e volte aqui: a assinatura entra sozinha (o Mercado Pago avisa o sistema).</p>
                    <a href={r.url} target="_blank" rel="noreferrer" onClick={() => cta(`assinaturas-checkout-${r.produto}`)} className="fundo-gradiente mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110">
                      Pagar o {NOME_DO_PRODUTO[r.produto]} no Mercado Pago <ExternalLink size={14} />
                    </a>
                  </>
                ) : (
                  <PagamentoPendente token={token} caminho={`/avulso/${r.produto}/${pedido.organization_id}/${r.pagamento.id}`} inicial={r.pagamento} onAprovado={onMudou} />
                )}
              </div>
            ))}
            {erro && <p className="text-sm text-rose-300">{erro}</p>}
            {botaoConcluir}
          </div>
        ) : (
          <form onSubmit={enviar} className="mt-6 space-y-5">
            {ehCombo ? (
              <div>
                <p className={rotulo}>Combo (o mesmo plano nos dois produtos)</p>
                <div className="grid grid-cols-3 gap-2">
                  {dados.combos.map((c) => {
                    const ativo = combo?.id === c.id;
                    return (
                      <button key={c.id} type="button" onClick={() => setComboId(c.id)} className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${ativo ? 'border-[var(--primaria)] bg-[var(--primaria)]/10 text-white' : 'border-[var(--linha)] text-[var(--texto-suave)] hover:text-white'}`}>
                        <span className="block font-bold">{NOME_DO_PLANO[c.id] ?? c.nome}</span>
                      </button>
                    );
                  })}
                </div>
                {combo && precosDoCombo && (
                  <p className="mt-2 text-[11px] text-[var(--suave)]">
                    {DEFINICOES[combo.stok].nome} no Stok Aí + {DEFINICOES_ATENDE[combo.atende].nome} no Atende Aí, já com {combo.desconto}% de desconto em cada.
                  </p>
                )}
                {pedido.substitui.length > 0 && <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Substitui a assinatura em vigor do {pedido.substitui.map((p) => NOME_DO_PRODUTO[p]).join(' e do ')}: ela é cancelada ao confirmar e o combo entra no lugar.</p>}
              </div>
            ) : (
              produtos.map((produto) => (
                <div key={produto}>
                  <p className={rotulo}>Plano no {NOME_DO_PRODUTO[produto]}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(produto === 'stok' ? PLANOS : PLANOS_ATENDE).map((id) => {
                      const ativo = produto === 'stok' ? planoStok === id : planoAtende === id;
                      return (
                        <button key={id} type="button" onClick={() => (produto === 'stok' ? setPlanoStok(id as Plano) : setPlanoAtende(id as PlanoAtende))} className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${ativo ? 'border-[var(--primaria)] bg-[var(--primaria)]/10 text-white' : 'border-[var(--linha)] text-[var(--texto-suave)] hover:text-white'}`}>
                          <span className="block font-bold">{NOME_DO_PLANO[id]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className={rotulo}>Ciclo</p>
                <div className="flex rounded-xl border border-[var(--linha)] p-1 text-xs font-semibold">
                  {(['mensal', 'anual'] as const).map((c) => (
                    <button key={c} type="button" onClick={() => setCiclo(c)} className={`flex-1 rounded-lg px-3 py-1.5 ${ciclo === c ? 'fundo-gradiente text-white' : 'text-[var(--texto-suave)]'}`}>
                      {NOME_DO_CICLO[c]}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-[var(--suave)]">No anual, 12 meses menos 2 — cobrado de uma vez.</p>
              </div>
              <div>
                <p className={rotulo}>Pagamento</p>
                <div className="flex rounded-xl border border-[var(--linha)] p-1 text-xs font-semibold">
                  {(['cartao', 'pix', 'boleto'] as const).map((m) => (
                    <button key={m} type="button" disabled={m !== 'cartao' && !dados.pagamento_online} onClick={() => setMetodo(m)} className={`flex-1 rounded-lg px-3 py-1.5 disabled:opacity-40 ${metodo === m ? 'fundo-gradiente text-white' : 'text-[var(--texto-suave)]'}`}>
                      {m === 'cartao' ? 'Cartão' : m === 'pix' ? 'Pix' : 'Boleto'}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-[var(--suave)]">{metodo === 'cartao' ? (ehCombo ? 'Duas assinaturas (uma por produto), renovação automática; cancele quando quiser.' : 'Renovação automática; cancele quando quiser.') : ehCombo ? 'Um pagamento só, do período inteiro; renovação manual.' : 'Paga o período inteiro; renovação manual.'}</p>
              </div>
            </div>

            {precisaPagador && (
              <div className="rounded-2xl border border-[var(--linha)] p-4">
                <p className={rotulo}>Quem paga (vai no recibo e na nota)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className={campo} placeholder="Nome ou razão social" required value={pagador.nome} onChange={(e) => setPagador({ ...pagador, nome: e.target.value })} />
                  <input className={campo} placeholder="CPF ou CNPJ" required inputMode="numeric" value={pagador.doc} onChange={(e) => setPagador({ ...pagador, doc: e.target.value })} />
                  <input className={`${campo} sm:col-span-2`} placeholder="E-mail" type="email" required value={pagador.email} onChange={(e) => setPagador({ ...pagador, email: e.target.value })} />
                  {metodo === 'boleto' && (
                    <>
                      <input className={campo} placeholder="CEP" required inputMode="numeric" value={pagador.cep} onChange={(e) => setPagador({ ...pagador, cep: e.target.value })} />
                      <input className={campo} placeholder="Rua" required value={pagador.rua} onChange={(e) => setPagador({ ...pagador, rua: e.target.value })} />
                      <input className={campo} placeholder="Número" required value={pagador.numero} onChange={(e) => setPagador({ ...pagador, numero: e.target.value })} />
                      <input className={campo} placeholder="Bairro" required value={pagador.bairro} onChange={(e) => setPagador({ ...pagador, bairro: e.target.value })} />
                      <input className={campo} placeholder="Cidade" required value={pagador.cidade} onChange={(e) => setPagador({ ...pagador, cidade: e.target.value })} />
                      <input className={campo} placeholder="UF" required maxLength={2} value={pagador.uf} onChange={(e) => setPagador({ ...pagador, uf: e.target.value.toUpperCase() })} />
                    </>
                  )}
                </div>
              </div>
            )}

            {erro && <p className="text-sm text-rose-300">{erro}</p>}
            <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-[var(--texto-suave)]">
                Total: <span className="font-bold text-white">{brl(total)}</span>
                {ciclo === 'mensal' ? '/mês' : '/ano'}
                {ehCombo && precosDoCombo ? (
                  <>
                    {' '}
                    · <s>{brl(precosDoCombo.cheio)}</s> separados
                  </>
                ) : null}
              </p>
              <button type="submit" disabled={enviando} className="fundo-gradiente inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60">
                {enviando ? 'Preparando…' : metodo === 'cartao' ? 'Ir para o pagamento' : metodo === 'pix' ? 'Gerar Pix' : 'Gerar boleto'} <ArrowUpRight size={14} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** O Pix/boleto gerado: QR Code, copia-e-cola, link do boleto — e a conferência a cada 5 s (em `caminho`) até aprovar. */
function PagamentoPendente({ token, caminho, inicial, onAprovado }: { token: string; caminho: string; inicial: Pagamento; onAprovado: () => void }) {
  const [pg, setPg] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (pg.status !== 'pendente') return;
    const t = window.setInterval(async () => {
      try {
        const r = await pedir<{ pagamento: Pagamento }>(token, caminho);
        setPg(r.pagamento);
        if (r.pagamento.status === 'aprovado') onAprovado();
      } catch {
        /* tenta de novo no próximo tique */
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, [pg.id, pg.status, token, caminho, onAprovado]);

  const d = pg.dados ?? {};
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(d.qr_code ?? d.linha_digitavel ?? '');
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem clipboard */
    }
  };
  if (pg.status === 'aprovado') {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-emerald-300">
        <Check size={16} /> Pagamento aprovado. O plano já vale.
      </p>
    );
  }
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
      {pg.metodo === 'pix' ? (
        <span className="flex h-44 w-44 items-center justify-center rounded-xl bg-white p-2">{d.qr_code_base64 ? <img src={`data:image/png;base64,${d.qr_code_base64}`} alt="QR Code do Pix" className="h-40 w-40" /> : <QrCode size={40} className="text-slate-400" />}</span>
      ) : null}
      <div className="min-w-0 text-sm">
        <p className="text-white">
          {pg.metodo === 'pix' ? 'Pix' : 'Boleto'} de <strong>{brl(pg.valor)}</strong>
          {pg.vence_em ? ` · vale até ${new Date(pg.vence_em).toLocaleString('pt-BR')}` : ''}
        </p>
        {(d.qr_code || d.linha_digitavel) && (
          <div className="mt-2 flex items-start gap-2">
            <code className="block max-h-20 flex-1 overflow-auto break-all rounded-lg bg-[var(--fundo-2)] p-2 text-[11px] text-[var(--texto-suave)]">{d.qr_code ?? d.linha_digitavel}</code>
            <button type="button" onClick={copiar} className="inline-flex items-center gap-1 rounded-lg border border-[var(--linha)] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.06]">
              {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}
        {d.ticket_url && (
          <a href={d.ticket_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--primaria-clara)] hover:underline">
            Abrir o {pg.metodo === 'pix' ? 'Pix' : 'boleto'} no Mercado Pago <ExternalLink size={12} />
          </a>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--suave)]">
          <RefreshCw size={11} className="animate-spin" /> Conferindo o pagamento a cada 5 segundos…
        </p>
      </div>
    </div>
  );
}
