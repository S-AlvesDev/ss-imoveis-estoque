import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '@/store/auth';
import { useEstoqueData } from '@/features/estoque/useEstoqueData';
import { Login } from '@/pages/Login/Login';
import { Home } from '@/pages/Home/Home';
import { ROTAS, useRouter } from '@/app/router';
import { Dashboard } from '@/pages/Dashboard/Dashboard';
import { Central } from '@/pages/Central/Central';
import { Obra } from '@/pages/Obra/Obra';
import { Admin } from '@/pages/Admin/Admin';
import { Alertas } from '@/pages/Alertas/Alertas';
import { Suporte } from '@/pages/Suporte/Suporte';
import { Usuarios } from '@/pages/Usuarios/Usuarios';
import { Ajuda } from '@/pages/Ajuda/Ajuda';
import { Configuracoes } from '@/pages/Configuracoes/Configuracoes';
import { UpdateBanner } from '@/features/changelog/UpdateGuide';
import { useUnidade } from '@/store/unidade';
import { Sidebar, navItemsFor, type AppView } from '@/app/Sidebar';
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

const VIEW_TITLES: Record<AppView, string> = {
  dashboard: 'Painel',
  materiais: 'Materiais',
  alertas: 'Alertas de Estoque',
  central: 'Almoxarifado Central',
  obra: 'Almoxarifado de Obra',
  suporte: 'Suporte',
  ajuda: 'Ajuda',
  usuarios: 'Usuários',
  configuracoes: 'Configurações',
};

function InventoryApp({ role }: { role: string }) {
  const [view, setView] = useState<AppView | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { materials, catalogo, materialMovements, staff, unidades, unidadesAtivas, depositos, depositosDaUnidade, unidade, nivelEm, loading, atualizadoEm, refetch } = useEstoqueData();
  const setUnidade = useUnidade((s) => s.setUnidade);

  const isAdmin = ADMIN_ROLES.includes(role);
  const acesso = { central: nivelEm('CENTRAL'), obra: nivelEm('OBRA') };
  const itens = navItemsFor(role, acesso);

  // A tela inicial é a primeira que a pessoa pode ver: admin no dashboard,
  // operador no depósito dele. Se a tela atual sumiu (trocou de unidade e
  // não tem acesso lá), volta para a primeira disponível.
  const landingView: AppView = itens[0]?.view ?? 'suporte';
  const viewAtual: AppView = view && itens.some((i) => i.view === view) ? view : landingView;

  // Onde um material "abre" pela busca: Materiais para quem administra, o depósito da pessoa para quem opera.
  const telaDeMaterial: AppView | null = isAdmin ? 'materiais' : (itens.find((i) => i.view === 'central' || i.view === 'obra')?.view ?? null);
  const alertas = materials.filter(needsPurchase).length;

  // O título da tela saiu da barra do topo e foi para a aba do navegador.
  useEffect(() => {
    document.title = loading ? PRODUTO.nome : `${VIEW_TITLES[viewAtual]} · ${PRODUTO.nome}`;
  }, [loading, viewAtual]);

  if (loading) return <LoadingScreen />;

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
        acesso={acesso}
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
                onNavigate={setView}
              />
            )}
            {viewAtual === 'alertas' && <Alertas materials={materials} />}
            {viewAtual === 'materiais' && (
              <Admin materials={catalogo} materialMovements={materialMovements} staff={staff} refetch={refetch} />
            )}
            {viewAtual === 'central' && (
              <Central materials={materials} materialMovements={materialMovements} staff={staff} refetch={refetch} podeOperar={acesso.central === 'OPERA'} />
            )}
            {viewAtual === 'obra' && (
              <Obra materials={materials} materialMovements={materialMovements} staff={staff} refetch={refetch} podeOperar={acesso.obra === 'OPERA'} />
            )}
            {viewAtual === 'suporte' && <Suporte materials={catalogo} />}
            {viewAtual === 'ajuda' && <Ajuda />}
            {viewAtual === 'usuarios' && isAdmin && <Usuarios />}
            {viewAtual === 'configuracoes' && isAdmin && (
              <Configuracoes unidades={unidades} depositos={depositos} catalogo={catalogo} refetch={refetch} onSelecionarUnidade={setUnidade} />
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
