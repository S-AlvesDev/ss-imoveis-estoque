import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRightLeft, CheckCircle2, Hand, MessageSquare, RotateCcw, Search, WifiOff, X, UserRound } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral, conversasVisiveis, type Filtro } from '../../store/central';
import { useSessaoAtende } from '../../store/sessao';
import { useDadosAtende } from '../../store/dados';
import { TELAS, useRotaAtende } from '../../router';
import { pode } from '../../../shared/papeis';
import { NOME_DO_ESTADO, type Conversa } from '../../../shared/tipos';
import { Mensagens } from './Mensagens';
import { Composer } from './Composer';
import { PainelDoCliente } from './PainelDoCliente';
import { Transferir } from './Transferir';
import { iniciais, nomeDoCliente, quando, telefoneBonito, COR_DO_ESTADO } from './util';

/**
 * A Central: três colunas — a lista de conversas (com abas e busca), a
 * conversa aberta (linha do tempo + caixa de resposta) e a ficha do cliente.
 * No celular, uma coluna de cada vez. Atualiza por delta: a cada 4 s com a
 * aba visível, 15 s escondida, e na hora ao voltar o foco.
 */
const ABAS: Array<{ id: Filtro; nome: string }> = [
  { id: 'abertas', nome: 'Abertas' },
  { id: 'minhas', nome: 'Minhas' },
  { id: 'fila', nome: 'Fila' },
  { id: 'aguardando', nome: 'Aguardando' },
  { id: 'encerradas', nome: 'Encerradas' },
];

export function Central({ conversaId }: { conversaId: string | null }) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const ir = useRotaAtende((s) => s.ir);
  const { filtro, busca, setFiltro, setBusca, carregarLista, abrir, selecionada, carregandoLista, conexao } = useCentral();
  const conversasMap = useCentral((s) => s.conversas);
  const lista = useMemo(() => conversasVisiveis({ conversas: conversasMap, filtro, busca }, sessao.id), [conversasMap, filtro, busca, sessao.id]);
  const aberta = selecionada ? conversasMap[selecionada] : null;
  const [mostrarFicha, setMostrarFicha] = useState(true);
  // Abaixo de xl a ficha não cabe ao lado: abre como gaveta por cima da conversa.
  const [fichaMovel, setFichaMovel] = useState(false);
  const alternarFicha = () => (window.matchMedia('(min-width: 1280px)').matches ? setMostrarFicha((v) => !v) : setFichaMovel(true));

  // A URL manda: /atende/central/<id> abre a conversa.
  useEffect(() => {
    if (conversaId !== selecionada) void abrir(conversaId);
  }, [conversaId, selecionada, abrir]);

  // A lista inteira do filtro atual; o relógio do sync roda no Shell, para toda tela.
  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  // Busca: no que já está na tela, na hora; no servidor, depois de parar de digitar.
  useEffect(() => {
    if (!busca.trim()) return;
    const t = setTimeout(() => void carregarLista(), 400);
    return () => clearTimeout(t);
  }, [busca, carregarLista]);

  const semWhatsapp = conexao === null || conexao.estado !== 'conectada';

  return (
    <div className="altura-da-central -m-4 flex min-w-0 overflow-hidden sm:-m-6">
      {/* Coluna 1: a lista */}
      <section className={`flex w-full min-w-0 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:w-80 lg:w-96 ${aberta ? 'hidden md:flex' : 'flex'}`}>
        <div className="border-b border-[var(--border)] p-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-[var(--text-muted)]" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]" />
          </div>
          <div className="hide-scrollbar mt-2 flex gap-1 overflow-x-auto">
            {ABAS.map((a) => (
              <button key={a.id} type="button" onClick={() => setFiltro(a.id)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-colors ${filtro === a.id ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-2)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                {a.nome}
              </button>
            ))}
          </div>
        </div>
        {semWhatsapp && conexao !== undefined && (
          <button type="button" onClick={() => pode(sessao.papel, 'whatsapp.gerir') && ir(TELAS.whatsapp)} className="flex items-center gap-2 border-b border-amber-400/40 bg-amber-100/70 px-3 py-2 text-left text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <WifiOff size={14} className="shrink-0" />
            <span className="flex-1">{conexao ? 'WhatsApp da empresa desconectado.' : 'A empresa ainda não conectou o WhatsApp.'}{pode(sessao.papel, 'whatsapp.gerir') ? ' Conectar →' : ' Avise o administrador.'}</span>
          </button>
        )}
        <div className="flex-1 overflow-y-auto">
          {lista.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-[var(--text-muted)]">
              <MessageSquare size={22} />
              {carregandoLista ? 'Carregando…' : filtro === 'abertas' ? 'Nenhuma conversa aberta. Quando um cliente escrever para o WhatsApp da empresa, aparece aqui.' : 'Nada por aqui.'}
            </div>
          )}
          {lista.map((c) => (
            <ItemDaLista key={c.id} c={c} ativa={c.id === selecionada} onClick={() => ir(TELAS.central, c.id)} />
          ))}
        </div>
      </section>

      {/* Coluna 2: a conversa */}
      <section className={`min-w-0 flex-1 flex-col bg-[var(--bg)] ${aberta ? 'flex' : 'hidden md:flex'}`}>
        {aberta ? (
          <>
            <Cabecalho conversa={aberta} onVoltar={() => ir(TELAS.central)} onFicha={alternarFicha} />
            <Mensagens conversaId={aberta.id} />
            <Composer conversa={aberta} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-[var(--text-muted)]">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradiente text-white shadow-lg shadow-[var(--brand)]/30">
              <MessageSquare size={24} />
            </span>
            <p className="text-sm">Escolha uma conversa à esquerda.</p>
          </div>
        )}
      </section>

      {/* Coluna 3: o cliente */}
      {aberta && mostrarFicha && (
        <section className="hidden w-80 shrink-0 border-l border-[var(--border)] bg-[var(--surface)] xl:block">
          <PainelDoCliente conversa={aberta} />
        </section>
      )}
      {/* No celular e no tablet, a mesma ficha como gaveta pela direita. */}
      {aberta && fichaMovel && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setFichaMovel(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(24rem,94vw)] flex-col bg-[var(--surface)] pt-[env(safe-area-inset-top)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Ficha do cliente</p>
              <button type="button" onClick={() => setFichaMovel(false)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)]" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <PainelDoCliente conversa={aberta} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemDaLista({ c, ativa, onClick }: { c: Conversa; ativa: boolean; onClick: () => void }) {
  const nome = nomeDoCliente(c.cliente);
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-start gap-3 border-b border-[var(--border)] px-3 py-3 text-left transition-colors hover:bg-[var(--bg-2)] ${ativa ? 'bg-[var(--brand)]/[0.08]' : ''}`}>
      {c.cliente.foto_url ? <img src={c.cliente.foto_url} alt="" className="mt-0.5 h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/12 text-sm font-extrabold text-[var(--brand)]">{iniciais(nome)}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold text-[var(--text)]">{nome}</span>
          <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{quando(c.ultima_mensagem_em)}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-[var(--text-muted)]">
            {c.ultima_mensagem_de && c.ultima_mensagem_de !== 'cliente' && <span className="text-[var(--text-muted)]/70">Você: </span>}
            {c.ultima_mensagem_texto ?? '…'}
          </span>
          {c.nao_lidas > 0 && <span className="shrink-0 rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-bold text-white">{c.nao_lidas}</span>}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_DO_ESTADO[c.estado]}`}>{NOME_DO_ESTADO[c.estado]}</span>
          {c.assunto && <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">{c.assunto}</span>}
        </span>
      </span>
    </button>
  );
}

