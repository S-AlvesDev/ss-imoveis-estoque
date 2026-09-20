import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, UserRound, UsersRound } from 'lucide-react';
import { Botao } from '../../ui/Botao';
import { Modal } from '../../ui/Modal';
import { Avatar } from '../../ui/Avatar';
import { Segmentado } from '../../ui/Controles';
import { ESTILO_DO_CAMPO } from '../../ui/Campo';
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
  const opcao = (ativa: boolean) => `flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${ativa ? 'border-[var(--brand)] bg-[var(--brand-soft)]/60' : 'border-[var(--border)] hover:bg-[var(--bg)]'}`;
  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo="Transferir conversa"
      descricao={`${nomeDoCliente(conversa.cliente)} · ${conversa.assunto ?? 'sem assunto'}`}
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao icone={<ArrowRightLeft size={15} />} carregando={enviando} disabled={!pronto} onClick={confirmar}>
            Transferir
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <Segmentado
          largo
          valor={modo}
          onChange={setModo}
          opcoes={[
            { valor: 'pessoa', rotulo: 'Para uma pessoa', icone: <UserRound size={14} /> },
            { valor: 'setor', rotulo: 'Para um setor', icone: <UsersRound size={14} /> },
          ]}
        />

        {modo === 'pessoa' ? (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {pessoas.length === 0 && <li className="py-4 text-center text-sm text-[var(--text-muted)]">Ninguém mais na equipe.</li>}
            {pessoas.map((f) => (
              <li key={f.id}>
                <label className={opcao(pessoa === String(f.id))}>
                  <input type="radio" name="pessoa" value={f.id} checked={pessoa === String(f.id)} onChange={() => setPessoa(String(f.id))} className="sr-only" />
                  <Avatar nome={f.nome} tamanho={34} presenca={f.estado} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">
                      {f.nome}
                      {f.id === sessao.id ? ' (você)' : ''}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--text-muted)]">
                      {NOME_DA_PRESENCA[f.estado]}
                      {f.times.length ? ` · ${f.times.map((t) => times.find((x) => x.id === t)?.nome).filter(Boolean).join(', ')}` : ''}
                    </span>
                  </span>
                  {pessoa === String(f.id) && <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-1.5">
            {times.filter((t) => t.ativo).length === 0 && <li className="py-4 text-center text-sm text-[var(--text-muted)]">A empresa não tem setores.</li>}
            {times
              .filter((t) => t.ativo)
              .map((t) => (
                <li key={t.id}>
                  <label className={opcao(setor === t.id)}>
                    <input type="radio" name="setor" value={t.id} checked={setor === t.id} onChange={() => setSetor(t.id)} className="sr-only" />
                    <Avatar nome={t.nome} tamanho={34} quadrado />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[var(--text)]">{t.nome}</span>
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        {t.membros.length} {t.membros.length === 1 ? 'pessoa' : 'pessoas'}
                        {t.id === conversa.time_id ? ' · setor atual' : ''}
                      </span>
                    </span>
                    {setor === t.id && <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />}
                  </label>
                </li>
              ))}
          </ul>
        )}

        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional — fica no histórico e na conversa)" maxLength={300} className={ESTILO_DO_CAMPO} />
      </div>
    </Modal>
  );
}

export function Bolinha({ estado, tamanho = 'h-2.5 w-2.5' }: { estado: 'online' | 'ausente' | 'offline'; tamanho?: string }) {
  const cor = estado === 'online' ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]' : estado === 'ausente' ? 'bg-amber-400' : 'bg-slate-300';
  return <span className={`inline-block shrink-0 rounded-full ${tamanho} ${cor}`} title={NOME_DA_PRESENCA[estado]} />;
}
