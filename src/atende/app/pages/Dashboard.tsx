import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock, Inbox, MessageSquareText, RefreshCw, Sparkles, Target, Users, UsersRound } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { StatCard } from '@/shared/ui/StatCard';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { useSessaoAtende } from '../store/sessao';
import { ESTADOS_DO_LEAD, NOME_DO_ESTADO_DO_LEAD, NOME_DA_SUGESTAO, NOME_DO_PERIODO, type Dashboard as TDashboard, type PeriodoDoDashboard, type SugestaoDeLead } from '../../shared/tipos';

/**
 * O Dashboard: o que aconteceu no período, contado no banco. Conversas,
 * leads e conversão, tempos de primeira resposta e de resolução, o que a IA
 * decidiu e quanto foi corrigida, e o desempenho por pessoa e por setor.
 * Sem dado, a tela diz "ainda nada" — nunca um número inventado.
 */
const PERIODOS: PeriodoDoDashboard[] = ['hoje', '7d', '30d', '90d'];

const NOME_DA_INTENCAO: Record<string, string> = { comprar: 'Quer comprar', orcamento: 'Orçamento', duvida: 'Dúvida', suporte: 'Suporte', reclamacao: 'Reclamação', agendamento: 'Agendamento', financeiro: 'Financeiro', outro: 'Outro' };
const COR_DO_LEAD: Record<string, string> = { novo: 'bg-sky-500', em_atendimento: 'bg-violet-500', em_negociacao: 'bg-amber-500', aguardando_cliente: 'bg-slate-400', convertido: 'bg-emerald-500', perdido: 'bg-rose-500' };

