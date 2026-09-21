import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, BarChart3, Clock, MessageSquareText, Percent, RefreshCw, Sparkles, Star, Target, Users, UsersRound, Activity } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao, CabecalhoDoCartao, Rotulo } from '../ui/Cartao';
import { Segmentado } from '../ui/Controles';
import { Kpi, type Variacao } from '../ui/Kpi';
import { Tabela, type Coluna } from '../ui/Tabela';
import { Avatar } from '../ui/Avatar';
import { Pagina } from '../ui/Pagina';
import { Erro, EsqueletoDeKpi, Esqueleto, Vazio } from '../ui/Estados';
import { SeloIa, TituloIa } from '../ui/Ia';
import { BarraHorizontal, Funil, GraficoDeConversas } from '../ui/Graficos';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { useSessaoAtende } from '../store/sessao';
import { TELAS, useRotaAtende } from '../router';
import { ESTADOS_DO_LEAD, NOME_DO_ESTADO_DO_LEAD, NOME_DA_SUGESTAO, NOME_DO_PERIODO, type Dashboard as TDashboard, type LinhaPorPessoa, type LinhaPorSetor, type PeriodoDoDashboard, type SugestaoDeLead } from '../../shared/tipos';

/**
 * O Dashboard: o que aconteceu no período, contado no banco. Conversas,
 * leads e conversão, tempos de primeira resposta e de resolução, o que a IA
 * decidiu e quanto foi corrigida, e o desempenho por pessoa e por setor.
 * Sem dado, a tela diz "ainda nada" — nunca um número inventado.
 *
 * A comparação "vs. período anterior" só aparece onde dá para contar de
 * verdade: nas conversas por dia, usando a série do período maior (7 dias
 * anteriores saem da série de 30; 30, da de 90; hoje, de ontem).
 */
const PERIODOS: PeriodoDoDashboard[] = ['hoje', '7d', '30d', '90d'];
const DIAS: Record<PeriodoDoDashboard, number> = { hoje: 1, '7d': 7, '30d': 30, '90d': 90 };
const PERIODO_MAIOR: Partial<Record<PeriodoDoDashboard, PeriodoDoDashboard>> = { hoje: '7d', '7d': '30d', '30d': '90d' };
const TEXTO_DO_PERIODO: Record<PeriodoDoDashboard, string> = { hoje: 'hoje', '7d': 'nos últimos 7 dias', '30d': 'nos últimos 30 dias', '90d': 'nos últimos 90 dias' };
const TEXTO_DA_COMPARACAO: Record<PeriodoDoDashboard, string> = { hoje: 'vs. ontem', '7d': 'vs. 7 dias anteriores', '30d': 'vs. 30 dias anteriores', '90d': '' };

const NOME_DA_INTENCAO: Record<string, string> = { comprar: 'Quer comprar', orcamento: 'Orçamento', duvida: 'Dúvida', suporte: 'Suporte', reclamacao: 'Reclamação', agendamento: 'Agendamento', financeiro: 'Financeiro', outro: 'Outro' };
const COR_DO_LEAD: Record<string, string> = { novo: '#3b82f6', em_atendimento: '#7c3aed', em_negociacao: '#d97706', aguardando_cliente: '#94a3b8', convertido: '#16a34a', perdido: '#e11d48' };

