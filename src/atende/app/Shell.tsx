import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, Bell, Building2, ChevronRight, CreditCard, Eye, LogOut, Menu, MessageSquare, Smartphone, UserCircle, Users, UsersRound, Wifi, WifiOff } from 'lucide-react';
import { MarcaAtende, Simbolo } from './Marca';
import { TELAS, useRotaAtende, type Tela } from './router';
import { useSessaoAtende } from './store/sessao';
import { useDadosAtende } from './store/dados';
import { useCentral } from './store/central';
import { api } from './lib/api';
import { toast } from 'sonner';
import { presencaEfetiva } from '../shared/presenca';
import { useSincronizacao } from './store/useSincronizacao';
import { useNotificacoes } from './store/useNotificacoes';
import { ativarNotificacoes, estadoDasNotificacoes, type EstadoDasNotificacoes } from './notificacoes';
import { pode, NOME_DO_PAPEL, type Permissao } from '../shared/papeis';
import { ATENDE } from '../shared/produto';
import { NOME_DO_PLANO_ATENDE } from '../shared/planos';

/**
 * A moldura do Atende Aí depois de entrar — a mesma lógica da barra do Stok
 * Aí: marca no topo, o contexto logo abaixo (lá é a unidade; aqui, a
 * empresa), grupos de telas com rótulo, a pílula da tela ativa, contagens
 * onde há o que contar (não lidas na Central, fila na Supervisão), um cartão
 * de estado no rodapé (o WhatsApp da empresa) e Sair. No celular, gaveta.
 */
interface Item {
  tela: Tela;
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
        { tela: TELAS.central, nome: 'Central', icone: <MessageSquare size={18} />, permissao: 'conversas.atender' },
        { tela: TELAS.supervisao, nome: 'Supervisão', icone: <Eye size={18} />, permissao: 'conversas.supervisionar' },
        { tela: TELAS.dashboard, nome: 'Dashboard', icone: <BarChart3 size={18} />, permissao: 'dashboard.ver' },
      ]),
    },
    {
      rotulo: 'Empresa',
      itens: so([
        { tela: TELAS.empresa, nome: 'Empresa e IA', icone: <Building2 size={18} />, permissao: 'empresa.gerir' },
        { tela: TELAS.times, nome: 'Times', icone: <UsersRound size={18} />, permissao: 'times.gerir' },
        { tela: TELAS.equipe, nome: 'Equipe', icone: <Users size={18} />, permissao: 'equipe.ver' },
        { tela: TELAS.whatsapp, nome: 'WhatsApp', icone: <Smartphone size={18} />, permissao: 'whatsapp.gerir' },
        { tela: TELAS.plano, nome: 'Plano', icone: <CreditCard size={18} />, permissao: 'empresa.gerir' },
      ]),
    },
  ];
  return grupos.filter((g) => g.itens.length > 0);
}

/** Lista achatada — decide a tela inicial de cada papel. */
export function itensDoMenu(papel: string): Item[] {
  return gruposDoMenu(papel).flatMap((g) => g.itens);
}

/** O cartão do rodapé: o WhatsApp da empresa, como o Stok Aí mostra a saúde do estoque. */
function CartaoDoWhatsapp({ onClick }: { onClick?: () => void }) {
  const conexao = useCentral((s) => s.conexao);
  const conectado = conexao?.estado === 'conectada';
  const cor = conectado ? 'var(--verde)' : conexao ? 'var(--amarelo)' : 'var(--sidebar-muted)';
  const texto = conectado ? 'Conectado' : conexao?.estado === 'conectando' || conexao?.estado === 'aguardando_qr' ? 'Aguardando QR' : conexao ? 'Desconectado' : 'Não conectado';
  const conteudo = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand)]">{conectado ? <Wifi size={15} /> : <WifiOff size={15} />}</span>
        <span className="text-sm font-bold text-white">WhatsApp da empresa</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--sidebar-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: cor, boxShadow: conectado ? `0 0 8px ${cor}` : undefined }} />
          <span className="font-semibold text-white">{texto}</span>
          {conexao?.numero && <span>· +{conexao.numero}</span>}
        </span>
        {onClick && <ChevronRight size={14} />}
      </div>
    </>
  );
  const cls = 'w-full rounded-2xl border border-[var(--sidebar-border)] bg-white/[0.04] p-4 text-left';
  if (!onClick) return <div className={cls}>{conteudo}</div>;
  return (
    <button type="button" onClick={onClick} className={`${cls} transition-colors hover:bg-white/[0.07]`}>
      {conteudo}
    </button>
  );
}

