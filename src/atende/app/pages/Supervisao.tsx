import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRightLeft, Clock, Eye, Hand, Inbox, MessageSquareText, Users, Wifi } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { Modal } from '@/shared/ui/Modal';
import { StatCard } from '@/shared/ui/StatCard';
import { api, ErroDaApi } from '../lib/api';
import { useCentral } from '../store/central';
import { useDadosAtende } from '../store/dados';
import { useSessaoAtende } from '../store/sessao';
import { TELAS, useRotaAtende } from '../router';
import { presencaEfetiva, NOME_DA_PRESENCA } from '../../shared/presenca';
import { NOME_DO_ESTADO, type Conversa, type Funcionario, type Mensagem, type Presenca } from '../../shared/tipos';
import { Transferir, Bolinha } from './central/Transferir';
import { nomeDoCliente, iniciais, duracao, COR_DO_ESTADO } from './central/util';

/**
 * A Supervisão: a equipe agora, em tempo real, com os mesmos dados que a
 * Central sincroniza a cada 4 s. Quem está online, o que está na fila, quem
 * está esperando resposta há quanto tempo — e as alavancas: abrir, assumir,
 * transferir, orientar (nota interna que só a equipe vê).
 *
 * Nada aqui é estimado: cada número é contagem sobre as conversas abertas
 * que a pessoa vê (os times que supervisiona; tudo, se admin).
 */
const ESPERA_ALERTA_MS = 5 * 60_000;

