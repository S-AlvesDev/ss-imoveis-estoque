import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '@/store/auth';
import { useEstoqueData } from '@/features/estoque/useEstoqueData';
import { Login } from '@/pages/Login/Login';
import { Home } from '@/pages/Home/Home';
import { ROTAS, useRouter } from '@/app/router';
import { Dashboard } from '@/pages/Dashboard/Dashboard';
import { Estoque } from '@/pages/Estoque/Estoque';
import { Emprestimo } from '@/pages/Estoque/Emprestimo';
import { Entrega } from '@/pages/Estoque/Entrega';
import { Validade } from '@/pages/Estoque/Validade';
import { Patrimonio } from '@/pages/Estoque/Patrimonio';
import { PrimeiroEstoque } from '@/pages/Estoque/PrimeiroEstoque';
import { Admin } from '@/pages/Admin/Admin';
import { Alertas } from '@/pages/Alertas/Alertas';
import { Suporte } from '@/pages/Suporte/Suporte';
import { Usuarios } from '@/pages/Usuarios/Usuarios';
import { Ajuda } from '@/pages/Ajuda/Ajuda';
import { Configuracoes } from '@/pages/Configuracoes/Configuracoes';
import { UpdateBanner } from '@/features/changelog/UpdateGuide';
import { useUnidade } from '@/store/unidade';
import { Sidebar, navItemsFor, estoqueDaView, type AppView } from '@/app/Sidebar';
import { TopBar } from '@/app/TopBar';
import { Stripes } from '@/shared/ui/Stripes';
import { Logo } from '@/shared/ui/Logo';
import { ADMIN_ROLES } from '@/shared/constants';
import { PRODUTO } from '@/shared/produto';
import { needsPurchase } from '@/features/estoque/utils';

function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)]">
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="rounded-full bg-white p-1.5 shadow-lg ring-1 ring-black/5"
      >
        <Logo size={40} />
      </motion.div>
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Carregando estoque</p>
      <Stripes className="h-1 w-24 rounded-full" color="rgba(255,138,36,0.85)" dense />
    </div>
  );
}

