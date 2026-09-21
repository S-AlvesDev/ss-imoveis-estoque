import { useEffect, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { api } from '../../lib/api';
import { useDadosAtende } from '../../store/dados';
import { NOME_DO_ESTADO_DO_LEAD, type Conversa, type EstadoDoLead } from '../../../shared/tipos';
import { Rotulo } from '../../ui/Cartao';
import { Esqueleto } from '../../ui/Estados';

/**
 * A auditoria de uma conversa, dobrada no painel do cliente: quem abriu,
 * o que a IA decidiu, quem assumiu, transferiu, orientou, corrigiu,
 * encerrou. Vem de atende_eventos — o mesmo registro que o dashboard usa.
 */
interface Evento {
  id: string;
  tipo: string;
  usuario_id: number | null;
  dados: Record<string, any> | null;
  criado_em: string;
}

/** Os eventos da IA ganham o ponto roxo; os do sistema/SLA, âmbar; o resto, cinza. */
function corDoEvento(tipo: string): string {
  if (tipo === 'triagem' || tipo.startsWith('followup') || tipo === 'avaliacao_pedida') return 'bg-[var(--brand)]';
  if (tipo.startsWith('sla')) return 'bg-amber-400';
  if (tipo === 'encerrada' || tipo === 'avaliada') return 'bg-emerald-500';
  return 'bg-[var(--border-strong)]';
}

export function Historico({ conversa }: { conversa: Conversa }) {
  const equipe = useDadosAtende((s) => s.equipe);
  const times = useDadosAtende((s) => s.times);
  const [aberto, setAberto] = useState(false);
  const [eventos, setEventos] = useState<Evento[] | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    api
      .get<{ eventos: Evento[] }>(`/conversas/${conversa.id}/eventos`)
      .then((r) => vivo && setEventos(r.eventos))
      .catch(() => vivo && setEventos([]));
    return () => {
      vivo = false;
    };
  }, [aberto, conversa.id, conversa.atualizado_em]);

  const nome = (id: number | null | undefined) => (id ? (equipe.find((f) => f.id === id)?.nome ?? `#${id}`) : null);
  const time = (id: string | null | undefined) => (id ? (times.find((t) => t.id === id)?.nome ?? 'setor removido') : null);

  function descrever(e: Evento): string {
    const d = e.dados ?? {};
    const quem = nome(e.usuario_id);
    switch (e.tipo) {
      case 'aberta':
        return d.por === 'aparelho' ? 'Aberta pela empresa, pelo celular' : 'Aberta pelo cliente';
      case 'triagem':
        if (d.desfecho === 'falhou') return `Triagem da IA falhou${d.erro ? ` (${d.erro})` : ''}; foi para a fila geral`;
        if (d.desfecho === 'esclarecendo') return 'IA pediu esclarecimento ao cliente';
        return `IA classificou: ${time(d.time_id) ?? 'sem setor'}, prioridade ${d.prioridade}${typeof d.confianca === 'number' ? ` (${Math.round(d.confianca * 100)}%)` : ''}`;
      case 'atribuida':
        return `${d.por === 'ia' ? 'IA atribuiu' : `${quem ?? 'Alguém'} atribuiu`} a ${nome(d.para) ?? 'alguém'}`;
      case 'assumida':
        return `${quem ?? 'Alguém'} assumiu${d.ao_responder ? ' ao responder' : ''}`;
      case 'transferida':
        if (d.para?.atendente_id) return `${quem ?? 'Alguém'} transferiu para ${nome(d.para.atendente_id)}${d.motivo ? ` — ${d.motivo}` : ''}`;
        if (d.para?.time_id) return `${quem ?? 'Alguém'} transferiu para a fila de ${time(d.para.time_id)}${d.motivo ? ` — ${d.motivo}` : ''}`;
        return `${quem ?? 'Alguém'} transferiu${d.para ? ` para ${nome(d.para)}` : ''}`;
      case 'triagem_corrigida':
        return `${quem ?? 'Alguém'} corrigiu o setor: ${time(d.de) ?? 'nenhum'} → ${time(d.para)}${d.motivo ? ` — ${d.motivo}` : ''}`;
      case 'orientacao':
        return `${quem ?? 'Supervisor'} orientou ${nome(d.para) ?? 'o atendente'} (nota interna)`;
      case 'lead_alterado': {
        const nome = (v: string) => NOME_DO_ESTADO_DO_LEAD[v as EstadoDoLead] ?? v;
        return `${quem ?? 'Alguém'} moveu o lead: ${nome(d.de ?? 'novo')} → ${nome(d.para)}`;
      }
      case 'encerrada':
        return `${quem ?? 'Alguém'} encerrou${d.motivo ? ` — ${d.motivo}` : ''}`;
      case 'contato_fundido':
        return `${quem ?? 'Alguém'} fundiu o contato ${d.de_telefone ? `+${d.de_telefone}` : ''} neste (+${d.em_telefone ?? ''})`;
      case 'fio_fundido':
        return `Um atendimento anterior deste contato${d.aberta_em ? ` (${new Date(d.aberta_em).toLocaleDateString('pt-BR')})` : ''} passou a fazer parte desta conversa`;
      case 'avaliacao_pedida':
        return `${quem ?? 'Alguém'} encerrou com a despedida da IA e pediu a avaliação`;
      case 'avaliada':
        return `Cliente avaliou o atendimento: ${d.nota}/10${d.comentario ? ` — “${d.comentario}”` : ''}`;
      case 'sla_aviso':
        return `SLA: ${d.minutos} min sem resposta — quem atende e quem supervisiona foram avisados (limite ${d.limite} min)`;
      case 'sla_escalonada':
        return `SLA: ${d.minutos} min sem resposta — foi para a fila geral com prioridade alta${time(d.de_time) ? ` (saiu de ${time(d.de_time)})` : ''}`;
      case 'followup_sugerido':
        return `IA sugeriu uma mensagem de retomada (cliente em silêncio há ${d.horas} h)`;
      case 'followup_enviado':
        return `${quem ?? 'Alguém'} enviou a retomada${d.editado ? ' (editada)' : ' sugerida pela IA'}`;
      case 'followup_descartado':
        return `${quem ?? 'Alguém'} descartou a sugestão de retomada`;
      case 'reaberta':
        if (d.por === 'cliente') return 'Reaberta pelo cliente (escreveu de novo)';
        if (d.por === 'aparelho') return 'Reaberta pela empresa, pelo celular';
        return `${quem ?? 'Alguém'} reabriu${d.ao_responder ? ' ao responder' : ''}`;
      default:
        return e.tipo;
    }
  }

  return (
    <section>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-center justify-between rounded-lg py-1 text-left transition-colors hover:text-[var(--text)]">
        <Rotulo className="flex items-center gap-1">
          <History size={11} /> Histórico
        </Rotulo>
        <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <ol className="mt-2 space-y-2.5 border-l border-[var(--border)] pl-3.5">
          {eventos === null && (
            <>
              <li>
                <Esqueleto className="h-3 w-3/4" />
              </li>
              <li>
                <Esqueleto className="h-3 w-1/2" />
              </li>
            </>
          )}
          {eventos?.length === 0 && <li className="text-xs text-[var(--text-muted)]">Nada registrado.</li>}
          {eventos?.map((e) => (
            <li key={e.id} className="relative text-xs">
              <span className={`absolute -left-[19px] top-1.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface)] ${corDoEvento(e.tipo)}`} />
              <span className="block leading-5 text-[var(--text)]">{descrever(e)}</span>
              <span className="block text-[10px] tabular-nums text-[var(--text-muted)]">{new Date(e.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
