import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral } from '../../store/central';
import { useDadosAtende } from '../../store/dados';
import { useSessaoAtende } from '../../store/sessao';
import { presencaEfetiva, NOME_DA_PRESENCA } from '../../../shared/presenca';
import type { Conversa } from '../../../shared/tipos';
import { nomeDoCliente } from './util';

/**
 * Transferir uma conversa: para uma pessoa (ela passa a atender) ou para
 * um setor (volta para a fila daquele time). Mostra quem está online para
 * a escolha ser informada — mas deixa transferir para quem está fora
 * também (a pessoa pega quando voltar).
 */
export function Transferir({ conversa, aberto, onFechar }: { conversa: Conversa; aberto: boolean; onFechar: () => void }) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const equipe = useDadosAtende((s) => s.equipe);
  const times = useDadosAtende((s) => s.times);
  const presenca = useCentral((s) => s.presenca);
  const aplicarConversa = useCentral((s) => s.aplicarConversa);
  const abrir = useCentral((s) => s.abrir);
  const [modo, setModo] = useState<'pessoa' | 'setor'>('pessoa');
  const [pessoa, setPessoa] = useState('');
  const [setor, setSetor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const agora = Date.now();
  const pessoas = equipe
    .filter((f) => f.ativo && f.id !== conversa.atendente_id)
    .map((f) => ({ ...f, estado: presencaEfetiva(presenca[f.id] ?? f, agora) }))
    .sort((a, b) => (a.estado === b.estado ? a.nome.localeCompare(b.nome) : a.estado === 'online' ? -1 : b.estado === 'online' ? 1 : a.estado === 'ausente' ? -1 : 1));

  async function confirmar() {
    setEnviando(true);
    try {
      const corpo = modo === 'pessoa' ? { atendente_id: Number(pessoa), motivo } : { time_id: setor, motivo };
      const r = await api.post<{ conversa: Conversa }>(`/conversas/${conversa.id}/transferir`, corpo);
      aplicarConversa(r.conversa);
      if (useCentral.getState().selecionada === conversa.id) void abrir(conversa.id);
      toast.success(modo === 'pessoa' ? 'Conversa transferida.' : 'Conversa na fila do setor.');
      onFechar();
      setMotivo('');
      setPessoa('');
      setSetor('');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível transferir.');
    } finally {
      setEnviando(false);
    }
  }

  const pronto = modo === 'pessoa' ? Boolean(pessoa) : Boolean(setor);
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title="Transferir conversa"
      subtitle={`${nomeDoCliente(conversa.cliente)} · ${conversa.assunto ?? 'sem assunto'}`}
      maxWidth="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button icon={<ArrowRightLeft size={15} />} loading={enviando} disabled={!pronto} onClick={confirmar}>
            Transferir
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-[var(--bg-2)] p-1">
          {(['pessoa', 'setor'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModo(m)} className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${modo === m ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]'}`}>
              {m === 'pessoa' ? 'Para uma pessoa' : 'Para um setor'}
            </button>
          ))}
        </div>

        {modo === 'pessoa' ? (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {pessoas.length === 0 && <li className="py-4 text-center text-sm text-[var(--text-muted)]">Ninguém mais na equipe.</li>}
            {pessoas.map((f) => (
              <li key={f.id}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${pessoa === String(f.id) ? 'border-[var(--brand)] bg-[var(--brand)]/[0.06]' : 'border-[var(--border)] hover:bg-[var(--bg-2)]'}`}>
                  <input type="radio" name="pessoa" value={f.id} checked={pessoa === String(f.id)} onChange={() => setPessoa(String(f.id))} className="accent-[var(--brand)]" />
                  <Bolinha estado={f.estado} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">
                      {f.nome}
                      {f.id === sessao.id ? ' (você)' : ''}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      {NOME_DA_PRESENCA[f.estado]}
                      {f.times.length ? ` · ${f.times.map((t) => times.find((x) => x.id === t)?.nome).filter(Boolean).join(', ')}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-1">
            {times.filter((t) => t.ativo).length === 0 && <li className="py-4 text-center text-sm text-[var(--text-muted)]">A empresa não tem setores.</li>}
            {times
              .filter((t) => t.ativo)
              .map((t) => (
                <li key={t.id}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${setor === t.id ? 'border-[var(--brand)] bg-[var(--brand)]/[0.06]' : 'border-[var(--border)] hover:bg-[var(--bg-2)]'}`}>
                    <input type="radio" name="setor" value={t.id} checked={setor === t.id} onChange={() => setSetor(t.id)} className="accent-[var(--brand)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[var(--text)]">{t.nome}</span>
                      <span className="block text-[11px] text-[var(--text-muted)]">{t.membros.length} {t.membros.length === 1 ? 'pessoa' : 'pessoas'}{t.id === conversa.time_id ? ' · setor atual' : ''}</span>
                    </span>
                  </label>
                </li>
              ))}
          </ul>
        )}

        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional — fica no histórico e na conversa)" maxLength={300} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]" />
      </div>
    </Modal>
  );
}

export function Bolinha({ estado, tamanho = 'h-2.5 w-2.5' }: { estado: 'online' | 'ausente' | 'offline'; tamanho?: string }) {
  const cor = estado === 'online' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : estado === 'ausente' ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600';
  return <span className={`inline-block shrink-0 rounded-full ${tamanho} ${cor}`} title={NOME_DA_PRESENCA[estado]} />;
}