function ViewTransition({ viewKey, children }: { viewKey: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Painel',
  materiais: 'Materiais',
  alertas: 'Alertas de Estoque',
  suporte: 'Suporte',
  ajuda: 'Ajuda',
  usuarios: 'Usuários',
  configuracoes: 'Configurações',
};

function InventoryApp({ role }: { role: string }) {
  const [view, setView] = useState<AppView | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { materials, catalogo, materialMovements, staff, unidades, unidadesAtivas, depositos, depositosDaUnidade, unidade, nivelEm, estoquesVisiveis, categorias, emprestimos, lotes, itens: itensDePatrimonio, loading, atualizadoEm, refetch } = useEstoqueData();
  const setUnidade = useUnidade((s) => s.setUnidade);

  const isAdmin = ADMIN_ROLES.includes(role);
  const itens = navItemsFor(role, estoquesVisiveis);
  const nomesDeCategorias = categorias.map((c) => c.nome);

  // A tela inicial é a primeira que a pessoa pode ver: admin no dashboard,
  // operador no depósito dele. Se a tela atual sumiu (trocou de unidade e
  // não tem acesso lá), volta para a primeira disponível.
  const landingView: AppView = itens[0]?.view ?? 'suporte';
  const viewAtual: AppView = view && itens.some((i) => i.view === view) ? view : landingView;

  // Onde um material "abre" pela busca: Materiais para quem administra, o primeiro estoque da pessoa para quem opera.
  const telaDeMaterial: AppView | null = isAdmin ? 'materiais' : (itens.find((i) => estoqueDaView(i.view))?.view ?? null);
  const estoqueAtual = estoqueDaView(viewAtual) ? depositosDaUnidade.find((d) => d.id === estoqueDaView(viewAtual)) ?? null : null;
  const alertas = materials.filter(needsPurchase).length;

  // O título da tela saiu da barra do topo e foi para a aba do navegador.
  useEffect(() => {
    document.title = loading ? PRODUTO.nome : `${estoqueAtual?.nome ?? VIEW_TITLES[viewAtual] ?? PRODUTO.nome} · ${PRODUTO.nome}`;
  }, [loading, viewAtual, estoqueAtual]);

  if (loading) return <LoadingScreen />;

  // Organização sem estoque nenhum: o primeiro acesso pergunta qual é.
  if (depositos.length === 0) {
    if (isAdmin && unidade) return <PrimeiroEstoque unidade={unidade} onCriado={refetch} />;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-center">
        <div>
          <p className="text-lg font-bold text-[var(--text)]">A empresa ainda não tem estoque cadastrado.</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Peça ao administrador para criar o primeiro estoque.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <Sidebar
        active={viewAtual}
        onChange={setView}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        unidades={unidadesAtivas}
        unidade={unidade}
        onChangeUnidade={setUnidade}
        onNovaUnidade={isAdmin ? () => setView('configuracoes') : undefined}
        estoques={estoquesVisiveis}
        alertas={alertas}
        totalMateriais={materials.length}
      />
      <div className="min-w-0 flex-1">
        <TopBar
          onMenuClick={() => setMobileNavOpen(true)}
          materials={materials}
          destinos={itens}
          telaDeMaterial={telaDeMaterial}
          onNavigate={setView}
          alertas={alertas}
          podeVerAlertas={isAdmin}
        />
        <main className="p-6">
          {/* Novidades aparecem uma vez por versao, na tela inicial de cada perfil. */}
          {viewAtual === landingView && <UpdateBanner />}
          <ViewTransition viewKey={viewAtual}>
            {viewAtual === 'dashboard' && (
              <Dashboard
                materials={materials}
                materialMovements={materialMovements}
                unidade={unidade}
                depositos={depositosDaUnidade}
                unidadeUnica={unidadesAtivas.length <= 1}
                atualizadoEm={atualizadoEm}
                categorias={nomesDeCategorias}
                onNavigate={setView}
              />
            )}
            {viewAtual === 'alertas' && <Alertas materials={materials} depositos={depositosDaUnidade} emprestimos={emprestimos} lotes={lotes} categorias={nomesDeCategorias} />}
            {viewAtual === 'materiais' && (
              <Admin materials={catalogo} materialMovements={materialMovements} staff={staff} categorias={nomesDeCategorias} depositos={depositosDaUnidade} refetch={refetch} />
            )}
            {estoqueAtual && estoqueAtual.modo === 'almoxarifado' && (
              <Estoque
                deposito={estoqueAtual}
                depositosDaUnidade={depositosDaUnidade}
                materials={materials}
                materialMovements={materialMovements}
                staff={staff}
                categorias={nomesDeCategorias}
                refetch={refetch}
                podeOperar={nivelEm(estoqueAtual.id) === 'OPERA'}
              />
            )}
            {estoqueAtual && estoqueAtual.modo === 'emprestimo' && (
              <Emprestimo deposito={estoqueAtual} materials={materials} emprestimos={emprestimos} staff={staff} refetch={refetch} podeOperar={nivelEm(estoqueAtual.id) === 'OPERA'} />
            )}
            {estoqueAtual && estoqueAtual.modo === 'entrega' && (
              <Entrega deposito={estoqueAtual} materials={materials} emprestimos={emprestimos} staff={staff} refetch={refetch} podeOperar={nivelEm(estoqueAtual.id) === 'OPERA'} />
            )}
            {estoqueAtual && estoqueAtual.modo === 'validade' && (
              <Validade
                deposito={estoqueAtual}
                materials={materials.filter((m) => estoqueAtual.id in m.saldos_unidade)}
                lotes={lotes}
                outrosEstoques={depositosDaUnidade.filter((d) => d.id !== estoqueAtual.id && d.ativo && d.modo !== 'patrimonio')}
                refetch={refetch}
                podeOperar={nivelEm(estoqueAtual.id) === 'OPERA'}
              />
            )}
            {estoqueAtual && estoqueAtual.modo === 'patrimonio' && (
              <Patrimonio deposito={estoqueAtual} materials={materials.filter((m) => estoqueAtual.id in m.saldos_unidade)} itens={itensDePatrimonio} staff={staff} refetch={refetch} podeOperar={nivelEm(estoqueAtual.id) === 'OPERA'} />
            )}
            {viewAtual === 'suporte' && <Suporte materials={catalogo} />}
            {viewAtual === 'ajuda' && <Ajuda />}
            {viewAtual === 'usuarios' && isAdmin && <Usuarios />}
            {viewAtual === 'configuracoes' && isAdmin && (
              <Configuracoes unidades={unidades} depositos={depositos} catalogo={catalogo} categorias={categorias} refetch={refetch} onSelecionarUnidade={setUnidade} />
            )}
          </ViewTransition>
        </main>
      </div>
    </div>
  );
}

/**
 * Antes de entrar, a URL decide a tela: a Home pública, entrar ou criar
 * conta — qualquer outro caminho cai na Home. Depois de entrar, o sistema
 * é um só e mora em "/": a barra lateral navega por estado, não por URL.
 */
export default function App() {
  const user = useAuth((s) => s.user);
  const path = useRouter((s) => s.path);
  const navigate = useRouter((s) => s.navigate);

  // Entrou (ou já estava) em /entrar ou /criar-conta: a URL volta para a raiz,
  // para um F5 não reabrir a tela de login por cima do painel.
  useEffect(() => {
    if (user && path !== ROTAS.home) navigate(ROTAS.home, { replace: true });
  }, [user, path, navigate]);

  let tela: React.ReactNode;
  if (user) tela = <InventoryApp role={user.role} />;
  else if (path === ROTAS.entrar) tela = <Login modo="entrar" />;
  else if (path === ROTAS.criarConta) tela = <Login modo="criar" />;
  else if (path === ROTAS.esqueciSenha) tela = <Login modo="esqueci" />;
  else if (path === ROTAS.redefinirSenha) tela = <Login modo="redefinir" />;
  else tela = <Home />;

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      {tela}
    </>
  );
}
