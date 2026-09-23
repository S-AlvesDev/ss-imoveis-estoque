import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRightLeft, CheckCircle2, Clock, Hand, Inbox, Layers, MessageSquare, MessagesSquare, PanelRightOpen, RotateCcw, Search, Star, UserPlus, UserRound, X } from 'lucide-react';
import { Botao } from '../../ui/Botao';
import { Avatar } from '../../ui/Avatar';
import { Etiqueta, EtiquetaColorida } from '../../ui/Etiqueta';
import { ListaDeFiltros, Pilulas } from '../../ui/Controles';
import { EsqueletoDeLista, FaixaOffline, Vazio } from '../../ui/Estados';
import { Pagina } from '../../ui/Pagina';
import { Modal } from '../../ui/Modal';
import { Entrada } from '../../ui/Campo';
import { SeloIa } from '../../ui/Ia';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral, conversasVisiveis, type Filtro } from '../../store/central';
import { useCabecalho } from '../../store/cabecalho';
import { useSessaoAtende } from '../../store/sessao';
import { useDadosAtende } from '../../store/dados';
import { TELAS, useRotaAtende } from '../../router';
import { pode } from '../../../shared/papeis';
import { NOME_DO_ESTADO, type Conversa, type Etiqueta as TEtiqueta } from '../../../shared/tipos';
import { Mensagens } from './Mensagens';
import { Encerrar } from './Encerrar';
import { Composer } from './Composer';
import { PainelDoCliente } from './PainelDoCliente';
import { Transferir } from './Transferir';
import { nomeDoCliente, quando, telefoneBonito, TOM_DO_ESTADO } from './util';

/**
 * A Central: a lista de conversas (filtros e busca), a conversa aberta
 * (linha do tempo + caixa de resposta) e a ficha do cliente. No desktop,
 * três colunas; no celular, uma de cada vez — e, com uma conversa aberta,
 * ela toma a tela inteira (o cabeçalho e a navegação inferior somem).
 * Atualiza por delta: a cada 4 s com a aba visível, 15 s escondida, e na
 * hora ao voltar o foco.
 */
const FILTROS: Array<{ id: Filtro; nome: string; icone: React.ReactNode }> = [
  { id: 'abertas', nome: 'Abertas', icone: <MessageSquare size={15} /> },
  { id: 'minhas', nome: 'Minhas', icone: <UserRound size={15} /> },
  { id: 'fila', nome: 'Fila', icone: <Inbox size={15} /> },
  { id: 'aguardando', nome: 'Aguardando', icone: <Clock size={15} /> },
  { id: 'encerradas', nome: 'Encerradas', icone: <CheckCircle2 size={15} /> },
  { id: 'todas', nome: 'Todas', icone: <Layers size={15} /> },
];

