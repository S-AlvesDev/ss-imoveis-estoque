import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, Bell, BellRing, Bot, ChevronDown, ChevronRight, CreditCard, Eye, FileCheck2, Kanban, LogOut, Megaphone, Menu, MessageSquare, MessagesSquare, MoreHorizontal, Package, Settings, Smartphone, Star, UserCircle, Users, UsersRound, Wifi, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { MarcaAtende } from './Marca';
import { TELAS, useRotaAtende, type Tela } from './router';
import { useSessaoAtende } from './store/sessao';
import { useDadosAtende } from './store/dados';
import { useCentral } from './store/central';
import { useCabecalho } from './store/cabecalho';
import { api } from './lib/api';
import { presencaEfetiva } from '../shared/presenca';
import { useSincronizacao } from './store/useSincronizacao';
import { useNotificacoes } from './store/useNotificacoes';
import { ativarNotificacoes, estadoDasNotificacoes, type EstadoDasNotificacoes } from './notificacoes';
import { pode, NOME_DO_PAPEL, type Permissao } from '../shared/papeis';
import { NOME_DO_PLANO_ATENDE, planoAtendeLibera } from '../shared/planos';
import type { Filtro } from '../shared/tipos';
import { LinhaSevla, SEVLA_LINKS } from '@/shared/ui/SeloSevla';
import { Jatoba } from '@/features/jatoba/Jatoba';
import { Avatar } from './ui/Avatar';

/**
 * A moldura do Atende Aí depois de entrar: a barra lateral clara com os
 * grupos de telas, o cabeçalho com o título da tela e as ações dela (que
 * cada tela manda por `<Pagina>`), e — no celular — a navegação inferior
 * com as quatro telas principais e a gaveta com o resto.
 *
 * Duas entradas do menu são "vistas" de telas que já existem: Conversas é a
 * Central com o filtro Todas (o histórico completo); IA é a tela da empresa
 * aberta na aba da IA. Nada de rota nova para isso.
 */
export interface Item {
  id: string;
  tela: Tela;
  /** A aba/subcaminho da tela (IA dentro de Empresa). */
  resto?: string;
  /** O filtro da Central que esta entrada abre. */
  filtro?: Filtro;
  nome: string;
  icone: ReactNode;
  permissao?: Permissao;
}

interface Grupo {
  rotulo: string;
  itens: Item[];
}

function gruposDoMenu(papel: string): Grupo[] {
  const so = (itens: Item[]) => itens.filter((i) => !i.permissao || pode(papel, i.permissao));
  const grupos: Grupo[] = [
    {
      rotulo: 'Atendimento',
      itens: so([
        { id: 'central', tela: TELAS.central, nome: 'Atendimentos', icone: <MessageSquare size={18} />, permissao: 'conversas.atender' },
        { id: 'conversas', tela: TELAS.central, filtro: 'todas', nome: 'Conversas', icone: <MessagesSquare size={18} />, permissao: 'conversas.atender' },
        { id: 'supervisao', tela: TELAS.supervisao, nome: 'Supervisão', icone: <Eye size={18} />, permissao: 'conversas.supervisionar' },
        { id: 'leads', tela: TELAS.leads, nome: 'Gestão de Leads', icone: <Kanban size={18} />, permissao: 'conversas.supervisionar' },
        { id: 'campanhas', tela: TELAS.campanhas, nome: 'Campanhas', icone: <Megaphone size={18} />, permissao: 'conversas.atender' },
      ]),
    },
    {
      rotulo: 'Análise',
      itens: so([
        { id: 'dashboard', tela: TELAS.dashboard, nome: 'Dashboard', icone: <BarChart3 size={18} />, permissao: 'dashboard.ver' },
        { id: 'avaliacoes', tela: TELAS.avaliacoes, nome: 'Avaliações', icone: <Star size={18} />, permissao: 'conversas.supervisionar' },
        { id: 'mcmv', tela: TELAS.mcmv, nome: 'Gestão de MCMV', icone: <FileCheck2 size={18} />, permissao: 'mcmv.gerir' },
      ]),
    },
    {
      rotulo: 'Empresa',
      itens: so([
        { id: 'equipe', tela: TELAS.equipe, nome: 'Equipe', icone: <Users size={18} />, permissao: 'equipe.ver' },
        { id: 'times', tela: TELAS.times, nome: 'Times', icone: <UsersRound size={18} />, permissao: 'times.gerir' },
        { id: 'ia', tela: TELAS.empresa, resto: 'ia', nome: 'IA', icone: <Bot size={18} />, permissao: 'empresa.gerir' },
        { id: 'inventario', tela: TELAS.inventario, nome: 'Inventário', icone: <Package size={18} />, permissao: 'conversas.atender' },
        { id: 'modelos', tela: TELAS.modelos, nome: 'Modelos de mensagem', icone: <MessageSquare size={18} />, permissao: 'modelos.gerir' },
        { id: 'whatsapp', tela: TELAS.whatsapp, nome: 'WhatsApp', icone: <Smartphone size={18} />, permissao: 'whatsapp.gerir' },
        { id: 'empresa', tela: TELAS.empresa, nome: 'Configurações', icone: <Settings size={18} />, permissao: 'empresa.gerir' },
        { id: 'plano', tela: TELAS.plano, nome: 'Plano', icone: <CreditCard size={18} />, permissao: 'empresa.gerir' },
      ]),
    },
  ];
  return grupos.filter((g) => g.itens.length > 0);
}

