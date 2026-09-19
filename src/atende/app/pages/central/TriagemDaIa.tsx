import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Pencil, X, Send } from 'lucide-react';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral } from '../../store/central';
import { useDadosAtende } from '../../store/dados';
import { useSessaoAtende } from '../../store/sessao';
import { pode } from '../../../shared/papeis';
import { ESTADOS_DO_LEAD, NOME_DO_ESTADO_DO_LEAD, NOME_DA_SUGESTAO, type Conversa, type Lead, type Triagem } from '../../../shared/tipos';

/**
 * O bloco "Triagem da IA" no painel do cliente: o que a IA decidiu (setor,
 * intenção, prioridade, confiança, resumo), o lead no funil — que a equipe
 * move — e, para supervisor e admin, o botão de corrigir o setor.
 */

const NOME_DA_INTENCAO: Record<string, string> = {
  comprar: 'Quer comprar',
  orcamento: 'Pede orçamento',
  duvida: 'Tira dúvida',
  suporte: 'Precisa de suporte',
  reclamacao: 'Reclamação',
  agendamento: 'Quer agendar',
  financeiro: 'Financeiro',
  outro: 'Outro',
};

const COR_DA_SUGESTAO: Record<string, string> = {
  quente: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  morno: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  frio: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  nao_e_lead: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
};