function saudacao(hora = new Date().getHours()): string {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function Dashboard() {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const equipe = useDadosAtende((s) => s.equipe);
  const times = useDadosAtende((s) => s.times);
  const ir = useRotaAtende((s) => s.ir);
  const [periodo, setPeriodo] = useState<PeriodoDoDashboard>('7d');
  const [dados, setDados] = useState<TDashboard | null>(null);
  const [serieMaior, setSerieMaior] = useState<{ periodo: PeriodoDoDashboard; serie: TDashboard['serie'] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar(p = periodo) {
    setCarregando(true);
    setErro(null);
    try {
      const d = await api.get<TDashboard>(`/dashboard?periodo=${p}`);
      setDados(d);
      // A base da comparação: a série do período maior, buscada depois, sem segurar a tela.
      const maior = PERIODO_MAIOR[p];
      if (maior) {
        api
          .get<TDashboard>(`/dashboard?periodo=${maior}`)
          .then((m) => setSerieMaior({ periodo: p, serie: m.serie }))
          .catch(() => setSerieMaior(null));
      } else setSerieMaior(null);
    } catch (err) {
      setErro(err instanceof ErroDaApi ? err.message : 'Não foi possível carregar.');
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    void carregar(periodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const nome = (id: number) => equipe.find((f) => f.id === id)?.nome ?? `#${id}`;
  const nomeDoTime = (id: string | null) => (id === null ? 'Sem setor' : (times.find((t) => t.id === id)?.nome ?? 'Setor removido'));
  const a = dados?.atendimentos;
  const vazio = dados && a && a.abertas_no_periodo === 0 && a.abertas_agora === 0;

  // Conversas: atual vs. a janela imediatamente anterior, contadas na série maior.
  const variacaoDasConversas = useMemo<Variacao | undefined>(() => {
    if (!dados || !serieMaior || serieMaior.periodo !== periodo) return undefined;
    const n = DIAS[periodo];
    const s = serieMaior.serie;
    if (s.length < 2 * n) return undefined;
    const atual = s.slice(s.length - n).reduce((t, x) => t + x.conversas, 0);
    const anterior = s.slice(s.length - 2 * n, s.length - n).reduce((t, x) => t + x.conversas, 0);
    if (anterior === 0) return { valor: null };
    return { valor: ((atual - anterior) / anterior) * 100, texto: TEXTO_DA_COMPARACAO[periodo] };
  }, [dados, serieMaior, periodo]);

  const acoes = (
    <>
      <Segmentado valor={periodo} onChange={setPeriodo} tamanho="sm" opcoes={PERIODOS.map((p) => ({ valor: p, rotulo: NOME_DO_PERIODO[p] }))} aria-label="Período" />
      <Botao tamanho="sm" variante="fantasma" quadrado icone={<RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />} onClick={() => carregar()} aria-label="Atualizar" />
    </>
  );

  const colunasPorPessoa: Coluna<LinhaPorPessoa>[] = [
    { chave: 'pessoa', titulo: 'Pessoa', principal: true, render: (p) => <span className="flex items-center gap-2.5"><Avatar nome={nome(p.usuario_id)} tamanho={28} /><span className="truncate font-medium text-[var(--text)]">{nome(p.usuario_id)}</span></span> },
    { chave: 'conversas', titulo: 'Conversas', alinhar: 'direita', render: (p) => <span className="tabular-nums">{p.conversas}</span> },
    { chave: 'encerradas', titulo: 'Encerradas', alinhar: 'direita', render: (p) => <span className="tabular-nums">{p.encerradas}</span> },
    { chave: 'resposta', titulo: '1ª resposta', alinhar: 'direita', render: (p) => <span className="tabular-nums">{tempo(p.primeira_resposta_mediana_s)}</span> },
    { chave: 'msgs', titulo: 'Msgs', alinhar: 'direita', soNoDesktop: true, render: (p) => <span className="tabular-nums">{p.mensagens_enviadas}</span> },
    { chave: 'convertidos', titulo: 'Convertidos', alinhar: 'direita', render: (p) => <span className="tabular-nums">{p.leads_convertidos}{p.valor_convertido > 0 && <span className="block text-[11px] text-emerald-600">{moeda(p.valor_convertido)}</span>}</span> },
  ];
  const colunasPorSetor: Coluna<LinhaPorSetor>[] = [
    { chave: 'setor', titulo: 'Setor', principal: true, render: (s) => <span className={`font-medium ${s.time_id ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{nomeDoTime(s.time_id)}</span> },
    { chave: 'conversas', titulo: 'Conversas', alinhar: 'direita', render: (s) => <span className="tabular-nums">{s.conversas}</span> },
    { chave: 'encerradas', titulo: 'Encerradas', alinhar: 'direita', render: (s) => <span className="tabular-nums">{s.encerradas}</span> },
    { chave: 'fila', titulo: 'Na fila', alinhar: 'direita', render: (s) => <span className={`tabular-nums ${s.na_fila_agora ? 'font-semibold text-amber-600' : ''}`}>{s.na_fila_agora}</span> },
    { chave: 'resposta', titulo: '1ª resposta', alinhar: 'direita', render: (s) => <span className="tabular-nums">{tempo(s.primeira_resposta_mediana_s)}</span> },
    { chave: 'convertidos', titulo: 'Convertidos', alinhar: 'direita', render: (s) => <span className="tabular-nums">{s.leads_convertidos}</span> },
  ];

  return (
    <Pagina titulo="Dashboard" descricao={`${sessao.papel === 'admin' ? 'A empresa inteira' : 'Os seus times'} no período — tudo contado no banco, nada estimado.`} acoes={acoes} largura="xl">
      <div className="space-y-5">
        {/* Boas-vindas */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl">
              {saudacao()}, {sessao.nome.split(' ')[0]} 👋
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Veja como está o desempenho do seu atendimento {TEXTO_DO_PERIODO[periodo]}.</p>
          </div>
          {dados && <p className="text-xs text-[var(--text-muted)]">{fmtPeriodo(dados.periodo.de)} – {fmtPeriodo(dados.periodo.ate)}</p>}
        </div>

        {erro && <Erro mensagem={erro} aoTentar={() => carregar()} />}

        {!dados && !erro && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <EsqueletoDeKpi key={i} />
            ))}
            <Cartao className="col-span-2 p-5 lg:col-span-3 2xl:col-span-6">
              <Esqueleto className="h-4 w-40" />
              <Esqueleto className="mt-5 h-48 w-full" />
            </Cartao>
          </div>
        )}

        {dados && a && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
              <Kpi rotulo="Atendimentos" valor={a.abertas_no_periodo} icone={<MessageSquareText size={16} />} tom="roxo" serie={dados.serie.map((s) => s.conversas)} variacao={variacaoDasConversas} legenda={`${a.encerradas_no_periodo} ${a.encerradas_no_periodo === 1 ? 'encerrada' : 'encerradas'} no período`} />
              <Kpi rotulo="Em andamento" valor={a.abertas_agora} icone={<Activity size={16} />} tom={a.na_fila_agora ? 'ambar' : 'azul'} legenda={`${a.na_fila_agora} na fila · ${a.sem_resposta_humana} sem resposta humana`} onClick={() => ir(TELAS.central)} />
              <Kpi rotulo="Tempo de resposta" valor={tempo(a.primeira_resposta_mediana_s)} icone={<Clock size={16} />} tom="verde" legenda={a.primeira_resposta_media_s === null ? 'ninguém respondeu ainda' : `mediana · média ${tempo(a.primeira_resposta_media_s)}`} />
              <Kpi rotulo="Leads" valor={dados.leads.total} icone={<Target size={16} />} tom="roxo" legenda={`${dados.leads.convertidos} convertidos · ${dados.leads.perdidos} perdidos`} />
              <Kpi rotulo="Conversão" valor={dados.leads.taxa_de_conversao === null ? '—' : dados.leads.taxa_de_conversao} sufixo={dados.leads.taxa_de_conversao === null ? undefined : '%'} icone={<Percent size={16} />} tom="azul" legenda={dados.leads.taxa_de_conversao === null ? 'nenhum lead decidido ainda' : dados.leads.valor_convertido > 0 ? `${moeda(dados.leads.valor_convertido)} em negócios` : 'dos leads decididos'} />
              <Kpi rotulo="Avaliação média" valor={dados.avaliacoes.media === null ? '—' : dados.avaliacoes.media.toFixed(1)} sufixo={dados.avaliacoes.media === null ? undefined : '/10'} icone={<Star size={16} />} tom={dados.avaliacoes.media === null ? 'cinza' : dados.avaliacoes.media >= 9 ? 'verde' : dados.avaliacoes.media >= 7 ? 'ambar' : 'vermelho'} legenda={dados.avaliacoes.respondidas ? `NPS ${dados.avaliacoes.nps ?? '—'} · ${dados.avaliacoes.respondidas} ${dados.avaliacoes.respondidas === 1 ? 'resposta' : 'respostas'}` : 'nenhuma avaliação no período'} onClick={() => ir(TELAS.avaliacoes)} />
            </div>

            {vazio && (
              <Cartao>
                <Vazio tom="positivo" icone={<BarChart3 size={22} />} titulo="Ainda nada neste período." texto="Quando os clientes escreverem para o WhatsApp da empresa, os números aparecem aqui — contados, não estimados." />
              </Cartao>
            )}

            {/* Gráfico + funil */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
              <Cartao className="p-4 sm:p-5">
                <CabecalhoDoCartao icone={<BarChart3 size={14} />} titulo="Conversas por dia" descricao={`Abertas ${TEXTO_DO_PERIODO[periodo]}`} acoes={<span className="hidden items-center gap-1.5 text-xs text-[var(--text-muted)] sm:inline-flex"><span className="h-2 w-2 rounded-full bg-[var(--brand)]" /> Conversas abertas</span>} />
                <div className="mt-4">
                  <GraficoDeConversas serie={dados.serie} altura={230} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3 text-xs sm:grid-cols-4">
                  <Metrica rotulo="Msgs do cliente" valor={numero(a.mensagens_do_cliente)} />
                  <Metrica rotulo="Msgs da equipe" valor={numero(a.mensagens_da_equipe)} />
                  <Metrica rotulo="Msgs da IA" valor={numero(a.mensagens_da_ia)} />
                  <Metrica rotulo="Resolução (mediana)" valor={tempo(a.resolucao_mediana_s)} detalhe={a.resolucao_media_s === null ? 'nenhuma encerrada' : `média ${tempo(a.resolucao_media_s)}`} />
                </dl>
              </Cartao>

              <Cartao className="flex flex-col p-4 sm:p-5">
                <CabecalhoDoCartao icone={<Target size={14} />} titulo="Funil de leads" descricao={`${dados.leads.total} ${dados.leads.total === 1 ? 'lead' : 'leads'} no período`} acoes={dados.leads.valor_convertido > 0 ? <span className="text-xs font-semibold text-emerald-600">{moeda(dados.leads.valor_convertido)} convertidos</span> : undefined} />
                <div className="mt-4 flex-1">
                  {dados.leads.total === 0 ? (
                    <Vazio compacto icone={<Target size={18} />} titulo="Nenhum lead no período." texto="A IA marca quem quer comprar ou pede orçamento; a equipe move no funil pela ficha do cliente." />
                  ) : (
                    <Funil total={dados.leads.total} etapas={ESTADOS_DO_LEAD.map((e) => ({ chave: e, nome: NOME_DO_ESTADO_DO_LEAD[e], quantidade: dados.leads.funil[e] ?? 0, cor: COR_DO_LEAD[e] }))} />
                  )}
                </div>
                {Object.keys(dados.leads.sugestoes_da_ia).length > 0 && (
                  <div className="mt-4 border-t border-[var(--border)] pt-3">
                    {(dados.leads.sugestoes_da_ia.quente ?? 0) > 0 && (
                      <p className="flex items-start gap-2 text-xs text-[var(--text)]">
                        <SeloIa>IA</SeloIa>
                        <span>
                          A IA identificou <strong>{dados.leads.sugestoes_da_ia.quente}</strong> {dados.leads.sugestoes_da_ia.quente === 1 ? 'oportunidade' : 'oportunidades'} com maior potencial (lead quente).
                        </span>
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                      Sugestões da IA: {Object.entries(dados.leads.sugestoes_da_ia).map(([k, v]) => `${v} ${NOME_DA_SUGESTAO[k as SugestaoDeLead]?.toLowerCase() ?? k}`).join(' · ')}
                    </p>
                  </div>
                )}
              </Cartao>
            </div>

            {/* Avaliações + IA */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Cartao className="p-4 sm:p-5">
                <CabecalhoDoCartao icone={<Star size={14} />} titulo="Avaliações do atendimento" descricao={dados.avaliacoes.pedidas ? `${dados.avaliacoes.respondidas} de ${dados.avaliacoes.pedidas} responderam` : 'Notas de 0 a 10 pedidas ao encerrar'} acoes={<Botao variante="fantasma" tamanho="xs" iconeDepois={<ArrowUpRight size={13} />} onClick={() => ir(TELAS.avaliacoes)}>Ver tudo</Botao>} />
                {dados.avaliacoes.pedidas === 0 ? (
                  <Vazio compacto icone={<Star size={18} />} titulo="Nenhuma avaliação pedida no período." texto="Ao encerrar uma conversa, escolha “Despedida da IA + pedir avaliação”." />
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <Numero rotulo="Média" valor={dados.avaliacoes.media === null ? '—' : dados.avaliacoes.media.toFixed(1)} sufixo={dados.avaliacoes.media === null ? '' : '/10'} />
                    <Numero rotulo="NPS" valor={dados.avaliacoes.nps === null ? '—' : String(dados.avaliacoes.nps)} tom={dados.avaliacoes.nps === null ? undefined : dados.avaliacoes.nps >= 50 ? 'bom' : dados.avaliacoes.nps >= 0 ? 'neutro' : 'ruim'} />
                    <Numero rotulo="Responderam" valor={dados.avaliacoes.taxa_de_resposta === null ? '—' : `${dados.avaliacoes.taxa_de_resposta}%`} />
                  </div>
                )}
              </Cartao>

              <Cartao className="p-4 sm:p-5">
                <TituloIa acoes={<span className="text-xs text-[var(--text-muted)]">{dados.ia.triagens} rodadas · {dados.ia.conversas_triadas} conversas</span>}>A IA no período</TituloIa>
                {dados.ia.decisoes === 0 ? (
                  <Vazio compacto icone={<Sparkles size={18} />} titulo="A IA não triou nenhuma conversa no período." />
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[3fr_2fr]">
                    <div>
                      <Rotulo className="mb-2">O que os clientes queriam</Rotulo>
                      <ul className="space-y-1.5">
                        {Object.entries(dados.ia.intencoes)
                          .sort(([, a1], [, b1]) => b1 - a1)
                          .map(([k, v]) => (
                            <BarraHorizontal key={k} rotulo={NOME_DA_INTENCAO[k] ?? k} valor={v} total={dados.ia.decisoes} />
                          ))}
                      </ul>
                    </div>
                    <dl className="space-y-1.5 text-xs">
                      <Linha rotulo="Decisões">{dados.ia.decisoes}</Linha>
                      <Linha rotulo="Corrigidas pela equipe">{dados.ia.corrigidas}{dados.ia.taxa_de_correcao !== null ? ` (${dados.ia.taxa_de_correcao}%)` : ''}</Linha>
                      <Linha rotulo="Confiança média">{dados.ia.confianca_media === null ? '—' : `${Math.round(dados.ia.confianca_media * 100)}%`}</Linha>
                      <Linha rotulo="Perguntas ao cliente">{dados.ia.esclarecimentos}</Linha>
                      <Linha rotulo="Como a triagem decidiu">{dados.ia.modelos.map((m) => (m === 'palavras-chave' ? 'Palavras-chave (sem IA)' : `IA (${m})`)).join(', ') || '—'}</Linha>
                      <details className="pt-1">
                        <summary className="cursor-pointer text-[var(--text-muted)]">Detalhes técnicos</summary>
                        <div className="mt-1.5 space-y-1.5">
                          <Linha rotulo="Tokens de entrada">{numero(dados.ia.tokens.entrada)}{dados.ia.tokens.cache ? ` (+${numero(dados.ia.tokens.cache)} do cache)` : ''}</Linha>
                          <Linha rotulo="Tokens de saída">{numero(dados.ia.tokens.saida)}</Linha>
                        </div>
                      </details>
                    </dl>
                  </div>
                )}
              </Cartao>
            </div>

            {/* Por pessoa + por setor */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Cartao className="p-4 sm:p-5">
                <CabecalhoDoCartao icone={<Users size={14} />} titulo="Por pessoa" descricao="Quem atendeu o quê no período" />
                <div className="mt-3">
                  <Tabela colunas={colunasPorPessoa} linhas={[...dados.por_pessoa].sort((x, y) => y.conversas - x.conversas)} chave={(p) => String(p.usuario_id)} compacta vazio={<Vazio compacto icone={<Users size={18} />} titulo="Nenhuma conversa atendida no período." />} />
                </div>
              </Cartao>
              <Cartao className="p-4 sm:p-5">
                <CabecalhoDoCartao icone={<UsersRound size={14} />} titulo="Por setor" descricao="Para onde as conversas foram" />
                <div className="mt-3">
                  <Tabela colunas={colunasPorSetor} linhas={dados.por_setor} chave={(s) => s.time_id ?? 'sem'} compacta vazio={<Vazio compacto icone={<UsersRound size={18} />} titulo="Nenhuma conversa no período." />} />
                </div>
              </Cartao>
            </div>
          </>
        )}
      </div>
    </Pagina>
  );
}

function Metrica({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-[var(--text-muted)]">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text)]">
        {valor}
        {detalhe && <span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">{detalhe}</span>}
      </dd>
    </div>
  );
}

function Numero({ rotulo, valor, sufixo = '', tom }: { rotulo: string; valor: string; sufixo?: string; tom?: 'bom' | 'neutro' | 'ruim' }) {
  const cor = tom === 'bom' ? 'text-emerald-600' : tom === 'ruim' ? 'text-rose-600' : 'text-[var(--text)]';
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
      <p className="text-[11px] font-medium text-[var(--text-muted)]">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums ${cor}`}>
        {valor}
        {sufixo && <span className="text-xs font-medium text-[var(--text-muted)]">{sufixo}</span>}
      </p>
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--text-muted)]">{rotulo}</dt>
      <dd className="text-right font-semibold tabular-nums text-[var(--text)]">{children}</dd>
    </div>
  );
}

/** Segundos → "45 s", "12 min", "1 h 05", "2 d 3 h". Nulo → "—". */
export function tempo(s: number | null): string {
  if (s === null) return '—';
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`;
  const d = Math.floor(h / 24);
  return `${d} d${h % 24 ? ` ${h % 24} h` : ''}`;
}

function fmtPeriodo(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

function moeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function numero(n: number): string {
  return n.toLocaleString('pt-BR');
}