export function Shell({ tela, children }: { tela: Tela | null; children: ReactNode }) {
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const sair = useSessaoAtende((s) => s.sair);
  const limpar = useDadosAtende((s) => s.limpar);
  const limparCentral = useCentral((s) => s.limpar);
  const empresa = useDadosAtende((s) => s.empresa);
  const conversas = useCentral((s) => s.conversas);
  const ir = useRotaAtende((s) => s.ir);
  const grupos = gruposDoMenu(sessao.papel);

  // O relógio do sync mora aqui: em qualquer tela a pessoa continua presente e as contagens da barra continuam certas.
  useSincronizacao({ carregarLista: false });

  // As contagens da barra: não lidas nas minhas conversas e na fila (Central); quantas na fila (Supervisão).
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

  function navegar(t: Tela) {
    ir(t);
    setGavetaAberta(false);
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

  const barra = (
    <aside className="relative flex h-full w-64 flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] pt-[env(safe-area-inset-top)] text-[var(--sidebar-text)]">
      <div className="grain pointer-events-none absolute inset-0 opacity-[0.25]" />
      {/* O brilho que sobe do canto — violeta, a cor da casa aqui. */}
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-[var(--brand)]/25 blur-3xl" />

      {/* A marca */}
      <div className="relative flex h-[4.5rem] shrink-0 items-center justify-between px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Simbolo tamanho={36} />
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-extrabold text-white">
              Atende <span className="text-[var(--lilas)]">Aí</span>
            </p>
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--sidebar-muted)]">{ATENDE.slogan}</p>
          </div>
        </div>
        <button type="button" onClick={() => setGavetaAberta(false)} className="rounded-lg p-1.5 text-[var(--sidebar-muted)] hover:bg-white/10 lg:hidden" aria-label="Fechar menu">
          <ChevronRight size={18} className="rotate-180" />
        </button>
      </div>

      {/* O contexto: a empresa (o equivalente à unidade no Stok Aí). */}
      {empresa && (
        <div className="relative px-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--sidebar-border)] bg-white/[0.04] px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/20 text-[var(--lilas)]">
              <Building2 size={15} />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-white">{empresa.nome}</p>
              <p className="truncate text-[11px] text-[var(--sidebar-muted)]">{empresa.segmento || 'Empresa'}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="relative mt-3 flex-1 space-y-6 overflow-y-auto px-3 pb-2">
        {grupos.map((g) => (
          <div key={g.rotulo}>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--sidebar-muted)]">{g.rotulo}</p>
            <div className="space-y-1">
              {g.itens.map((i) => {
                const ativo = tela === i.tela;
                const contagem = i.tela === TELAS.central ? naoLidas : i.tela === TELAS.supervisao ? naFila : 0;
                return (
                  <button key={i.tela} type="button" onClick={() => navegar(i.tela)} className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${ativo ? 'text-white' : 'text-[var(--sidebar-text)] hover:bg-white/[0.06] hover:text-white'}`}>
                    {ativo && <motion.div layoutId="atende-sidebar-pill" className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand)]/40 shadow-[0_8px_24px_-8px_var(--brand)]" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                    <span className={`relative ${ativo ? 'text-white' : 'text-[var(--sidebar-muted)]'}`}>{i.icone}</span>
                    <span className="relative flex-1 text-left">{i.nome}</span>
                    {contagem > 0 && (
                      <span className={`relative flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${i.tela === TELAS.central ? 'bg-[var(--vermelho)] shadow-[0_0_12px_rgba(239,68,68,0.5)]' : 'bg-[var(--amarelo)] text-[#1a1200]'}`}>
                        {contagem > 99 ? '99+' : contagem}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative shrink-0 space-y-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <CartaoDoWhatsapp onClick={pode(sessao.papel, 'whatsapp.gerir') ? () => navegar(TELAS.whatsapp) : undefined} />
        <button type="button" onClick={() => navegar(TELAS.conta)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${tela === TELAS.conta ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'}`}>
          <UserCircle size={18} className="shrink-0 text-[var(--sidebar-muted)]" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-white">{sessao.nome}</span>
            <span className="block truncate text-[11px] text-[var(--sidebar-muted)]">{NOME_DO_PAPEL[sessao.papel]}</span>
          </span>
        </button>
        <button type="button" onClick={alternarPresenca} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.06]" title={estadoDaPresenca === 'ausente' ? 'Voltar a ficar online' : 'Ficar ausente (não recebe conversas novas da IA)'}>
          <span className={`ml-1 h-2.5 w-2.5 shrink-0 rounded-full ${estadoDaPresenca === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : estadoDaPresenca === 'ausente' ? 'bg-amber-400' : 'bg-slate-500'}`} />
          <span className="flex-1 font-semibold text-[var(--sidebar-text)]">{estadoDaPresenca === 'online' ? 'Online' : estadoDaPresenca === 'ausente' ? 'Ausente' : 'Conectando…'}</span>
          <span className="text-[10px] text-[var(--sidebar-muted)]">{estadoDaPresenca === 'ausente' ? 'voltar' : 'ficar ausente'}</span>
        </button>
        {notificacoes === 'inativas' && (
          <button type="button" onClick={ativarNotificacoesDaBarra} disabled={ativandoNotificacoes} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.06] disabled:opacity-60" title="Receber aviso de cliente respondendo e conversa nova, mesmo com o Atende fechado">
            <Bell size={16} className="ml-[-1px] shrink-0 text-[var(--brand)]" />
            <span className="flex-1 font-semibold text-[var(--sidebar-text)]">{ativandoNotificacoes ? 'Ativando…' : 'Ativar notificações'}</span>
            <span className="text-[10px] text-[var(--sidebar-muted)]">neste aparelho</span>
          </button>
        )}
        <button type="button" onClick={sairDaConta} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-[var(--sidebar-text)] transition-colors hover:bg-white/[0.06] hover:text-white">
          <LogOut size={18} className="text-[var(--sidebar-muted)]" />
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-dvh bg-[var(--bg)]">
      <div className="hidden shrink-0 lg:sticky lg:top-0 lg:block lg:h-screen lg:self-start">{barra}</div>
      <AnimatePresence>
        {gavetaAberta && (
          <motion.div key="gaveta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setGavetaAberta(false)} />
            <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }} className="absolute inset-y-0 left-0 h-full shadow-2xl">
              {barra}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="min-w-0 flex-1">
        {/* No app instalado no iPhone o conteúdo passa por baixo da barra de status: o cabeçalho desce o safe-area. */}
        <header className="flex h-[calc(57px+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 pt-[env(safe-area-inset-top)] lg:hidden">
          <button type="button" onClick={() => setGavetaAberta(true)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)]" aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <MarcaAtende tema="claro" tamanho={26} />
        </header>
        <FaixaDoPlano tela={tela} />
        <main className="min-w-0 p-4 sm:p-6">{children}</main>
      </div>
    </div>
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
  let tom = 'border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-100';
  if (conta.situacao === 'bloqueada') {
    texto = 'A avaliação do Atende Aí terminou. O atendimento fica pausado até um plano ser ativado.';
    tom = 'border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-100';
  } else if (conta.situacao === 'carencia') {
    texto = `O plano ${NOME_DO_PLANO_ATENDE[conta.plano]} venceu. ${conta.dias_restantes ?? 0} ${conta.dias_restantes === 1 ? 'dia' : 'dias'} de carência antes de o atendimento pausar.`;
    tom = 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100';
  } else if (conta.situacao === 'avaliacao' && conta.dias_restantes !== null && conta.dias_restantes <= 3) {
    texto = conta.dias_restantes <= 0 ? 'A avaliação termina hoje.' : `A avaliação termina em ${conta.dias_restantes} ${conta.dias_restantes === 1 ? 'dia' : 'dias'}.`;
  }
  if (!texto) return null;

  return (
    <div className={`flex flex-col gap-2 border-b px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 ${tom}`}>
      <span className="font-medium">{texto}</span>
      {admin ? (
        <button type="button" onClick={() => navegar(TELAS.plano)} className="shrink-0 self-start rounded-lg bg-white/70 px-3 py-1 text-xs font-bold text-[var(--text)] hover:bg-white dark:bg-white/10 dark:text-white dark:hover:bg-white/20 sm:self-auto">
          Ver planos
        </button>
      ) : (
        <span className="text-xs opacity-80">Fale com o administrador da empresa.</span>
      )}
    </div>
  );
}