export function TriagemDaIa({ conversa }: { conversa: Conversa }) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const times = useDadosAtende((s) => s.times);
  const aplicarConversa = useCentral((s) => s.aplicarConversa);
  const [triagens, setTriagens] = useState<Triagem[]>([]);
  const [lead, setLead] = useState<Lead | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [timeCorrigido, setTimeCorrigido] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Recarrega quando a conversa muda de setor/estado (a triagem acabou de rodar, ou alguém corrigiu).
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    api
      .get<{ triagens: Triagem[]; lead: Lead | null }>(`/conversas/${conversa.id}/triagem`)
      .then((r) => {
        if (!vivo) return;
        setTriagens(r.triagens);
        setLead(r.lead);
      })
      .catch(() => undefined)
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [conversa.id, conversa.time_id, conversa.estado, conversa.resumo]);

  const ultima = triagens.find((t) => !t.pediu_esclarecimento) ?? triagens[0] ?? null;
  const supervisiona = pode(sessao.papel, 'conversas.supervisionar');
  const nomeDoTime = (id: string | null) => (id ? times.find((t) => t.id === id)?.nome ?? 'setor removido' : null);

  async function corrigir() {
    if (!timeCorrigido) return;
    setSalvando(true);
    try {
      const r = await api.post<{ conversa: Conversa }>(`/conversas/${conversa.id}/triagem/corrigir`, { time_id: timeCorrigido, motivo });
      aplicarConversa(r.conversa);
      setCorrigindo(false);
      setMotivo('');
      setTimeCorrigido('');
      toast.success('Setor corrigido.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível corrigir.');
    } finally {
      setSalvando(false);
    }
  }

  async function moverLead(estado: string) {
    try {
      const r = await api.patch<{ lead: Lead }>(`/conversas/${conversa.id}/lead`, { estado });
      setLead(r.lead);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível mover o lead.');
    }
  }

  const semNada = !carregando && !ultima && !lead;

  // A retomada sugerida pela IA: viva enquanto ninguém enviou nem descartou depois da sugestão.
  const sugestaoViva = Boolean(lead?.followup_sugestao && lead.followup_sugerido_em && !(lead.followup_enviado_em && lead.followup_enviado_em >= lead.followup_sugerido_em) && !(lead.followup_descartado_em && lead.followup_descartado_em >= lead.followup_sugerido_em));
  const [textoDaRetomada, setTextoDaRetomada] = useState('');
  const [retomando, setRetomando] = useState(false);
  useEffect(() => {
    if (sugestaoViva) setTextoDaRetomada(lead?.followup_sugestao ?? '');
  }, [sugestaoViva, lead?.followup_sugestao]);

  async function enviarRetomada() {
    if (!textoDaRetomada.trim()) return;
    setRetomando(true);
    try {
      const r = await api.post<{ lead: Lead }>(`/conversas/${conversa.id}/followup/enviar`, { texto: textoDaRetomada });
      setLead(r.lead);
      toast.success('Retomada enviada ao cliente.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível enviar.');
    } finally {
      setRetomando(false);
    }
  }
  async function descartarRetomada() {
    setRetomando(true);
    try {
      const r = await api.post<{ lead: Lead }>(`/conversas/${conversa.id}/followup/descartar`);
      setLead(r.lead);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível descartar.');
    } finally {
      setRetomando(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--brand)]/25 bg-[var(--brand)]/[0.04] p-3 text-sm">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--brand)]">
        <Sparkles size={11} /> Triagem da IA
      </p>

      {carregando && !ultima && <p className="text-xs text-[var(--text-muted)]">Carregando…</p>}
      {semNada && <p className="text-xs text-[var(--text-muted)]">{conversa.estado === 'nova' || conversa.estado === 'em_triagem' ? 'A IA está lendo a conversa…' : 'Esta conversa não passou pela IA (triagem desligada, ou começou pelo celular da empresa).'}</p>}

      {ultima && (
        <dl className="space-y-1 text-xs">
          <Linha rotulo="Intenção">{NOME_DA_INTENCAO[ultima.intencao ?? 'outro'] ?? ultima.intencao}</Linha>
          <Linha rotulo="Setor sugerido">
            {nomeDoTime(ultima.time_sugerido_id) ?? <span className="text-[var(--text-muted)]">nenhum</span>}
            {ultima.confianca !== null && <span className="ml-1 text-[var(--text-muted)]">({Math.round(ultima.confianca * 100)}%)</span>}
          </Linha>
          {ultima.time_corrigido_id && (
            <Linha rotulo="Corrigido para">
              <span className="text-amber-700 dark:text-amber-300">{nomeDoTime(ultima.time_corrigido_id)}</span>
            </Linha>
          )}
          <Linha rotulo="Prioridade">{ultima.prioridade}</Linha>
          {ultima.rodada > 1 && <Linha rotulo="Rodadas">{ultima.rodada} (pediu esclarecimento antes)</Linha>}
          {ultima.modelo && <Linha rotulo="Modelo">{ultima.modelo === 'palavras-chave' ? 'palavras-chave (sem IA)' : ultima.modelo}</Linha>}
        </dl>
      )}
      {sugestaoViva && conversa.estado !== 'encerrada' && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2">
          <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <Sparkles size={11} /> Retomar contato?
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">O cliente está em silêncio há mais de 24 h. A IA sugeriu esta mensagem — edite se quiser; nada sai sem você enviar.</p>
          <textarea value={textoDaRetomada} onChange={(e) => setTextoDaRetomada(e.target.value)} rows={3} maxLength={1000} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]" />
          <div className="flex gap-2">
            <button type="button" onClick={enviarRetomada} disabled={retomando || !textoDaRetomada.trim()} className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand)] px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">
              <Send size={12} /> Enviar ao cliente
            </button>
            <button type="button" onClick={descartarRetomada} disabled={retomando} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50">
              Descartar
            </button>
          </div>
        </div>
      )}
      {ultima?.resumo && <p className="mt-2 rounded-lg bg-[var(--surface)] p-2 text-xs text-[var(--text)]">{ultima.resumo}</p>}
      {ultima?.resposta_enviada && <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Disse ao cliente: “{ultima.resposta_enviada}”</p>}

      {supervisiona && ultima && conversa.estado !== 'encerrada' && (
        <div className="mt-2">
          {!corrigindo ? (
            <button type="button" onClick={() => setCorrigindo(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)] hover:underline">
              <Pencil size={12} /> Corrigir setor
            </button>
          ) : (
            <div className="space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Setor certo</p>
                <button type="button" onClick={() => setCorrigindo(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Cancelar">
                  <X size={13} />
                </button>
              </div>
              <select value={timeCorrigido} onChange={(e) => setTimeCorrigido(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]">
                <option value="">Escolha…</option>
                {times
                  .filter((t) => t.ativo && t.id !== conversa.time_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
              </select>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por quê? (opcional — ajuda a ajustar a IA)" maxLength={300} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--brand)]" />
              <button type="button" onClick={corrigir} disabled={!timeCorrigido || salvando} className="w-full rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                {salvando ? 'Corrigindo…' : 'Corrigir'}
              </button>
            </div>
          )}
        </div>
      )}

      {(lead || ultima) && (
        <div className="mt-3 border-t border-[var(--border)] pt-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Lead</p>
            {lead?.sugestao_ia && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_DA_SUGESTAO[lead.sugestao_ia] ?? ''}`}>IA: {NOME_DA_SUGESTAO[lead.sugestao_ia]}</span>}
          </div>
          <select value={lead?.estado ?? 'novo'} onChange={(e) => moverLead(e.target.value)} disabled={conversa.estado === 'encerrada' && !lead} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs font-semibold text-[var(--text)]">
            {ESTADOS_DO_LEAD.map((e) => (
              <option key={e} value={e}>
                {NOME_DO_ESTADO_DO_LEAD[e]}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--text-muted)]">{rotulo}</dt>
      <dd className="text-right font-semibold text-[var(--text)]">{children}</dd>
    </div>
  );
}