export function Central({ conversaId }: { conversaId: string | null }) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const ir = useRotaAtende((s) => s.ir);
  const { filtro, busca, setFiltro, setBusca, carregarLista, abrir, selecionada, carregandoLista, conexao } = useCentral();
  const conversasMap = useCentral((s) => s.conversas);
  const etiquetas = useCentral((s) => s.etiquetas);
  const carregarEtiquetas = useCentral((s) => s.carregarEtiquetas);
  const lista = useMemo(() => conversasVisiveis({ conversas: conversasMap, filtro, busca }, sessao.id), [conversasMap, filtro, busca, sessao.id]);
  const aberta = selecionada ? conversasMap[selecionada] : null;
  const [mostrarFicha, setMostrarFicha] = useState(true);
  // Abaixo de xl a ficha não cabe ao lado: abre como gaveta por cima da conversa.
  const [fichaMovel, setFichaMovel] = useState(false);
  const [novoLeadAberto, setNovoLeadAberto] = useState(false);
  const alternarFicha = () => (window.matchMedia('(min-width: 1280px)').matches ? setMostrarFicha((v) => !v) : setFichaMovel(true));

  // A URL manda: /atende/central/<id> abre a conversa.
  useEffect(() => {
    if (conversaId !== selecionada) void abrir(conversaId);
  }, [conversaId, selecionada, abrir]);

  // A lista inteira do filtro atual; o relógio do sync roda no Shell, para toda tela.
  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);
  useEffect(() => {
    if (etiquetas.length === 0) void carregarEtiquetas();
  }, [etiquetas.length, carregarEtiquetas]);

  // Busca: no que já está na tela, na hora; no servidor, depois de parar de digitar.
  useEffect(() => {
    if (!busca.trim()) return;
    const t = setTimeout(() => void carregarLista(), 400);
    return () => clearTimeout(t);
  }, [busca, carregarLista]);

  // No celular, a conversa aberta toma a tela: o Shell esconde o cabeçalho e a navegação.
  const abertaId = aberta?.id ?? null;
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const aplicar = () => {
      const cheia = Boolean(abertaId) && !mq.matches;
      useCabecalho.setState({ telaCheia: cheia });
      document.body.classList.toggle('conversa-aberta', cheia);
    };
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => {
      mq.removeEventListener('change', aplicar);
      useCabecalho.setState({ telaCheia: false });
      document.body.classList.remove('conversa-aberta');
    };
  }, [abertaId]);

  // ATD-03: com uma conversa aberta (em qualquer largura), o Jatobá sobe para não cobrir o compositor
  // (no desktop ele cobria o botão de gravar áudio). Independe do breakpoint acima, que só esconde no celular.
  useEffect(() => {
    document.body.classList.toggle('compositor-aberto', Boolean(abertaId));
    return () => document.body.classList.remove('compositor-aberto');
  }, [abertaId]);

  // As contagens dos filtros, no que está carregado (as abertas chegam pelo sync; encerradas e todas só ao abrir o filtro).
  const contagens = useMemo(() => {
    const c: Partial<Record<Filtro, number>> = { abertas: 0, minhas: 0, fila: 0, aguardando: 0 };
    for (const x of Object.values(conversasMap)) {
      if (x.estado === 'encerrada') continue;
      c.abertas!++;
      if (x.atendente_id === sessao.id) c.minhas!++;
      if (x.estado === 'na_fila' || x.estado === 'nova' || x.estado === 'em_triagem') c.fila!++;
      if (x.estado === 'aguardando_cliente') c.aguardando!++;
    }
    return c;
  }, [conversasMap, sessao.id]);

  const semWhatsapp = conexao === null || conexao.estado !== 'conectada';
  const opcoesDeFiltro = FILTROS.map((f) => ({ valor: f.id, rotulo: f.nome, icone: f.icone, contagem: contagens[f.id] }));
  const titulo = filtro === 'todas' ? 'Conversas' : 'Atendimentos';
  const descricao = filtro === 'todas' ? 'Todas as conversas da empresa, abertas e encerradas.' : 'As conversas abertas, a fila e as suas — em tempo real.';

  return (
    <Pagina
      titulo={titulo}
      descricao={descricao}
      largura="cheia"
      acoes={
        pode(sessao.papel, 'conversas.atender') && (
          <Botao tamanho="sm" variante="secundaria" icone={<UserPlus size={14} />} onClick={() => setNovoLeadAberto(true)}>
            Novo Lead
          </Botao>
        )
      }
    >
      {novoLeadAberto && (
        <NovoLeadModal
          onFechar={() => setNovoLeadAberto(false)}
          onCriado={(conversaId) => {
            setNovoLeadAberto(false);
            ir(TELAS.central, conversaId);
          }}
        />
      )}
      <div className="altura-da-central flex min-w-0 overflow-hidden">
        {/* Coluna 0 (telas largas): os filtros em lista */}
        <aside className={`hidden w-52 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-3 2xl:flex`}>
          <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Filtros</p>
          <ListaDeFiltros valor={filtro} onChange={setFiltro} opcoes={opcoesDeFiltro} />
          <div className="mt-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-[11px] leading-5 text-[var(--text-muted)]">
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${semWhatsapp ? 'bg-amber-400' : 'bg-emerald-500'}`} />
            {semWhatsapp ? 'WhatsApp desconectado' : 'WhatsApp conectado'}
            {conexao?.numero ? <span className="block truncate">+{conexao.numero}</span> : null}
          </div>
        </aside>

        {/* Coluna 1: a lista */}
        <section className={`flex w-full min-w-0 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:w-80 lg:w-[22rem] ${aberta ? 'hidden md:flex' : 'flex'}`}>
          <div className="space-y-2.5 border-b border-[var(--border)] p-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-9 pr-8 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-disable)] focus:border-[var(--brand)] focus:bg-[var(--surface)] focus:ring-4 focus:ring-[var(--brand)]/10" />
              {busca && (
                <button type="button" onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-2)]" aria-label="Limpar busca">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="2xl:hidden">
              <Pilulas valor={filtro} onChange={setFiltro} opcoes={opcoesDeFiltro} />
            </div>
          </div>
          {semWhatsapp && conexao !== undefined && (
            <FaixaOffline
              texto={conexao ? 'WhatsApp da empresa desconectado.' : 'A empresa ainda não conectou o WhatsApp.'}
              acao={
                pode(sessao.papel, 'whatsapp.gerir') ? (
                  <button type="button" onClick={() => ir(TELAS.whatsapp)} className="shrink-0 font-semibold underline-offset-2 hover:underline">
                    Conectar
                  </button>
                ) : (
                  <span className="shrink-0 opacity-80">Avise o administrador.</span>
                )
              }
            />
          )}
          <div className="rolagem-fina flex-1 overflow-y-auto">
            {lista.length === 0 &&
              (carregandoLista ? (
                <EsqueletoDeLista linhas={5} />
              ) : (
                <Vazio tom={filtro === 'abertas' || filtro === 'fila' ? 'positivo' : 'neutro'} icone={filtro === 'fila' ? <Inbox size={20} /> : <MessagesSquare size={20} />} titulo={busca.trim() ? 'Nenhuma conversa encontrada.' : filtro === 'fila' ? 'Fila vazia ✨' : filtro === 'abertas' ? 'Tudo tranquilo por aqui ✨' : filtro === 'minhas' ? 'Nenhuma conversa sua no momento.' : filtro === 'aguardando' ? 'Ninguém aguardando o cliente.' : 'Nada por aqui.'} texto={busca.trim() ? 'Tente outro nome ou telefone.' : filtro === 'abertas' ? 'Nenhum atendimento pendente. Quando um cliente escrever para o WhatsApp da empresa, ele aparece aqui.' : filtro === 'fila' ? 'Ninguém esperando atendimento.' : undefined} />
              ))}
            {lista.map((c) => (
              <ItemDaLista key={c.id} c={c} ativa={c.id === selecionada} eu={sessao.id} etiquetas={etiquetas} onClick={() => ir(TELAS.central, c.id)} />
            ))}
          </div>
        </section>

        {/* Coluna 2: a conversa */}
        <section className={`min-w-0 flex-1 flex-col bg-[var(--bg)] ${aberta ? 'flex' : 'hidden md:flex'}`}>
          {aberta ? (
            <>
              <Cabecalho conversa={aberta} onVoltar={() => ir(TELAS.central)} onFicha={alternarFicha} fichaAberta={mostrarFicha} />
              <Mensagens conversaId={aberta.id} />
              <Composer conversa={aberta} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradiente text-white shadow-[0_16px_40px_-16px_rgba(124,58,237,0.6)]">
                <MessageSquare size={26} />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-[var(--text)]">Escolha uma conversa</p>
                <p className="mt-1 max-w-xs text-sm text-[var(--text-muted)]">A conversa abre aqui, com a ficha do cliente ao lado. Use os filtros para achar a fila, as suas ou as encerradas.</p>
              </div>
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
            <div className="absolute inset-0 bg-[#17153a]/40 backdrop-blur-[2px]" onClick={() => setFichaMovel(false)} />
            <div className="absolute inset-y-0 right-0 flex w-[min(24rem,94vw)] flex-col bg-[var(--surface)] pt-[env(safe-area-inset-top)] shadow-[var(--sombra-flutuante)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--text)]">Ficha do cliente</p>
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
    </Pagina>
  );
}

function ItemDaLista({ c, ativa, eu, etiquetas, onClick }: { c: Conversa; ativa: boolean; eu: number; etiquetas: TEtiqueta[]; onClick: () => void }) {
  const equipe = useDadosAtende((s) => s.equipe);
  const nome = nomeDoCliente(c.cliente);
  const atendente = c.atendente_id ? equipe.find((f) => f.id === c.atendente_id) : null;
  const doCliente = c.ultima_mensagem_de === 'cliente';
  const prefixo = !c.ultima_mensagem_de || doCliente ? '' : c.ultima_mensagem_de === 'ia' ? 'IA: ' : c.atendente_id === eu ? 'Você: ' : 'Equipe: ';
  const urgente = c.prioridade === 'alta' || c.prioridade === 'urgente';
  const minhasEtiquetas = c.etiquetas.map((id) => etiquetas.find((e) => e.id === id)).filter(Boolean) as TEtiqueta[];
  return (
    <button type="button" onClick={onClick} aria-current={ativa ? 'true' : undefined} className={`relative flex w-full items-start gap-3 border-b border-[var(--border)] px-3 py-3 text-left transition-colors ${ativa ? 'bg-[var(--brand-soft)]/60' : 'hover:bg-[var(--bg)]'}`}>
      {ativa && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--brand)]" />}
      <Avatar nome={nome} foto={c.cliente.foto_url} tamanho={42} marca />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${c.nao_lidas > 0 ? 'font-semibold text-[var(--text)]' : 'font-medium text-[var(--text)]'}`}>{nome}</span>
          <span className={`shrink-0 text-[11px] tabular-nums ${c.nao_lidas > 0 ? 'font-semibold text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}>{quando(c.ultima_mensagem_em)}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={`truncate text-xs ${c.nao_lidas > 0 ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
            {prefixo && <span className="text-[var(--text-muted)]">{prefixo}</span>}
            {c.ultima_mensagem_texto ?? '…'}
          </span>
          {c.nao_lidas > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white">{c.nao_lidas > 99 ? '99+' : c.nao_lidas}</span>}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          <Etiqueta tom={TOM_DO_ESTADO[c.estado]} ponto pulsa={c.estado === 'em_triagem'}>
            {NOME_DO_ESTADO[c.estado]}
          </Etiqueta>
          {urgente && <Etiqueta tom="vermelho">{c.prioridade === 'urgente' ? 'Urgente' : 'Alta'}</Etiqueta>}
          {c.estado === 'em_triagem' && <SeloIa>IA lendo</SeloIa>}
          {atendente && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]" title={`Com ${atendente.nome}`}>
              <Avatar nome={atendente.nome} tamanho={16} />
              <span className="max-w-[7rem] truncate">{atendente.id === eu ? 'você' : atendente.nome.split(' ')[0]}</span>
            </span>
          )}
          {c.assunto && <span className="max-w-[10rem] truncate rounded-full bg-[var(--bg-2)] px-2 text-[11px] font-medium leading-5 text-[var(--text-muted)]">{c.assunto}</span>}
          {minhasEtiquetas.slice(0, 2).map((e) => (
            <EtiquetaColorida key={e.id} cor={e.cor}>
              {e.nome}
            </EtiquetaColorida>
          ))}
          {minhasEtiquetas.length > 2 && <span className="text-[10px] text-[var(--text-muted)]">+{minhasEtiquetas.length - 2}</span>}
          {c.avaliacao_nota !== null && c.avaliacao_nota !== undefined && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-600" title="Avaliação do cliente">
              <Star size={11} className="fill-current" /> {c.avaliacao_nota}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function Cabecalho({ conversa, onVoltar, onFicha, fichaAberta }: { conversa: Conversa; onVoltar: () => void; onFicha: () => void; fichaAberta: boolean }) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const equipe = useDadosAtende((s) => s.equipe);
  const times = useDadosAtende((s) => s.times);
  const aplicarConversa = useCentral((s) => s.aplicarConversa);
  const abrir = useCentral((s) => s.abrir);
  const [agindo, setAgindo] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const minha = conversa.atendente_id === sessao.id;
  const naFila = conversa.estado === 'na_fila' || conversa.estado === 'nova' || conversa.estado === 'em_triagem';
  const podeTransferir = conversa.estado !== 'encerrada' && (minha || naFila || pode(sessao.papel, 'conversas.supervisionar'));
  const atendente = conversa.atendente_id ? equipe.find((f) => f.id === conversa.atendente_id)?.nome : null;
  const time = conversa.time_id ? times.find((t) => t.id === conversa.time_id)?.nome : null;

  async function acao(rota: 'assumir' | 'reabrir', corpo?: unknown) {
    setAgindo(true);
    try {
      const r = await api.post<{ conversa: Conversa }>(`/conversas/${conversa.id}/${rota}`, corpo);
      aplicarConversa(r.conversa);
      // Reabrir põe um aviso na linha do tempo: recarrega para ele aparecer já.
      if (rota === 'reabrir') void abrir(conversa.id);
      toast.success(rota === 'assumir' ? 'Conversa é sua.' : 'Conversa reaberta.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível.');
    } finally {
      setAgindo(false);
    }
  }

  const nota = conversa.avaliacao_nota;
  return (
    <header className="flex min-w-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:gap-3 sm:px-4 lg:pt-2">
      <button type="button" onClick={onVoltar} className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-2)] md:hidden" aria-label="Voltar">
        <ArrowLeft size={18} />
      </button>
      <button type="button" onClick={onFicha} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" title="Ficha do cliente">
        <Avatar nome={nomeDoCliente(conversa.cliente)} foto={conversa.cliente.foto_url} tamanho={36} marca />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">{nomeDoCliente(conversa.cliente)}</span>
            <span className="hidden shrink-0 sm:inline-flex">
              <Etiqueta tom={TOM_DO_ESTADO[conversa.estado]} ponto pulsa={conversa.estado === 'em_triagem'}>
                {NOME_DO_ESTADO[conversa.estado]}
              </Etiqueta>
            </span>
          </span>
          <span className="block truncate text-[11px] text-[var(--text-muted)]">
            {telefoneBonito(conversa.cliente.telefone)}
            <span className="sm:hidden"> · {NOME_DO_ESTADO[conversa.estado]}</span>
            {time ? ` · ${time}` : ''}
            {atendente ? ` · ${minha ? 'com você' : `com ${atendente}`}` : naFila ? ' · sem atendente' : ''}
            {nota !== null && nota !== undefined ? <span className={`ml-1 font-semibold ${nota >= 9 ? 'text-emerald-600' : nota >= 7 ? 'text-amber-600' : 'text-rose-600'}`}>· ★ {nota}/10</span> : conversa.avaliacao_pedida_em && conversa.estado === 'encerrada' ? <span className="ml-1">· avaliação pedida</span> : null}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {conversa.estado !== 'encerrada' && !minha && (
          <Botao tamanho="sm" variante="primaria" icone={<Hand size={14} />} carregando={agindo} onClick={() => acao('assumir')}>
            <span className="hidden sm:inline">Assumir</span>
          </Botao>
        )}
        {podeTransferir && (
          <Botao tamanho="sm" variante="secundaria" icone={<ArrowRightLeft size={14} />} onClick={() => setTransferindo(true)} aria-label="Transferir">
            <span className="hidden lg:inline">Transferir</span>
          </Botao>
        )}
        {conversa.estado !== 'encerrada' ? (
          <Botao tamanho="sm" variante="secundaria" icone={<CheckCircle2 size={14} />} carregando={agindo} onClick={() => setEncerrando(true)} aria-label="Encerrar">
            <span className="hidden lg:inline">Encerrar</span>
          </Botao>
        ) : (
          <Botao tamanho="sm" variante="secundaria" icone={<RotateCcw size={14} />} carregando={agindo} onClick={() => acao('reabrir')} aria-label="Reabrir">
            <span className="hidden sm:inline">Reabrir</span>
          </Botao>
        )}
        <Botao tamanho="sm" variante={fichaAberta ? 'suave' : 'fantasma'} quadrado icone={<PanelRightOpen size={16} />} onClick={onFicha} aria-label="Ficha do cliente" />
      </div>
      <Transferir conversa={conversa} aberto={transferindo} onFechar={() => setTransferindo(false)} />
      <Encerrar conversa={conversa} aberto={encerrando} onFechar={() => setEncerrando(false)} />
    </header>
  );
}

/**
 * Um lead que não veio pelo WhatsApp (Instagram, indicação…): pede nome e
 * telefone e cria uma conversa de verdade — se esse telefone já é um
 * contato, reaproveita o que já existe em vez de duplicar.
 */
function NovoLeadModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: (conversaId: string) => void }) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api.post<{ conversa_id: string; reaproveitado: boolean }>('/leads', { nome, telefone });
      toast.success(r.reaproveitado ? 'Esse telefone já é um contato — abrindo o lead existente.' : `${nome} cadastrado.`);
      onCriado(r.conversa_id);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível criar o lead.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Novo Lead"
      descricao="Para quem chegou por outro canal (Instagram, indicação…), sem ter escrito no WhatsApp ainda."
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-novo-lead" carregando={enviando}>
            Criar
          </Botao>
        </>
      }
    >
      <form id="form-novo-lead" onSubmit={criar} className="space-y-4">
        <Entrada rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus />
        <Entrada rotulo="Telefone" ajuda="Com DDD — vira o WhatsApp deste contato, mesmo que ele nunca tenha escrito." required value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(84) 99999-9999" />
      </form>
    </Modal>
  );
}