function Cabecalho({ conversa, onVoltar, onFicha }: { conversa: Conversa; onVoltar: () => void; onFicha: () => void }) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const equipe = useDadosAtende((s) => s.equipe);
  const aplicarConversa = useCentral((s) => s.aplicarConversa);
  const abrir = useCentral((s) => s.abrir);
  const [agindo, setAgindo] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const minha = conversa.atendente_id === sessao.id;
  const naFila = conversa.estado === 'na_fila' || conversa.estado === 'nova' || conversa.estado === 'em_triagem';
  const podeTransferir = conversa.estado !== 'encerrada' && (minha || naFila || pode(sessao.papel, 'conversas.supervisionar'));
  const atendente = conversa.atendente_id ? equipe.find((f) => f.id === conversa.atendente_id)?.nome : null;

  async function acao(rota: 'assumir' | 'encerrar' | 'reabrir', corpo?: unknown) {
    setAgindo(true);
    try {
      const r = await api.post<{ conversa: Conversa }>(`/conversas/${conversa.id}/${rota}`, corpo);
      aplicarConversa(r.conversa);
      // Encerrar põe um aviso na linha do tempo: recarrega para ele aparecer já.
      if (rota === 'encerrar') void abrir(conversa.id);
      toast.success(rota === 'assumir' ? 'Conversa é sua.' : rota === 'encerrar' ? 'Conversa encerrada.' : 'Conversa reaberta.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível.');
    } finally {
      setAgindo(false);
    }
  }

  return (
    <header className="flex min-w-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2 py-2.5 sm:gap-3 sm:px-3">
      <button type="button" onClick={onVoltar} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)] md:hidden" aria-label="Voltar">
        <ArrowLeft size={18} />
      </button>
      <button type="button" onClick={onFicha} className="min-w-0 flex-1 text-left" title="Ficha do cliente">
        <p className="truncate text-sm font-extrabold text-[var(--text)]">{nomeDoCliente(conversa.cliente)}</p>
        <p className="truncate text-[11px] text-[var(--text-muted)]">
          {telefoneBonito(conversa.cliente.telefone)} · {NOME_DO_ESTADO[conversa.estado]}
          {atendente ? ` · ${minha ? 'com você' : `com ${atendente}`}` : ''}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={onFicha} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)] xl:hidden" aria-label="Ficha do cliente" title="Ficha do cliente">
          <UserRound size={18} />
        </button>
        {conversa.estado !== 'encerrada' && !minha && (
          <Button size="sm" variant="outline" icon={<Hand size={14} />} loading={agindo} onClick={() => acao('assumir')}>
            <span className="hidden sm:inline">Assumir</span>
          </Button>
        )}
        {podeTransferir && (
          <Button size="sm" variant="ghost" icon={<ArrowRightLeft size={14} />} onClick={() => setTransferindo(true)}>
            <span className="hidden sm:inline">Transferir</span>
          </Button>
        )}
        {conversa.estado !== 'encerrada' ? (
          <Button size="sm" variant="ghost" icon={<CheckCircle2 size={14} />} loading={agindo} onClick={() => acao('encerrar')}>
            <span className="hidden sm:inline">Encerrar</span>
          </Button>
        ) : (
          <Button size="sm" variant="outline" icon={<RotateCcw size={14} />} loading={agindo} onClick={() => acao('reabrir')}>
            <span className="hidden sm:inline">Reabrir</span>
          </Button>
        )}
      </div>
      <Transferir conversa={conversa} aberto={transferindo} onFechar={() => setTransferindo(false)} />
    </header>
  );
}