/** Lista achatada — decide a tela inicial de cada papel e o que ele pode abrir. */
export function itensDoMenu(papel: string): Item[] {
  return gruposDoMenu(papel).flatMap((g) => g.itens);
}

/** Qual entrada do menu está acesa para a tela atual (a Central e a Empresa têm duas entradas cada). */
function itemAtivo(itens: Item[], tela: Tela | null, resto: string, filtro: Filtro): Item | null {
  if (!tela) return null;
  const candidatos = itens.filter((i) => i.tela === tela);
  if (candidatos.length <= 1) return candidatos[0] ?? null;
  if (tela === TELAS.central) return candidatos.find((i) => (filtro === 'todas' ? i.filtro === 'todas' : !i.filtro)) ?? candidatos[0];
  if (tela === TELAS.empresa) return candidatos.find((i) => (resto === 'ia' ? i.resto === 'ia' : !i.resto)) ?? candidatos[0];
  return candidatos[0];
}

export function Shell({ tela, resto = '', children }: { tela: Tela | null; resto?: string; children: ReactNode }) {
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [menuNaBarra, setMenuNaBarra] = useState(false);
  const [menuNoTopo, setMenuNoTopo] = useState(false);
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const sair = useSessaoAtende((s) => s.sair);
  const limpar = useDadosAtende((s) => s.limpar);
  const limparCentral = useCentral((s) => s.limpar);
  const empresa = useDadosAtende((s) => s.empresa);
  const contaDaEmpresa = useDadosAtende((s) => s.conta);
  const conversas = useCentral((s) => s.conversas);
  const filtro = useCentral((s) => s.filtro);
  const conexao = useCentral((s) => s.conexao);
  const ir = useRotaAtende((s) => s.ir);
  const titulo = useCabecalho((s) => s.titulo);
  const descricao = useCabecalho((s) => s.descricao);
  const telaCheia = useCabecalho((s) => s.telaCheia);
  const grupos = useMemo(() => gruposDoMenu(sessao.papel), [sessao.papel]);
  // Onde as ações da tela entram (por portal, via <Pagina>). Estável: o React só chama na montagem e na desmontagem.
  const registrarAlvoDasAcoes = useCallback((el: HTMLDivElement | null) => {
    queueMicrotask(() => useCabecalho.setState({ alvoDasAcoes: el }));
  }, []);
  const itens = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);
  const ativo = itemAtivo(itens, tela, resto, filtro);

  // O relógio do sync mora aqui: em qualquer tela a pessoa continua presente e as contagens da barra continuam certas.
  useSincronizacao({ carregarLista: false });

  // ATD-05: o estado do WhatsApp na barra lateral e na central vem do que o webhook gravou — que pode ficar
  // desatualizado se o evento se perder. Uma conferência ao vivo por sessão (o que a tela de WhatsApp já faz
  // sozinha) corrige o banco; o próximo /sync traz o valor certo para a barra e para a central.
  useEffect(() => {
    if (pode(sessao.papel, 'whatsapp.gerir')) void api.get('/whatsapp').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // As contagens da barra: não lidas nas minhas conversas e na fila (Atendimentos); quantas na fila (Supervisão).
  const { naoLidas, naFila } = useMemo(() => {
    let naoLidas = 0;
    let naFila = 0;
    for (const c of Object.values(conversas)) {
      if (c.estado === 'encerrada') continue;
      if (c.estado === 'na_fila' || c.estado === 'nova' || c.estado === 'em_triagem') naFila++;
      if (c.atendente_id === sessao.id || c.estado === 'na_fila') naoLidas += c.nao_lidas;
    }
    return { naoLidas, naFila };
  }, [conversas, sessao.id]);

  // Com a gaveta aberta no celular, o botão do Jatobá some (CSS) para não ficar por cima do menu.
  useEffect(() => {
    document.body.classList.toggle('gaveta-aberta', gavetaAberta);
    return () => document.body.classList.remove('gaveta-aberta');
  }, [gavetaAberta]);

  // Som, título "(n) Atende Aí", toast e — quem ativou — push pelo service worker.
  useNotificacoes(naoLidas);
  const [notificacoes, setNotificacoes] = useState<EstadoDasNotificacoes | null>(null);
  const [ativandoNotificacoes, setAtivandoNotificacoes] = useState(false);
  useEffect(() => {
    void estadoDasNotificacoes().then(setNotificacoes);
  }, []);
  async function ativarNotificacoesDaBarra() {
    setAtivandoNotificacoes(true);
    try {
      await ativarNotificacoes();
      setNotificacoes('ativas');
      toast.success('Notificações ativadas neste aparelho.');
    } catch (e: any) {
      toast.error(e.message || 'Não foi possível ativar.');
      setNotificacoes(await estadoDasNotificacoes());
    } finally {
      setAtivandoNotificacoes(false);
    }
  }

  function navegar(i: Item) {
    if (i.tela === TELAS.central) {
      const atual = useCentral.getState().filtro;
      if (i.filtro && atual !== i.filtro) useCentral.getState().setFiltro(i.filtro);
      else if (!i.filtro && atual === 'todas') useCentral.getState().setFiltro('abertas');
    }
    ir(i.tela, i.resto ?? '');
    setGavetaAberta(false);
    setMenuNaBarra(false);
    setMenuNoTopo(false);
  }
  const minhaPresenca = useCentral((s) => s.presenca[sessao.id]);
  const estadoDaPresenca = presencaEfetiva(minhaPresenca, Date.now());
  async function alternarPresenca() {
    const nova = estadoDaPresenca === 'ausente' ? 'online' : 'ausente';
    try {
      await api.post('/presenca', { presenca: nova });
      useCentral.setState((s) => ({ presenca: { ...s.presenca, [sessao.id]: { presenca: nova, presenca_em: new Date().toISOString() } } }));
      toast.success(nova === 'ausente' ? 'Você está ausente: a IA não te manda conversas novas.' : 'Você está online.');
    } catch {
      toast.error('Não foi possível mudar a presença.');
    }
  }
  function sairDaConta() {
    void api.post('/presenca', { presenca: 'offline' }).catch(() => undefined);
    limpar();
    limparCentral();
    sair();
    ir(TELAS.entrar);
  }

  const contagemDe = (i: Item) => (i.id === 'central' ? naoLidas : i.id === 'supervisao' ? naFila : 0);
  const whatsappConectado = conexao?.estado === 'conectada';
  const textoDoWhatsapp = whatsappConectado ? 'WhatsApp conectado' : conexao?.estado === 'conectando' || conexao?.estado === 'aguardando_qr' ? 'Aguardando QR' : conexao ? 'WhatsApp desconectado' : 'WhatsApp não conectado';
  const podeGerirWhatsapp = pode(sessao.papel, 'whatsapp.gerir');

  // A barra é desenhada duas vezes (fixa no desktop, gaveta no celular): cada cópia com o próprio indicador animado.
  const barra = (copia: string) => (
    <aside className="flex h-full w-[264px] flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] pt-[env(safe-area-inset-top)]">
      {/* A marca */}
      <div className="flex h-16 shrink-0 items-center justify-between pl-5 pr-3">
        <button type="button" onClick={() => itens[0] && navegar(itens[0])} className="flex items-center" aria-label="Início">
          <MarcaAtende tema="claro" tamanho={26} />
        </button>
        <button type="button" onClick={() => setGavetaAberta(false)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)] lg:hidden" aria-label="Fechar menu">
          <X size={18} />
        </button>
      </div>

      {/* O contexto: a empresa */}
      {empresa && (
        <div className="px-3 pb-1">
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
            <Avatar nome={empresa.nome} tamanho={30} quadrado />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold text-[var(--text)]">{empresa.nome}</p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">{empresa.segmento || 'Empresa'}{contaDaEmpresa && contaDaEmpresa.situacao === 'assinada' ? ` · ${NOME_DO_PLANO_ATENDE[contaDaEmpresa.plano]}` : contaDaEmpresa?.situacao === 'avaliacao' ? ' · Avaliação' : ''}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="rolagem-fina mt-3 flex-1 space-y-5 overflow-y-auto px-3 pb-2" aria-label="Menu">
        {grupos.map((g) => (
          <div key={g.rotulo}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-muted)]">{g.rotulo}</p>
            <div className="space-y-0.5">
              {g.itens.map((i) => {
                const aceso = ativo?.id === i.id;
                const contagem = contagemDe(i);
                return (
                  <button key={i.id} type="button" onClick={() => navegar(i)} aria-current={aceso ? 'page' : undefined} className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14px] transition-colors ${aceso ? 'bg-[var(--brand-soft)] font-semibold text-[var(--brand-ink)]' : 'font-medium text-[var(--sidebar-text)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}>
                    {aceso && <motion.span layoutId={`atende-menu-indicador-${copia}`} className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--brand)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    <span className={`shrink-0 ${aceso ? 'text-[var(--brand)]' : 'text-[var(--sidebar-muted)]'}`}>{i.icone}</span>
                    <span className="min-w-0 flex-1 truncate">{i.nome}</span>
                    {contagem > 0 && <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${i.id === 'central' ? 'bg-[var(--brand)] text-white' : 'bg-amber-100 text-amber-800'}`}>{contagem > 99 ? '99+' : contagem}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-[var(--sidebar-border)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {/* O WhatsApp da empresa */}
        <button type="button" onClick={podeGerirWhatsapp ? () => navegar({ id: 'whatsapp', tela: TELAS.whatsapp, nome: 'WhatsApp', icone: null }) : undefined} disabled={!podeGerirWhatsapp} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors enabled:hover:bg-[var(--bg)] disabled:cursor-default">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${whatsappConectado ? 'bg-emerald-50 text-emerald-600' : 'bg-[var(--bg-2)] text-[var(--text-muted)]'}`}>{whatsappConectado ? <Wifi size={15} /> : <WifiOff size={15} />}</span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
              <span className={`h-1.5 w-1.5 rounded-full ${whatsappConectado ? 'bg-emerald-500' : conexao ? 'bg-amber-400' : 'bg-slate-300'}`} />
              {textoDoWhatsapp}
            </span>
            <span className="block truncate text-[11px] text-[var(--text-muted)]">{conexao?.numero ? `+${conexao.numero}` : podeGerirWhatsapp ? 'Conectar pelo QR Code' : 'Fale com o administrador'}</span>
          </span>
          {podeGerirWhatsapp && <ChevronRight size={14} className="text-[var(--text-muted)]" />}
        </button>

        {/* A pessoa */}
        <div className="relative">
          <button type="button" onClick={() => setMenuNaBarra((v) => !v)} aria-expanded={menuNaBarra} aria-haspopup="menu" className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg)]">
            <Avatar nome={sessao.nome} tamanho={34} presenca={estadoDaPresenca} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold text-[var(--text)]">{sessao.nome}</span>
              <span className="block truncate text-[11px] text-[var(--text-muted)]">{NOME_DO_PAPEL[sessao.papel]}</span>
            </span>
            <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${menuNaBarra ? 'rotate-180' : ''}`} />
          </button>
          {menuNaBarra && <MenuDoUsuario aoFechar={() => setMenuNaBarra(false)} posicao="acima" tela={tela} estadoDaPresenca={estadoDaPresenca} alternarPresenca={alternarPresenca} notificacoes={notificacoes} ativando={ativandoNotificacoes} ativarNotificacoes={ativarNotificacoesDaBarra} irParaConta={() => navegar({ id: 'conta', tela: TELAS.conta, nome: 'Minha conta', icone: null })} sair={sairDaConta} />}
        </div>
        <LinhaSevla origem="atende" className="px-2.5 pt-1" />
      </div>
    </aside>
  );

  // Os quatro primeiros do menu vão para a navegação inferior; o resto fica na gaveta ("Mais").
  const principais = itens.slice(0, 4);
  const escondeMoldura = telaCheia;

  return (
    <div className="flex min-h-dvh bg-[var(--bg)]">
      <div className="hidden shrink-0 lg:sticky lg:top-0 lg:block lg:h-dvh lg:self-start">{barra('fixa')}</div>
      <AnimatePresence>
        {gavetaAberta && (
          <motion.div key="gaveta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-[#17153a]/40 backdrop-blur-[2px]" onClick={() => setGavetaAberta(false)} />
            <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }} className="absolute inset-y-0 left-0 h-full shadow-[var(--sombra-flutuante)]">
              {barra('gaveta')}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* O cabeçalho: título e descrição da tela, as ações dela, e o que é da pessoa (presença, avisos, perfil). */}
        {!escondeMoldura && (
          <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
            <div className="flex min-h-[calc(var(--topo)-1px)] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
              <button type="button" onClick={() => setGavetaAberta(true)} className="-ml-1 rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-2)] lg:hidden" aria-label="Abrir menu">
                <Menu size={20} />
              </button>
              <div className="min-w-0 flex-1 leading-tight">
                <h1 className="truncate text-[17px] font-semibold tracking-tight text-[var(--text)] lg:text-lg">{titulo ?? ativo?.nome ?? ''}</h1>
                {descricao && (
                  <p className="hidden truncate text-xs text-[var(--text-muted)] sm:block" title={descricao}>
                    {descricao}
                  </p>
                )}
              </div>
              <div ref={registrarAlvoDasAcoes} className="order-last flex w-full flex-wrap items-center gap-2 empty:hidden lg:order-none lg:w-auto" />
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={alternarPresenca} data-dica={estadoDaPresenca === 'ausente' ? 'Voltar a ficar online' : 'Ficar ausente (a IA não te manda conversas novas)'} className="hidden h-9 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg)] sm:inline-flex">
                  <span className={`h-2 w-2 rounded-full ${estadoDaPresenca === 'online' ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]' : estadoDaPresenca === 'ausente' ? 'bg-amber-400' : 'bg-slate-300'}`} />
                  {estadoDaPresenca === 'online' ? 'Online' : estadoDaPresenca === 'ausente' ? 'Ausente' : 'Conectando…'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (notificacoes === 'inativas') return void ativarNotificacoesDaBarra();
                    if (naoLidas > 0) return navegar(itens.find((i) => i.id === 'central') ?? { id: 'central', tela: TELAS.central, nome: 'Atendimentos', icone: null });
                    navegar({ id: 'conta', tela: TELAS.conta, nome: 'Minha conta', icone: null });
                  }}
                  disabled={ativandoNotificacoes}
                  data-dica={notificacoes === 'inativas' ? 'Ativar notificações neste aparelho' : naoLidas > 0 ? 'Ver o que está pendente' : 'Notificações'}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--text)] disabled:opacity-60"
                  aria-label="Notificações"
                >
                  {notificacoes === 'ativas' ? <BellRing size={18} /> : <Bell size={18} />}
                  {notificacoes === 'inativas' && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--brand)] ring-2 ring-[var(--surface)]" />}
                  {naoLidas > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold text-white ring-2 ring-[var(--surface)]">{naoLidas > 99 ? '99+' : naoLidas}</span>}
                </button>
                <div className="relative">
                  <button type="button" onClick={() => setMenuNoTopo((v) => !v)} aria-haspopup="menu" aria-expanded={menuNoTopo} className="flex h-9 items-center gap-2 rounded-full pl-0.5 pr-1 transition-colors hover:bg-[var(--bg-2)] sm:pr-2" aria-label="Perfil">
                    <Avatar nome={sessao.nome} tamanho={32} presenca={estadoDaPresenca} />
                    <ChevronDown size={14} className="hidden text-[var(--text-muted)] sm:block" />
                  </button>
                  {menuNoTopo && <MenuDoUsuario aoFechar={() => setMenuNoTopo(false)} posicao="abaixo" tela={tela} estadoDaPresenca={estadoDaPresenca} alternarPresenca={alternarPresenca} notificacoes={notificacoes} ativando={ativandoNotificacoes} ativarNotificacoes={ativarNotificacoesDaBarra} irParaConta={() => navegar({ id: 'conta', tela: TELAS.conta, nome: 'Minha conta', icone: null })} sair={sairDaConta} />}
                </div>
              </div>
            </div>
          </header>
        )}
        {!escondeMoldura && <FaixaDoPlano tela={tela} />}
        <main className={`min-w-0 flex-1 ${tela === TELAS.central ? '' : `p-4 pb-[calc(1rem+var(--nav-inferior)+3.5rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8`}`}>{children}</main>
      </div>

      {/* A navegação inferior do celular: as principais e "Mais". */}
      {!escondeMoldura && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--nav-inferior)+env(safe-area-inset-bottom))] items-stretch border-t border-[var(--border)] bg-[var(--surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Navegação">
          {principais.map((i) => {
            const aceso = ativo?.id === i.id;
            const contagem = contagemDe(i);
            return (
              <button key={i.id} type="button" onClick={() => navegar(i)} aria-current={aceso ? 'page' : undefined} className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${aceso ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}>
                <span className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${aceso ? 'bg-[var(--brand-soft)]' : ''}`}>
                  {i.icone}
                  {contagem > 0 && <span className="absolute -right-0.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[9px] font-bold text-white ring-2 ring-[var(--surface)]">{contagem > 99 ? '99+' : contagem}</span>}
                </span>
                <span className="max-w-full truncate px-1">{i.nome}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setGavetaAberta(true)} className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${ativo && !principais.some((p) => p.id === ativo.id) ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`} aria-label="Mais opções">
            <span className={`flex h-7 w-12 items-center justify-center rounded-full ${ativo && !principais.some((p) => p.id === ativo.id) ? 'bg-[var(--brand-soft)]' : ''}`}>
              <MoreHorizontal size={18} />
            </span>
            Mais
          </button>
        </nav>
      )}

      {/* O Jatobá dentro do Atende: a operação de agora, achar conversa, abrir tela, ensinar. Faz parte da IA do produto (mesmo plano da triagem). */}
      {(!contaDaEmpresa || planoAtendeLibera(contaDaEmpresa.plano, 'triagem-ia')) && <Jatoba modo="painel" produto="atende" pedir={(caminho, corpo) => api.post(caminho, corpo)} onAbrir={(t, r) => ir(t as Tela, r)} />}
    </div>
  );
}

/** O menu da pessoa: conta, presença, notificações, SEVLA e sair. Fecha ao clicar fora ou com Esc. */
function MenuDoUsuario({ aoFechar, posicao, tela, estadoDaPresenca, alternarPresenca, notificacoes, ativando, ativarNotificacoes, irParaConta, sair }: { aoFechar: () => void; posicao: 'acima' | 'abaixo'; tela: Tela | null; estadoDaPresenca: 'online' | 'ausente' | 'offline'; alternarPresenca: () => void; notificacoes: EstadoDasNotificacoes | null; ativando: boolean; ativarNotificacoes: () => void; irParaConta: () => void; sair: () => void }) {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[aria-haspopup="menu"]')) aoFechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('mousedown', fora);
    window.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('keydown', tecla);
    };
  }, [aoFechar]);
  const item = 'flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg)] disabled:opacity-60';
  return (
    <motion.div ref={ref} role="menu" initial={{ opacity: 0, y: posicao === 'acima' ? 6 : -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.14 }} className={`absolute z-50 w-72 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--sombra-flutuante)] ${posicao === 'acima' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'}`}>
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <Avatar nome={sessao.nome} tamanho={36} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-[var(--text)]">{sessao.nome}</p>
          <p className="truncate text-[11px] text-[var(--text-muted)]">{sessao.email}</p>
          <p className="text-[11px] font-medium text-[var(--brand)]">{NOME_DO_PAPEL[sessao.papel]}</p>
        </div>
      </div>
      <div className="my-1 h-px bg-[var(--border)]" />
      <button type="button" role="menuitem" onClick={irParaConta} className={`${item} ${tela === TELAS.conta ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]' : ''}`}>
        <UserCircle size={16} className="text-[var(--text-muted)]" /> Minha conta
      </button>
      <button type="button" role="menuitem" onClick={() => { alternarPresenca(); aoFechar(); }} className={item}>
        <span className={`ml-1 mr-1 h-2 w-2 rounded-full ${estadoDaPresenca === 'online' ? 'bg-emerald-500' : estadoDaPresenca === 'ausente' ? 'bg-amber-400' : 'bg-slate-300'}`} />
        {estadoDaPresenca === 'ausente' ? 'Voltar a ficar online' : 'Ficar ausente'}
        <span className="ml-auto whitespace-nowrap text-[10px] font-normal text-[var(--text-muted)]">{estadoDaPresenca === 'ausente' ? 'volta a receber' : 'sem conversas novas'}</span>
      </button>
      {notificacoes === 'inativas' && (
        <button type="button" role="menuitem" onClick={ativarNotificacoes} disabled={ativando} className={item}>
          <Bell size={16} className="text-[var(--brand)]" /> {ativando ? 'Ativando…' : 'Ativar notificações'}
          <span className="ml-auto whitespace-nowrap text-[10px] font-normal text-[var(--text-muted)]">neste aparelho</span>
        </button>
      )}
      <a href={SEVLA_LINKS.conta} role="menuitem" className={item}>
        <img src={SEVLA_LINKS.simbolo} alt="" width={16} height={16} className="h-4 w-4 rounded object-contain" aria-hidden /> Minha SEVLA
        <span className="ml-auto whitespace-nowrap text-[10px] font-normal text-[var(--text-muted)]">conta e planos</span>
      </a>
      <div className="my-1 h-px bg-[var(--border)]" />
      <button type="button" role="menuitem" onClick={sair} className={`${item} text-[var(--vermelho)] hover:bg-rose-50`}>
        <LogOut size={16} /> Sair
      </button>
    </motion.div>
  );
}

