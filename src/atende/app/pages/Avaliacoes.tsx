import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Card, CardHeader } from '@/shared/ui/Card';
import { api } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { TELAS, useRotaAtende } from '../router';
import type { PeriodoDoDashboard, ResumoDeAvaliacoes } from '../../shared/tipos';

/**
 * O cartão das avaliações (0 a 10): média, NPS, resposta, por pessoa e os
 * atendimentos mais bem avaliados. A Supervisão carrega pela rota própria
 * (últimos 30 dias); o Dashboard passa o que já veio no período dele.
 */
export function CartaoDeAvaliacoes({ dados, periodo = '30d' }: { dados?: ResumoDeAvaliacoes; periodo?: PeriodoDoDashboard }) {
  const equipe = useDadosAtende((s) => s.equipe);
  const ir = useRotaAtende((s) => s.ir);
  const [carregado, setCarregado] = useState<ResumoDeAvaliacoes | null>(dados ?? null);
  useEffect(() => {
    if (dados) {
      setCarregado(dados);
      return;
    }
    let vivo = true;
    api
      .get<ResumoDeAvaliacoes>(`/avaliacoes?periodo=${periodo}`)
      .then((r) => vivo && setCarregado(r))
      .catch(() => vivo && setCarregado(null));
    return () => {
      vivo = false;
    };
  }, [dados, periodo]);

  const nome = (id: number | null) => (id === null ? 'sem atendente' : (equipe.find((f) => f.id === id)?.nome ?? `#${id}`));
  const r = carregado;
  const fmtData = (iso: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

  return (
    <Card className="p-5">
      <CardHeader icon={<Star size={14} />} title="Avaliações do atendimento" actions={r && r.pedidas > 0 ? <span className="text-xs text-[var(--text-muted)]">{r.respondidas} de {r.pedidas} responderam</span> : undefined} />
      {!r ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">Carregando…</p>
      ) : r.pedidas === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">Nenhuma avaliação pedida no período. Ao encerrar uma conversa, escolha “Despedida da IA + pedir avaliação”.</p>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Numero rotulo="Média" valor={r.media === null ? '—' : r.media.toFixed(1)} sufixo={r.media === null ? '' : '/10'} />
            <Numero rotulo="NPS" valor={r.nps === null ? '—' : String(r.nps)} destaque={r.nps !== null ? (r.nps >= 50 ? 'bom' : r.nps >= 0 ? 'neutro' : 'ruim') : undefined} />
            <Numero rotulo="Responderam" valor={r.taxa_de_resposta === null ? '—' : `${r.taxa_de_resposta}%`} />
          </div>

          {r.respondidas > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Distribuição</p>
              <div className="flex items-end gap-1" aria-label="Notas de 0 a 10">
                {r.distribuicao.map((n, nota) => {
                  const max = Math.max(...r.distribuicao, 1);
                  return (
                    <div key={nota} className="flex flex-1 flex-col items-center gap-1" title={`${n} nota(s) ${nota}`}>
                      <div className={`w-full rounded-t ${nota >= 9 ? 'bg-emerald-500/70' : nota >= 7 ? 'bg-amber-400/70' : 'bg-rose-500/60'}`} style={{ height: `${Math.max(2, (n / max) * 40)}px` }} />
                      <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{nota}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {r.por_pessoa.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Por pessoa</p>
              <ul className="divide-y divide-[var(--border)] text-sm">
                {r.por_pessoa.map((p) => (
                  <li key={p.usuario_id} className="flex items-center justify-between py-1.5">
                    <span className="font-semibold text-[var(--text)]">{nome(p.usuario_id)}</span>
                    <span className="tabular-nums text-[var(--text-muted)]">
                      <strong className="text-[var(--text)]">{p.media.toFixed(1)}</strong>/10 · {p.avaliacoes} {p.avaliacoes === 1 ? 'nota' : 'notas'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.melhores.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Mais bem avaliados</p>
              <ul className="space-y-1">
                {r.melhores.map((m) => (
                  <li key={m.conversa_id}>
                    <button type="button" onClick={() => ir(TELAS.central, m.conversa_id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bg-2)]">
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold ${m.nota >= 9 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : m.nota >= 7 ? 'bg-amber-400/20 text-amber-700 dark:text-amber-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}`}>{m.nota}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--text)]">
                          {m.cliente} <span className="font-normal text-[var(--text-muted)]">· {nome(m.atendente_id)}</span>
                        </span>
                        <span className="block truncate text-xs text-[var(--text-muted)]">{m.comentario ? `“${m.comentario}”` : (m.assunto ?? 'sem assunto')}</span>
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{fmtData(m.avaliada_em)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Numero({ rotulo, valor, sufixo = '', destaque }: { rotulo: string; valor: string; sufixo?: string; destaque?: 'bom' | 'neutro' | 'ruim' }) {
  const cor = destaque === 'bom' ? 'text-emerald-600 dark:text-emerald-400' : destaque === 'ruim' ? 'text-rose-600' : 'text-[var(--text)]';
  return (
    <div className="rounded-xl bg-[var(--bg-2)] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-extrabold tabular-nums ${cor}`}>
        {valor}
        {sufixo && <span className="text-xs font-medium text-[var(--text-muted)]">{sufixo}</span>}
      </p>
    </div>
  );
}
