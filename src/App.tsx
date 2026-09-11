import { useState } from 'react';
import { Toaster } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '@/store/auth';
import { useEstoqueData } from '@/features/estoque/useEstoqueData';
import { Login } from '@/pages/Login/Login';
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
import { Sidebar, navItemsForRole, type AppView } from '@/app/Sidebar';
import { TopBar } from '@/app/TopBar';
import { Stripes } from '@/shared/ui/Stripes';
import { Logo } from '@/shared/ui/Logo';
import { ADMIN_ROLES, OBRA_ROLES } from '@/shared/constants';

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
      <Stripes className="h-1 w-24 rounded-full" color="rgba(255,142,41,0.85)" dense />
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
  dashboard: 'Painel Administrativo',
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
  // A tela inicial varia por perfil: admin no dashboard, operador no seu almoxarifado.
  const landingView = navItemsForRole(role)[0]?.view ?? 'suporte';
  const [view, setView] = useState<AppView>(landingView);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { materials, catalogo, materialMovements, staff, unidades, depositos, unidade, loading, refetch } = useEstoqueData();
  const setUnidade = useUnidade((s) => s.setUnidade);

  if (loading) return <LoadingScreen />;

  const isAdmin = ADMIN_ROLES.includes(role);
  const isObra = OBRA_ROLES.includes(role) && !isAdmin;

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <Sidebar
        active={view}
        onChange={setView}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        unidades={unidades}
        unidade={unidade}
        onChangeUnidade={setUnidade}
        onNovaUnidade={isAdmin ? () => setView('configuracoes') : undefined}
      />
      <div className="min-w-0 flex-1">
        <TopBar title={VIEW_TITLES[view]} subtitle={unidade?.nome} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="p-6">
          {/* Novidades aparecem uma vez por versao, na tela inicial de cada perfil. */}
          {view === landingView && <UpdateBanner />}
          <ViewTransition viewKey={view}>
            {view === 'dashboard' && <Dashboard materials={materials} materialMovements={materialMovements} />}
            {view === 'alertas' && <Alertas materials={materials} />}
            {view === 'materiais' && (
              <Admin materials={catalogo} materialMovements={materialMovements} staff={staff} refetch={refetch} />
            )}
            {view === 'central' && (
              <Central materials={materials} materialMovements={materialMovements} staff={staff} refetch={refetch} />
            )}
            {view === 'obra' && (
              <Obra materials={materials} materialMovements={materialMovements} staff={staff} refetch={refetch} />
            )}
            {view === 'suporte' && <Suporte materials={catalogo} />}
            {view === 'ajuda' && <Ajuda />}
            {view === 'usuarios' && isAdmin && <Usuarios />}
            {view === 'configuracoes' && isAdmin && (
              <Configuracoes unidades={unidades} depositos={depositos} catalogo={catalogo} refetch={refetch} onSelecionarUnidade={setUnidade} />
            )}
          </ViewTransition>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const user = useAuth((s) => s.user);

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      {!user ? <Login /> : <InventoryApp role={user.role} />}
    </>
  );
}