/**
 * A faixa do plano, acima do conteúdo: avaliação acabando, carência ou
 * bloqueio. Só quando há algo a dizer; na própria tela de plano não repete.
 */
function FaixaDoPlano({ tela }: { tela: Tela | null }) {
  const conta = useDadosAtende((s) => s.conta);
  const sessao = useSessaoAtende((s) => s.sessao);
  const navegar = useRotaAtende((s) => s.ir);
  if (!conta || tela === TELAS.plano) return null;
  const admin = sessao ? pode(sessao.papel, 'empresa.gerir') : false;

  let texto: string | null = null;
  let tom = 'border-sky-200 bg-sky-50 text-sky-900';
  if (conta.situacao === 'bloqueada') {
    texto = 'A avaliação do Atende Aí terminou. O atendimento fica pausado até um plano ser ativado.';
    tom = 'border-rose-200 bg-rose-50 text-rose-900';
  } else if (conta.situacao === 'carencia') {
    texto = `O plano ${NOME_DO_PLANO_ATENDE[conta.plano]} venceu. ${conta.dias_restantes ?? 0} ${conta.dias_restantes === 1 ? 'dia' : 'dias'} de carência antes de o atendimento pausar.`;
    tom = 'border-amber-200 bg-amber-50 text-amber-900';
  } else if (conta.situacao === 'avaliacao' && conta.dias_restantes !== null && conta.dias_restantes <= 3) {
    texto = conta.dias_restantes <= 0 ? 'A avaliação termina hoje.' : `A avaliação termina em ${conta.dias_restantes} ${conta.dias_restantes === 1 ? 'dia' : 'dias'}.`;
  }
  if (!texto) return null;

  return (
    <div className={`flex flex-col gap-2 border-b px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 ${tom}`}>
      <span className="font-medium">{texto}</span>
      {admin ? (
        <button type="button" onClick={() => navegar(TELAS.plano)} className="shrink-0 self-start rounded-lg bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--text)] shadow-sm hover:bg-white sm:self-auto">
          Ver planos
        </button>
      ) : (
        <span className="text-xs opacity-80">Fale com o administrador da empresa.</span>
      )}
    </div>
  );
}