export function Supervisao() {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const ir = useRotaAtende((s) => s.ir);
  const equipe = useDadosAtende((s) => s.equipe);
  const times = useDadosAtende((s) => s.times);
  const conversasMap = useCentral((s) => s.conversas);
  const presenca = useCentral((s) => s.presenca);
  const [agora, setAgora] = useState(Date.now());
  const [transferindo, setTransferindo] = useState<Conversa | null>(null);
  const [orientando, setOrientando] = useState<Conversa | null>(null);

  // O sync roda no Shell; aqui só a lista inteira das abertas, uma vez.
  const carregarLista = useCentral((s) => s.carregarLista);
  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // O alcance: admin vê tudo; supervisor, os times dele e as pessoas neles.
  const meusTimes = useMemo(() => (sessao.papel === 'admin' ? times.filter((t) => t.ativo) : times.filter((t) => t.ativo && t.supervisores.includes(sessao.id))), [times, sessao]);
  const pessoas = useMemo(() => {
    const ids = new Set(meusTimes.flatMap((t) => t.membros));
    return equipe.filter((f) => f.ativo && (sessao.papel === 'admin' || ids.has(f.id))).map((f) => ({ ...f, estado: presencaEfetiva(presenca[f.id] ?? f, agora) }));
  }, [equipe, meusTimes, presenca, sessao, agora]);

  const abertas = useMemo(() => Object.values(conversasMap).filter((c) => c.estado !== 'encerrada'), [conversasMap]);
  const naFila = abertas.filter((c) => c.estado === 'na_fila' || c.estado === 'nova' || c.estado === 'em_triagem');
  const emAtendimento = abertas.filter((c) => c.estado === 'em_atendimento');
  const esperando = useMemo(
    () =>
      abertas
        .filter((c) => c.ultima_mensagem_de === 'cliente' && c.ultima_mensagem_do_cliente_em)
        .map((c) => ({ c, espera: agora - Date.parse(c.ultima_mensagem_do_cliente_em!) }))
        .sort((a, b) => b.espera - a.espera),
    [abertas, agora],
  );
  const emAlerta = esperando.filter((e) => e.espera >= ESPERA_ALERTA_MS);
  const online = pessoas.filter((p) => p.estado === 'online').length;

  async function assumir(c: Conversa) {
    try {
      const r = await api.post<{ conversa: Conversa }>(`/conversas/${c.id}/assumir`);
      useCentral.getState().aplicarConversa(r.conversa);
      toast.success('Conversa é sua.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível assumir.');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Supervisão</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{sessao.papel === 'admin' ? 'Toda a equipe, agora.' : `Seus times, agora: ${meusTimes.map((t) => t.nome).join(', ') || 'nenhum time para supervisionar'}.`} Atualiza sozinho.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Online agora" value={online} icon={<Wifi size={18} />} accent="green" sublabel={`de ${pessoas.length} na equipe`} />
        <StatCard label="Na fila" value={naFila.length} icon={<Inbox size={18} />} accent="amber" sublabel={naFila.length ? `mais antiga há ${duracao(agora - Date.parse(maisAntiga(naFila)))}` : 'ninguém esperando'} />
        <StatCard label="Em atendimento" value={emAtendimento.length} icon={<MessageSquareText size={18} />} accent="brand" sublabel={`${abertas.filter((c) => c.estado === 'aguardando_cliente').length} aguardando o cliente`} />
        <StatCard label="Sem resposta há 5+ min" value={emAlerta.length} icon={<AlertTriangle size={18} />} accent={emAlerta.length ? 'red' : 'slate'} sublabel={emAlerta.length ? `a mais antiga há ${duracao(emAlerta[0].espera)}` : 'todo mundo respondido'} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <Card className="p-5">
          <CardHeader icon={<Clock size={14} />} title="Cliente esperando resposta" actions={<span className="text-xs text-[var(--text-muted)]">{esperando.length} {esperando.length === 1 ? 'conversa' : 'conversas'}</span>} />
          {esperando.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">Nenhum cliente esperando. A última palavra é da equipe em todas as conversas abertas.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border)]">
              {esperando.slice(0, 30).map(({ c, espera }) => {
                const atendente = c.atendente_id ? equipe.find((f) => f.id === c.atendente_id) : null;
                const time = c.time_id ? times.find((t) => t.id === c.time_id)?.nome : null;
                const alerta = espera >= ESPERA_ALERTA_MS;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${alerta ? 'bg-rose-500/15 text-rose-600' : 'bg-[var(--brand)]/12 text-[var(--brand)]'}`}>{iniciais(nomeDoCliente(c.cliente))}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-bold text-[var(--text)]">{nomeDoCliente(c.cliente)}</span>
                        <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_DO_ESTADO[c.estado]}`}>{NOME_DO_ESTADO[c.estado]}</span>
                        {c.prioridade === 'alta' || c.prioridade === 'urgente' ? <span className="shrink-0 whitespace-nowrap rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-600">{c.prioridade}</span> : null}
                      </span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">
                        {[time, atendente ? `com ${atendente.nome}` : c.estado === 'na_fila' ? 'sem atendente' : null, c.assunto].filter(Boolean).join(' · ') || c.ultima_mensagem_texto}
                      </span>
                    </span>
                    <span className={`shrink-0 text-sm font-extrabold tabular-nums ${alerta ? 'text-rose-600' : 'text-[var(--text)]'}`}>{duracao(espera)}</span>
                    {/* No celular, os botões descem para a linha de baixo, alinhados ao texto. */}
                    <span className="flex w-full shrink-0 gap-1 pl-12 sm:w-auto sm:pl-0">
                      <Button size="sm" variant="outline" icon={<Eye size={13} />} onClick={() => ir(TELAS.central, c.id)}>
                        Abrir
                      </Button>
                      {c.atendente_id !== sessao.id && (
                        <Button size="sm" variant="ghost" icon={<Hand size={13} />} onClick={() => assumir(c)} title="Assumir">
                          <span className="sr-only">Assumir</span>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon={<ArrowRightLeft size={13} />} onClick={() => setTransferindo(c)} title="Transferir">
                        <span className="sr-only">Transferir</span>
                      </Button>
                      {c.atendente_id && c.atendente_id !== sessao.id && (
                        <Button size="sm" variant="ghost" icon={<MessageSquareText size={13} />} onClick={() => setOrientando(c)} title="Orientar (nota interna)">
                          <span className="sr-only">Orientar</span>
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader icon={<Users size={14} />} title="Equipe" actions={<span className="text-xs text-[var(--text-muted)]">{online} online</span>} />
            {pessoas.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">Nenhuma pessoa nos seus times.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {[...pessoas].sort(porPresenca).map((p) => (
                  <LinhaDaPessoa key={p.id} pessoa={p} estado={p.estado} conversas={abertas} agora={agora} eu={sessao.id} />
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <CardHeader icon={<Inbox size={14} />} title="Fila por setor" />
            <ul className="mt-3 space-y-1.5">
              {meusTimes.map((t) => {
                const fila = naFila.filter((c) => c.time_id === t.id);
                return <LinhaDaFila key={t.id} nome={t.nome} fila={fila} agora={agora} membrosOnline={pessoas.filter((p) => t.membros.includes(p.id) && p.estado === 'online').length} />;
              })}
              {(sessao.papel === 'admin' || naFila.some((c) => !c.time_id)) && <LinhaDaFila nome="Sem setor (fila geral)" fila={naFila.filter((c) => !c.time_id)} agora={agora} membrosOnline={null} />}
            </ul>
          </Card>
        </div>
      </div>

      {transferindo && <Transferir conversa={transferindo} aberto onFechar={() => setTransferindo(null)} />}
      {orientando && <Orientar conversa={orientando} onFechar={() => setOrientando(null)} />}
    </div>
  );
}

function porPresenca(a: { estado: Presenca; nome: string }, b: { estado: Presenca; nome: string }) {
  const ordem: Record<Presenca, number> = { online: 0, ausente: 1, offline: 2 };
  return ordem[a.estado] - ordem[b.estado] || a.nome.localeCompare(b.nome);
}

function LinhaDaPessoa({ pessoa, estado, conversas, agora, eu }: { pessoa: Funcionario; estado: Presenca; conversas: Conversa[]; agora: number; eu: number }) {
  const minhas = conversas.filter((c) => c.atendente_id === pessoa.id);
  const esperando = minhas.filter((c) => c.ultima_mensagem_de === 'cliente' && c.ultima_mensagem_do_cliente_em);
  const maisEsperando = esperando.length ? Math.max(...esperando.map((c) => agora - Date.parse(c.ultima_mensagem_do_cliente_em!))) : 0;
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--bg-2)]">
      <Bolinha estado={estado} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--text)]">
          {pessoa.nome}
          {pessoa.id === eu ? ' (você)' : ''}
        </span>
        <span className="block text-[11px] text-[var(--text-muted)]">
          {NOME_DA_PRESENCA[estado]}
          {estado === 'offline' && pessoa.presenca_em ? ` · visto ${new Date(pessoa.presenca_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      </span>
      <span className="text-right text-xs">
        <span className="block font-extrabold tabular-nums text-[var(--text)]">{minhas.length}</span>
        <span className="block text-[10px] text-[var(--text-muted)]">{minhas.length === 1 ? 'conversa' : 'conversas'}</span>
      </span>
      <span className="w-16 text-right text-xs">
        {esperando.length ? (
          <>
            <span className={`block font-extrabold tabular-nums ${maisEsperando >= ESPERA_ALERTA_MS ? 'text-rose-600' : 'text-[var(--text)]'}`}>{duracao(maisEsperando)}</span>
            <span className="block text-[10px] text-[var(--text-muted)]">{esperando.length} sem resp.</span>
          </>
        ) : (
          <span className="block text-[10px] text-[var(--text-muted)]">em dia</span>
        )}
      </span>
    </li>
  );
}

function LinhaDaFila({ nome, fila, agora, membrosOnline }: { nome: string; fila: Conversa[]; agora: number; membrosOnline: number | null }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--text)]">{nome}</span>
        <span className="block text-[11px] text-[var(--text-muted)]">{membrosOnline === null ? 'qualquer um pode pegar' : `${membrosOnline} online no setor`}</span>
      </span>
      <span className="text-right">
        <span className={`block text-lg font-extrabold tabular-nums ${fila.length ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{fila.length}</span>
        <span className="block text-[10px] text-[var(--text-muted)]">{fila.length ? `há ${duracao(agora - Date.parse(maisAntiga(fila)))}` : 'vazia'}</span>
      </span>
    </li>
  );
}

/** Orientação: uma nota interna na conversa de outra pessoa. Só a equipe vê; fica na auditoria. */
function Orientar({ conversa, onFechar }: { conversa: Conversa; onFechar: () => void }) {
  const equipe = useDadosAtende((s) => s.equipe);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const atendente = equipe.find((f) => f.id === conversa.atendente_id)?.nome ?? 'o atendente';

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const m = await api.post<{ mensagem: Mensagem }>(`/conversas/${conversa.id}/notas`, { texto });
      useCentral.getState().aplicarMensagem(m.mensagem);
      toast.success(`Orientação enviada para ${atendente}.`);
      onFechar();
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      title={`Orientar ${atendente}`}
      subtitle={`Nota interna na conversa com ${nomeDoCliente(conversa.cliente)}. O cliente não vê.`}
      maxWidth="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button icon={<MessageSquareText size={15} />} loading={enviando} disabled={!texto.trim()} onClick={enviar}>
            Enviar orientação
          </Button>
        </div>
      }
    >
      <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={4000} placeholder="Ex.: Esse cliente já pediu orçamento semana passada — confere com o Financeiro antes de responder." className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]" />
    </Modal>
  );
}

function maisAntiga(lista: Conversa[]): string {
  return lista.reduce((min, c) => {
    const t = c.ultima_mensagem_do_cliente_em ?? c.aberta_em;
    return t < min ? t : min;
  }, lista[0].ultima_mensagem_do_cliente_em ?? lista[0].aberta_em);
}
