import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Pencil, X, Send, Target } from 'lucide-react';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral } from '../../store/central';
import { useDadosAtende } from '../../store/dados';
import { useSessaoAtende } from '../../store/sessao';
import { pode } from '../../../shared/papeis';
import { ESTADOS_DO_LEAD, NOME_DO_ESTADO_DO_LEAD, NOME_DA_SUGESTAO, type Conversa, type Lead, type Triagem } from '../../../shared/tipos';
import { BlocoIa, Confianca, PensandoIa, SeloIa, TituloIa } from '../../ui/Ia';
import { Etiqueta, type TomDaEtiqueta } from '../../ui/Etiqueta';
import { Botao } from '../../ui/Botao';
import { Selecao, ESTILO_DO_CAMPO } from '../../ui/Campo';
import { Rotulo } from '../../ui/Cartao';

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

const TOM_DA_SUGESTAO: Record<string, TomDaEtiqueta> = { quente: 'vermelho', morno: 'ambar', frio: 'azul', nao_e_lead: 'cinza' };
const COR_DO_LEAD: Record<string, string> = { novo: '#3b82f6', em_atendimento: '#7c3aed', em_negociacao: '#d97706', aguardando_cliente: '#94a3b8', convertido: '#16a34a', perdido: '#e11d48' };

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
  const nomeDoTime = (id: string | null) => (id ? (times.find((t) => t.id === id)?.nome ?? 'setor removido') : null);

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
  const lendo = conversa.estado === 'nova' || conversa.estado === 'em_triagem';

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

  const estadoDoLead = lead?.estado ?? 'novo';
  const indiceDoLead = ESTADOS_DO_LEAD.indexOf(estadoDoLead as (typeof ESTADOS_DO_LEAD)[number]);

  return (
    <BlocoIa>
      <TituloIa>Triagem da IA</TituloIa>

      {carregando && !ultima && <p className="mt-2 text-xs text-[var(--text-muted)]">Carregando…</p>}
      {semNada && (lendo ? <PensandoIa className="mt-2" texto="IA lendo a conversa" /> : <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Esta conversa não passou pela IA (triagem desligada, ou começou pelo celular da empresa).</p>)}

      {ultima && (
        <dl className="mt-2.5 space-y-1.5 text-xs">
          <Linha rotulo="Intenção">{NOME_DA_INTENCAO[ultima.intencao ?? 'outro'] ?? ultima.intencao}</Linha>
          <Linha rotulo="Setor sugerido">
            <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
              {nomeDoTime(ultima.time_sugerido_id) ?? <span className="font-normal text-[var(--text-muted)]">nenhum</span>}
              {ultima.confianca !== null && <Confianca valor={ultima.confianca} />}
            </span>
          </Linha>
          {ultima.time_corrigido_id && (
            <Linha rotulo="Corrigido para">
              <span className="text-amber-700">{nomeDoTime(ultima.time_corrigido_id)}</span>
            </Linha>
          )}
          <Linha rotulo="Prioridade">
            <span className="capitalize">{ultima.prioridade}</span>
          </Linha>
          {ultima.rodada > 1 && <Linha rotulo="Rodadas">{ultima.rodada} (pediu esclarecimento antes)</Linha>}
          {ultima.modelo && <Linha rotulo="Modelo">{ultima.modelo === 'palavras-chave' ? 'palavras-chave (sem IA)' : ultima.modelo}</Linha>}
        </dl>
      )}
      {ultima?.resumo && (
        <div className="mt-2.5 rounded-lg bg-[var(--bg)] p-2.5">
          <Rotulo className="mb-1 text-[10px]">Resumo para o atendente</Rotulo>
          <p className="text-xs leading-5 text-[var(--text)]">{ultima.resumo}</p>
        </div>
      )}
      {ultima?.resposta_enviada && <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-muted)]">Disse ao cliente: “{ultima.resposta_enviada}”</p>}

      {sugestaoViva && conversa.estado !== 'encerrada' && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
            <SeloIa>Sugestão da IA</SeloIa> Retomar contato?
          </p>
          <p className="text-[11px] leading-5 text-amber-900/80">O cliente está em silêncio há mais de 24 h. A IA sugeriu esta mensagem — edite se quiser; nada sai sem você enviar.</p>
          <textarea value={textoDaRetomada} onChange={(e) => setTextoDaRetomada(e.target.value)} rows={3} maxLength={1000} className={`${ESTILO_DO_CAMPO} text-xs`} />
          <div className="flex gap-2">
            <Botao tamanho="xs" icone={<Send size={12} />} onClick={enviarRetomada} disabled={retomando || !textoDaRetomada.trim()}>
              Enviar ao cliente
            </Botao>
            <Botao tamanho="xs" variante="fantasma" onClick={descartarRetomada} disabled={retomando}>
              Descartar
            </Botao>
          </div>
        </div>
      )}

      {supervisiona && ultima && conversa.estado !== 'encerrada' && (
        <div className="mt-2.5">
          {!corrigindo ? (
            <button type="button" onClick={() => setCorrigindo(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)] hover:underline">
              <Pencil size={12} /> Corrigir setor
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
              <div className="flex items-center justify-between">
                <Rotulo className="text-[10px]">Setor certo</Rotulo>
                <button type="button" onClick={() => setCorrigindo(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Cancelar">
                  <X size={13} />
                </button>
              </div>
              <Selecao value={timeCorrigido} onChange={(e) => setTimeCorrigido(e.target.value)} className="text-xs">
                <option value="">Escolha…</option>
                {times
                  .filter((t) => t.ativo && t.id !== conversa.time_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
              </Selecao>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por quê? (opcional — ajuda a ajustar a IA)" maxLength={300} className={`${ESTILO_DO_CAMPO} py-2 text-xs`} />
              <Botao largo tamanho="sm" onClick={corrigir} disabled={!timeCorrigido} carregando={salvando}>
                Corrigir
              </Botao>
            </div>
          )}
        </div>
      )}

      {(lead || ultima) && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Rotulo className="flex items-center gap-1">
              <Target size={11} /> Lead no funil
            </Rotulo>
            {lead?.sugestao_ia && (
              <Etiqueta tom={TOM_DA_SUGESTAO[lead.sugestao_ia] ?? 'cinza'} title="Sugestão da IA">
                IA: {NOME_DA_SUGESTAO[lead.sugestao_ia]}
              </Etiqueta>
            )}
          </div>
          {/* A régua do funil: em que etapa o lead está. */}
          <ol className="mb-2 flex items-center gap-1" aria-hidden>
            {ESTADOS_DO_LEAD.map((e, i) => (
              <li key={e} className="h-1.5 flex-1 rounded-full transition-colors" style={{ backgroundColor: i <= indiceDoLead ? COR_DO_LEAD[estadoDoLead] : 'var(--bg-2)' }} title={NOME_DO_ESTADO_DO_LEAD[e]} />
            ))}
          </ol>
          <Selecao value={estadoDoLead} onChange={(e) => moverLead(e.target.value)} disabled={conversa.estado === 'encerrada' && !lead} className="text-xs font-semibold" aria-label="Etapa do lead">
            {ESTADOS_DO_LEAD.map((e) => (
              <option key={e} value={e}>
                {NOME_DO_ESTADO_DO_LEAD[e]}
              </option>
            ))}
          </Selecao>
          {lead?.valor ? <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Valor: {lead.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p> : null}
        </div>
      )}
    </BlocoIa>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="shrink-0 text-[var(--text-muted)]">{rotulo}</dt>
      <dd className="min-w-0 text-right font-semibold text-[var(--text)]">{children}</dd>
    </div>
  );
}