export function Dashboard() {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const equipe = useDadosAtende((s) => s.equipe);
  const times = useDadosAtende((s) => s.times);
  const [periodo, setPeriodo] = useState<PeriodoDoDashboard>('7d');
  const [dados, setDados] = useState<TDashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar(p = periodo) {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await api.get<TDashboard>(`/dashboard?periodo=${p}`));
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
  const nomeDoTime = (id: string | null) => (id === null ? 'Sem setor' : times.find((t) => t.id === id)?.nome ?? 'Setor removido');
  const maxDia = useMemo(() => Math.max(1, ...(dados?.serie.map((s) => s.conversas) ?? [1])), [dados]);
  const a = dados?.atendimentos;
  const vazio = dados && a && a.abertas_no_periodo === 0 && a.abertas_agora === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{sessao.papel === 'admin' ? 'A empresa inteira' : 'Os seus times'}, no período — tudo contado no banco, nada estimado.</p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl value={periodo} onChange={setPeriodo} layoutId="atende-dashboard-periodo" options={PERIODOS.map((p) => ({ value: p, label: NOME_DO_PERIODO[p] }))} />
          <Button size="sm" variant="ghost" icon={<RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />} onClick={() => carregar()} aria-label="Atualizar" />
        </div>
      </div>

      {erro && (
        <Card className="p-5 text-sm text-rose-600">
          {erro}{' '}
          <button type="button" onClick={() => carregar()} className="font-semibold underline">
            Tentar de novo
          </button>
        </Card>
      )}
      {!dados && !erro && <p className="py-16 text-center text-sm text-[var(--text-muted)]">Contando…</p>}

      {dados && a && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Conversas no período" value={a.abertas_no_periodo} icon={<MessageSquareText size={18} />} accent="brand" sublabel={`${a.encerradas_no_periodo} encerradas · ${a.abertas_agora} abertas agora`} serie={dados.serie.map((s) => s.conversas)} />
            <StatCard label="Leads" value={dados.leads.total} icon={<Target size={18} />} accent="violet" sublabel={dados.leads.taxa_de_conversao === null ? `${dados.leads.convertidos} convertidos · sem decisão ainda` : `${dados.leads.convertidos} convertidos · ${dados.leads.taxa_de_conversao}% dos decididos`} />
            <StatCard label="Na fila agora" value={a.na_fila_agora} icon={<Inbox size={18} />} accent={a.na_fila_agora ? 'amber' : 'slate'} sublabel={`${a.sem_resposta_humana} do período ainda sem resposta humana`} />
            <StatCard label="1ª resposta (mediana)" value={tempo(a.primeira_resposta_mediana_s)} icon={<Clock size={18} />} accent="blue" sublabel={a.primeira_resposta_media_s === null ? 'ninguém respondeu ainda' : `média ${tempo(a.primeira_resposta_media_s)} · só respostas humanas`} />
            <StatCard label="Resolução (mediana)" value={tempo(a.resolucao_mediana_s)} icon={<CheckCircle2 size={18} />} accent="green" sublabel={a.resolucao_media_s === null ? 'nenhuma encerrada no período' : `média ${tempo(a.resolucao_media_s)} · da abertura ao encerramento`} />
            <StatCard label="Triagens da IA" value={dados.ia.decisoes} icon={<Sparkles size={18} />} accent="violet" sublabel={dados.ia.taxa_de_correcao === null ? 'nenhuma decisão no período' : `${dados.ia.corrigidas} corrigidas (${dados.ia.taxa_de_correcao}%)${dados.ia.confianca_media !== null ? ` · confiança ${Math.round(dados.ia.confianca_media * 100)}%` : ''}`} />
          </div>

          {vazio && (
            <Card className="p-8 text-center">
              <BarChart3 size={26} className="mx-auto text-[var(--text-muted)]" />
              <p className="mt-3 text-sm font-semibold text-[var(--text)]">Ainda nada neste período.</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Quando os clientes escreverem para o WhatsApp da empresa, os números aparecem aqui — contados, não estimados.</p>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
            <Card className="p-5">
              <CardHeader icon={<BarChart3 size={14} />} title="Conversas por dia" actions={<span className="text-xs text-[var(--text-muted)]">{a.mensagens_do_cliente} msgs do cliente · {a.mensagens_da_equipe} da equipe · {a.mensagens_da_ia} da IA</span>} />
              <div className="mt-4 flex h-40 items-end gap-1">
                {dados.serie.map((s) => (
                  <div key={s.dia} className="group relative flex h-full flex-1 flex-col justify-end" title={`${diaBonito(s.dia)}: ${s.conversas}`}>
                    <div className={`w-full rounded-t-md transition-colors ${s.conversas ? 'bg-[var(--brand)] group-hover:bg-[var(--brand)]/80' : 'bg-[var(--border)]'}`} style={{ height: `${Math.max(s.conversas ? 6 : 2, (s.conversas / maxDia) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-[var(--text-muted)]">
                <span>{diaBonito(dados.serie[0]?.dia)}</span>
                {dados.serie.length > 2 && <span>{diaBonito(dados.serie[Math.floor(dados.serie.length / 2)]?.dia)}</span>}
                <span>{diaBonito(dados.serie[dados.serie.length - 1]?.dia)}</span>
              </div>
            </Card>

            <Card className="p-5">
              <CardHeader icon={<Target size={14} />} title="Funil de leads" actions={dados.leads.valor_convertido > 0 ? <span className="text-xs font-semibold text-[var(--verde)]">{moeda(dados.leads.valor_convertido)} convertidos</span> : undefined} />
              <ul className="mt-4 space-y-2">
                {ESTADOS_DO_LEAD.map((e) => {
                  const n = dados.leads.funil[e] ?? 0;
                  const pct = dados.leads.total ? (n / dados.leads.total) * 100 : 0;
                  return (
                    <li key={e} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--text)]">{NOME_DO_ESTADO_DO_LEAD[e]}</span>
                        <span className="tabular-nums text-[var(--text-muted)]">{n}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg-2)]">
                        <div className={`h-full rounded-full ${COR_DO_LEAD[e]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {Object.keys(dados.leads.sugestoes_da_ia).length > 0 && (
                <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                  A IA sugeriu: {Object.entries(dados.leads.sugestoes_da_ia).map(([k, v]) => `${v} ${NOME_DA_SUGESTAO[k as SugestaoDeLead] ?? k}`).join(' · ')}
                </p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <CardHeader icon={<Users size={14} />} title="Por pessoa" />
              {dados.por_pessoa.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--text-muted)]">Nenhuma conversa atendida no período.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        <th className="pb-2">Pessoa</th>
                        <th className="pb-2 text-right">Conversas</th>
                        <th className="pb-2 text-right">Encerradas</th>
                        <th className="pb-2 text-right">1ª resposta</th>
                        <th className="pb-2 text-right">Msgs</th>
                        <th className="pb-2 text-right">Convertidos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {dados.por_pessoa.map((p) => (
                        <tr key={p.usuario_id}>
                          <td className="py-2 font-semibold text-[var(--text)]">{nome(p.usuario_id)}</td>
                          <td className="py-2 text-right tabular-nums">{p.conversas}</td>
                          <td className="py-2 text-right tabular-nums">{p.encerradas}</td>
                          <td className="py-2 text-right tabular-nums">{tempo(p.primeira_resposta_mediana_s)}</td>
                          <td className="py-2 text-right tabular-nums">{p.mensagens_enviadas}</td>
                          <td className="py-2 text-right tabular-nums">
                            {p.leads_convertidos}
                            {p.valor_convertido > 0 && <span className="block text-[10px] text-[var(--verde)]">{moeda(p.valor_convertido)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <CardHeader icon={<UsersRound size={14} />} title="Por setor" />
              {dados.por_setor.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--text-muted)]">Nenhuma conversa no período.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        <th className="pb-2">Setor</th>
                        <th className="pb-2 text-right">Conversas</th>
                        <th className="pb-2 text-right">Encerradas</th>
                        <th className="pb-2 text-right">Na fila</th>
                        <th className="pb-2 text-right">1ª resposta</th>
                        <th className="pb-2 text-right">Convertidos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {dados.por_setor.map((s) => (
                        <tr key={s.time_id ?? 'sem'}>
                          <td className={`py-2 font-semibold ${s.time_id ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{nomeDoTime(s.time_id)}</td>
                          <td className="py-2 text-right tabular-nums">{s.conversas}</td>
                          <td className="py-2 text-right tabular-nums">{s.encerradas}</td>
                          <td className="py-2 text-right tabular-nums">{s.na_fila_agora}</td>
                          <td className="py-2 text-right tabular-nums">{tempo(s.primeira_resposta_mediana_s)}</td>
                          <td className="py-2 text-right tabular-nums">{s.leads_convertidos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <CardHeader icon={<Sparkles size={14} />} title="A IA no período" actions={<span className="text-xs text-[var(--text-muted)]">{dados.ia.triagens} rodadas · {dados.ia.conversas_triadas} conversas · {dados.ia.esclarecimentos} perguntas ao cliente</span>} />
            {dados.ia.decisoes === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">A IA não triou nenhuma conversa no período.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-[3fr_2fr]">
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">O que os clientes queriam</p>
                  <ul className="space-y-1.5">
                    {Object.entries(dados.ia.intencoes)
                      .sort(([, a1], [, b1]) => b1 - a1)
                      .map(([k, v]) => (
                        <li key={k} className="flex items-center gap-3 text-xs">
                          <span className="w-28 shrink-0 font-semibold text-[var(--text)]">{NOME_DA_INTENCAO[k] ?? k}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
                            <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${(v / dados.ia.decisoes) * 100}%` }} />
                          </span>
                          <span className="w-8 text-right tabular-nums text-[var(--text-muted)]">{v}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                <dl className="space-y-1.5 text-xs">
                  <Linha rotulo="Decisões">{dados.ia.decisoes}</Linha>
                  <Linha rotulo="Corrigidas pela equipe">{dados.ia.corrigidas}{dados.ia.taxa_de_correcao !== null ? ` (${dados.ia.taxa_de_correcao}%)` : ''}</Linha>
                  <Linha rotulo="Confiança média">{dados.ia.confianca_media === null ? '—' : `${Math.round(dados.ia.confianca_media * 100)}%`}</Linha>
                  <Linha rotulo="Tokens de entrada">{numero(dados.ia.tokens.entrada)}{dados.ia.tokens.cache ? ` (+${numero(dados.ia.tokens.cache)} do cache)` : ''}</Linha>
                  <Linha rotulo="Tokens de saída">{numero(dados.ia.tokens.saida)}</Linha>
                  <Linha rotulo="Modelo">{dados.ia.modelos.map((m) => (m === 'palavras-chave' ? 'palavras-chave (sem IA)' : m)).join(', ') || '—'}</Linha>
                </dl>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
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

function diaBonito(dia?: string): string {
  if (!dia) return '';
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}

function moeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function numero(n: number): string {
  return n.toLocaleString('pt-BR');
}
