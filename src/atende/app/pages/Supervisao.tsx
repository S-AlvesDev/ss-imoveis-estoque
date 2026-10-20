import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRightLeft, BellRing, Clock, Eye, Hand, Inbox, MessageSquareText, Users, Wifi, X } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao, CabecalhoDoCartao } from '../ui/Cartao';
import { Modal } from '../ui/Modal';
import { Kpi } from '../ui/Kpi';
import { Avatar } from '../ui/Avatar';
import { Etiqueta } from '../ui/Etiqueta';
import { Pagina } from '../ui/Pagina';
import { Vazio } from '../ui/Estados';
import { AreaDeTexto } from '../ui/Campo';
import { api, ErroDaApi } from '../lib/api';
import { useCentral } from '../store/central';
import { useDadosAtende } from '../store/dados';
import { useSessaoAtende } from '../store/sessao';
import { TELAS, useRotaAtende } from '../router';
import { presencaEfetiva, NOME_DA_PRESENCA } from '../../shared/presenca';
import { NOME_DO_ESTADO, type Conversa, type Funcionario, type Mensagem, type Presenca } from '../../shared/tipos';
import { Transferir } from './central/Transferir';
import { nomeDoCliente, duracao, TOM_DO_ESTADO } from './central/util';
import { CartaoDeAvaliacoes } from './Avaliacoes';

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
  /** Filtrar a lista por pessoa: clicar em alguém da equipe mostra o que é dela. */
  const [pessoaFiltrada, setPessoaFiltrada] = useState<number | null>(null);
  const [cutucando, setCutucando] = useState<string | null>(null);

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
  /**
   * Com uma pessoa escolhida, a lista principal deixa de ser "quem espera" e
   * passa a ser TUDO que está com ela — que é a pergunta do supervisor:
   * o que fulano está atendendo agora.
   */
  const daPessoa = useMemo(
    () => (pessoaFiltrada === null ? [] : abertas.filter((c) => c.atendente_id === pessoaFiltrada).map((c) => ({ c, espera: c.ultima_mensagem_de === 'cliente' && c.ultima_mensagem_do_cliente_em ? agora - Date.parse(c.ultima_mensagem_do_cliente_em) : 0 })).sort((a, b) => b.espera - a.espera)),
    [abertas, pessoaFiltrada, agora],
  );
  const nomeFiltrado = pessoaFiltrada === null ? null : (equipe.find((f) => f.id === pessoaFiltrada)?.nome ?? 'essa pessoa');
  const listaPrincipal = pessoaFiltrada === null ? esperando : daPessoa;
  const online = pessoas.filter((p) => p.estado === 'online').length;

  /** Faz a tela de quem está com a conversa tocar. */
  async function cutucar(c: Conversa) {
    setCutucando(c.id);
    try {
      await api.post(`/conversas/${c.id}/cutucar`, {});
      const nome = equipe.find((f) => f.id === c.atendente_id)?.nome ?? 'o atendente';
      toast.success(`Chamamos ${nome}: a tela dele vai tocar.`);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível chamar.');
    } finally {
      setCutucando(null);
    }
  }

  async function assumir(c: Conversa) {
    try {
      const r = await api.post<{ conversa: Conversa }>(`/conversas/${c.id}/assumir`);
      useCentral.getState().aplicarConversa(r.conversa);
      toast.success('Conversa é sua.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível assumir.');
    }
  }

  const descricao = `${sessao.papel === 'admin' ? 'Toda a equipe, agora.' : `Seus times, agora: ${meusTimes.map((t) => t.nome).join(', ') || 'nenhum time para supervisionar'}.`} Atualiza sozinho.`;

  return (
    <Pagina titulo="Supervisão" descricao={descricao} largura="xl" acoes={<Etiqueta tom="verde" ponto pulsa tamanho="md">Ao vivo</Etiqueta>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi rotulo="Online agora" valor={online} icone={<Wifi size={16} />} tom="verde" legenda={`de ${pessoas.length} na equipe`} />
          <Kpi rotulo="Na fila" valor={naFila.length} icone={<Inbox size={16} />} tom={naFila.length ? 'ambar' : 'cinza'} legenda={naFila.length ? `mais antiga há ${duracao(agora - Date.parse(maisAntiga(naFila)))}` : 'ninguém esperando'} />
          <Kpi rotulo="Em atendimento" valor={emAtendimento.length} icone={<MessageSquareText size={16} />} tom="roxo" legenda={`${abertas.filter((c) => c.estado === 'aguardando_cliente').length} aguardando o cliente`} />
          <Kpi rotulo="Sem resposta há 5+ min" valor={emAlerta.length} icone={<AlertTriangle size={16} />} tom={emAlerta.length ? 'vermelho' : 'cinza'} legenda={emAlerta.length ? `a mais antiga há ${duracao(emAlerta[0].espera)}` : 'todo mundo respondido'} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
          <Cartao className="p-4 sm:p-5">
            <CabecalhoDoCartao
              icone={<Clock size={14} />}
              titulo={nomeFiltrado ? `Conversas de ${nomeFiltrado}` : 'Cliente esperando resposta'}
              descricao={nomeFiltrado ? 'Tudo que está com essa pessoa agora' : 'Da espera mais longa para a mais curta'}
              acoes={
                <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  {listaPrincipal.length} {listaPrincipal.length === 1 ? 'conversa' : 'conversas'}
                  {nomeFiltrado && (
                    <Botao tamanho="sm" variante="fantasma" icone={<X size={13} />} onClick={() => setPessoaFiltrada(null)}>
                      Limpar filtro
                    </Botao>
                  )}
                </span>
              }
            />
            {listaPrincipal.length === 0 ? (
              nomeFiltrado ? (
                <Vazio compacto icone={<MessageSquareText size={18} />} titulo={`${nomeFiltrado} não está com nenhuma conversa aberta.`} />
              ) : (
                <Vazio tom="positivo" compacto icone={<MessageSquareText size={18} />} titulo="Tudo tranquilo por aqui ✨" texto="Nenhum cliente esperando: a última palavra é da equipe em todas as conversas abertas." />
              )
            ) : (
              <ul className="mt-3 divide-y divide-[var(--border)]">
                {listaPrincipal.slice(0, 30).map(({ c, espera }) => {
                  const atendente = c.atendente_id ? equipe.find((f) => f.id === c.atendente_id) : null;
                  const time = c.time_id ? times.find((t) => t.id === c.time_id)?.nome : null;
                  const alerta = espera >= ESPERA_ALERTA_MS;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                      <Avatar nome={nomeDoCliente(c.cliente)} foto={c.cliente.foto_url} tamanho={38} marca />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{nomeDoCliente(c.cliente)}</span>
                          <Etiqueta tom={TOM_DO_ESTADO[c.estado]}>{NOME_DO_ESTADO[c.estado]}</Etiqueta>
                          {c.prioridade === 'alta' || c.prioridade === 'urgente' ? <Etiqueta tom="vermelho">{c.prioridade}</Etiqueta> : null}
                        </span>
                        <span className="block truncate text-xs text-[var(--text-muted)]">{[time, atendente ? `com ${atendente.nome}` : c.estado === 'na_fila' ? 'sem atendente' : null, c.assunto].filter(Boolean).join(' · ') || c.ultima_mensagem_texto}</span>
                      </span>
                      {espera > 0 && <span className={`shrink-0 rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${alerta ? 'bg-rose-50 text-rose-700' : 'bg-[var(--bg-2)] text-[var(--text)]'}`}>{duracao(espera)}</span>}
                      {/* No celular, os botões descem para a linha de baixo, alinhados ao texto. */}
                      <span className="flex w-full shrink-0 gap-1 pl-[50px] sm:w-auto sm:pl-0">
                        <Botao tamanho="sm" variante="secundaria" icone={<Eye size={13} />} onClick={() => ir(TELAS.central, c.id)}>
                          Abrir
                        </Botao>
                        {c.atendente_id !== sessao.id && <Botao tamanho="sm" variante="fantasma" quadrado icone={<Hand size={14} />} onClick={() => assumir(c)} aria-label="Assumir" />}
                        <Botao tamanho="sm" variante="fantasma" quadrado icone={<ArrowRightLeft size={14} />} onClick={() => setTransferindo(c)} aria-label="Transferir" />
                        {c.atendente_id && c.atendente_id !== sessao.id && <Botao tamanho="sm" variante="fantasma" quadrado icone={<MessageSquareText size={14} />} onClick={() => setOrientando(c)} aria-label="Orientar (nota interna)" />}
                        {/* Chamar a atenção: só faz sentido quando a conversa está com outra pessoa. */}
                        {c.atendente_id && c.atendente_id !== sessao.id && (
                          <Botao tamanho="sm" variante="fantasma" quadrado carregando={cutucando === c.id} icone={<BellRing size={14} />} onClick={() => cutucar(c)} aria-label={`Chamar a atenção de ${equipe.find((f) => f.id === c.atendente_id)?.nome ?? 'quem está atendendo'}`} data-dica="Chamar a atenção (toca na tela dele)" />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>

          <div className="space-y-4">
            <Cartao className="p-4 sm:p-5">
              <CabecalhoDoCartao icone={<Users size={14} />} titulo="Equipe" acoes={<span className="text-xs text-[var(--text-muted)]">{online} online</span>} />
              {pessoas.length === 0 ? (
                <Vazio compacto icone={<Users size={18} />} titulo="Nenhuma pessoa nos seus times." />
              ) : (
                <ul className="mt-3 space-y-0.5">
                  {[...pessoas].sort(porPresenca).map((p) => (
                    <LinhaDaPessoa key={p.id} pessoa={p} estado={p.estado} conversas={abertas} agora={agora} eu={sessao.id} escolhida={pessoaFiltrada === p.id} aoEscolher={() => setPessoaFiltrada((atual) => (atual === p.id ? null : p.id))} />
                  ))}
                </ul>
              )}
            </Cartao>

            <Cartao className="p-4 sm:p-5">
              <CabecalhoDoCartao icone={<Inbox size={14} />} titulo="Fila por setor" />
              <ul className="mt-3 space-y-1.5">
                {meusTimes.map((t) => {
                  const fila = naFila.filter((c) => c.time_id === t.id);
                  return <LinhaDaFila key={t.id} nome={t.nome} fila={fila} agora={agora} membrosOnline={pessoas.filter((p) => t.membros.includes(p.id) && p.estado === 'online').length} />;
                })}
                {(sessao.papel === 'admin' || naFila.some((c) => !c.time_id)) && <LinhaDaFila nome="Sem setor (fila geral)" fila={naFila.filter((c) => !c.time_id)} agora={agora} membrosOnline={null} />}
              </ul>
            </Cartao>
          </div>
        </div>

        <CartaoDeAvaliacoes periodo="30d" />

        {transferindo && <Transferir conversa={transferindo} aberto onFechar={() => setTransferindo(null)} />}
        {orientando && <Orientar conversa={orientando} onFechar={() => setOrientando(null)} />}
      </div>
    </Pagina>
  );
}

function porPresenca(a: { estado: Presenca; nome: string }, b: { estado: Presenca; nome: string }) {
  const ordem: Record<Presenca, number> = { online: 0, ausente: 1, offline: 2 };
  return ordem[a.estado] - ordem[b.estado] || a.nome.localeCompare(b.nome);
}

function LinhaDaPessoa({ pessoa, estado, conversas, agora, eu, escolhida, aoEscolher }: { pessoa: Funcionario; estado: Presenca; conversas: Conversa[]; agora: number; eu: number; escolhida: boolean; aoEscolher: () => void }) {
  const minhas = conversas.filter((c) => c.atendente_id === pessoa.id);
  const esperando = minhas.filter((c) => c.ultima_mensagem_de === 'cliente' && c.ultima_mensagem_do_cliente_em);
  const maisEsperando = esperando.length ? Math.max(...esperando.map((c) => agora - Date.parse(c.ultima_mensagem_do_cliente_em!))) : 0;
  return (
    <li
      onClick={aoEscolher}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), aoEscolher())}
      aria-pressed={escolhida}
      title={escolhida ? 'Mostrar todas de novo' : `Ver o que ${pessoa.nome} está atendendo`}
      className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors ${escolhida ? 'bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]/30' : 'hover:bg-[var(--bg)]'}`}
    >
      <Avatar nome={pessoa.nome} tamanho={34} presenca={estado} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--text)]">
          {pessoa.nome}
          {pessoa.id === eu ? <span className="text-[var(--text-muted)]"> (você)</span> : ''}
        </span>
        <span className="block text-[11px] text-[var(--text-muted)]">
          {NOME_DA_PRESENCA[estado]}
          {estado === 'offline' && pessoa.presenca_em ? ` · visto ${new Date(pessoa.presenca_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      </span>
      <span className="text-right text-xs">
        <span className="block font-semibold tabular-nums text-[var(--text)]">{minhas.length}</span>
        <span className="block text-[10px] text-[var(--text-muted)]">{minhas.length === 1 ? 'conversa' : 'conversas'}</span>
      </span>
      <span className="w-16 text-right text-xs">
        {esperando.length ? (
          <>
            <span className={`block font-semibold tabular-nums ${maisEsperando >= ESPERA_ALERTA_MS ? 'text-rose-600' : 'text-[var(--text)]'}`}>{duracao(maisEsperando)}</span>
            <span className="block text-[10px] text-[var(--text-muted)]">{esperando.length} sem resp.</span>
          </>
        ) : (
          <span className="block text-[10px] text-emerald-600">em dia</span>
        )}
      </span>
    </li>
  );
}

function LinhaDaFila({ nome, fila, agora, membrosOnline }: { nome: string; fila: Conversa[]; agora: number; membrosOnline: number | null }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--text)]">{nome}</span>
        <span className="block text-[11px] text-[var(--text-muted)]">{membrosOnline === null ? 'qualquer um pode pegar' : `${membrosOnline} online no setor`}</span>
      </span>
      <span className="text-right">
        <span className={`block text-lg font-semibold leading-none tabular-nums ${fila.length ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{fila.length}</span>
        <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">{fila.length ? `há ${duracao(agora - Date.parse(maisAntiga(fila)))}` : 'vazia'}</span>
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
      aberto
      onFechar={onFechar}
      titulo={`Orientar ${atendente}`}
      descricao={`Nota interna na conversa com ${nomeDoCliente(conversa.cliente)}. O cliente não vê.`}
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao icone={<MessageSquareText size={15} />} carregando={enviando} disabled={!texto.trim()} onClick={enviar}>
            Enviar orientação
          </Botao>
        </>
      }
    >
      <AreaDeTexto autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={4000} placeholder="Ex.: Esse cliente já pediu orçamento semana passada — confere com o Financeiro antes de responder." />
    </Modal>
  );
}

function maisAntiga(lista: Conversa[]): string {
  return lista.reduce((min, c) => {
    const t = c.ultima_mensagem_do_cliente_em ?? c.aberta_em;
    return t < min ? t : min;
  }, lista[0].ultima_mensagem_do_cliente_em ?? lista[0].aberta_em);
}
