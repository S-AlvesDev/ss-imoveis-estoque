import { useEffect, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { api } from '../../lib/api';
import { useDadosAtende } from '../../store/dados';
import type { Conversa } from '../../../shared/tipos';

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

  const nome = (id: number | null | undefined) => (id ? equipe.find((f) => f.id === id)?.nome ?? `#${id}` : null);
  const time = (id: string | null | undefined) => (id ? times.find((t) => t.id === id)?.nome ?? 'setor removido' : null);

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
      case 'lead_alterado':
        return `${quem ?? 'Alguém'} moveu o lead: ${d.de ?? 'novo'} → ${d.para}`;
      case 'encerrada':
        return `${quem ?? 'Alguém'} encerrou${d.motivo ? ` — ${d.motivo}` : ''}`;
      case 'reaberta':
        return `${quem ?? 'Alguém'} reabriu${d.ao_responder ? ' ao responder' : ''}`;
      default:
        return e.tipo;
    }
  }

  return (
    <section>
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)]">
        <span className="inline-flex items-center gap-1">
          <History size={11} /> Histórico
        </span>
        <ChevronDown size={13} className={`transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <ol className="mt-2 space-y-1.5 border-l border-[var(--border)] pl-3">
          {eventos === null && <li className="text-xs text-[var(--text-muted)]">Carregando…</li>}
          {eventos?.length === 0 && <li className="text-xs text-[var(--text-muted)]">Nada registrado.</li>}
          {eventos?.map((e) => (
            <li key={e.id} className="relative text-xs">
              <span className="absolute -left-[15px] top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
              <span className="block text-[var(--text)]">{descrever(e)}</span>
              <span className="block text-[10px] text-[var(--text-muted)]">{new Date(e.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
