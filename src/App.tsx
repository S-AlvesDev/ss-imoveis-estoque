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
import { Sidebar, type AdminView } from '@/app/Sidebar';
import { TopBar } from '@/app/TopBar';
import { Stripes } from '@/shared/ui/Stripes';
import { Logo } from '@/shared/ui/Logo';
import { ADMIN_ROLES, OBRA_ROLES } from '@/shared/constants';

function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950">
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="rounded-full bg-white/95 p-1.5 shadow-lg"
      >
        <Logo size={40} />
      </motion.div>
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate-500">Carregando estoque</p>
      <Stripes className="h-1 w-24 rounded-full" color="rgba(245,158,11,0.85)" dense />
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

function AdminApp() {
  const [view, setView] = useState<AdminView>('dashboard');
  const { materials, materialMovements, staff, loading, refetch } = useEstoqueData();

  if (loading) return <LoadingScreen />;

  return (
    <div className="flex">
      <Sidebar active={view} onChange={setView} />
      <div className="flex-1">
        <TopBar title="Painel Administrativo" />
        <main className="p-6">
          <ViewTransition viewKey={view}>
            {view === 'dashboard' && <Dashboard materials={materials} materialMovements={materialMovements} />}
            {view === 'central' && (
              <Central materials={materials} materialMovements={materialMovements} staff={staff} refetch={refetch} />
            )}
            {view === 'obra' && <Obra materials={materials} materialMovements={materialMovements} staff={staff} refetch={refetch} />}
            {view === 'materiais' && (
              <Admin materials={materials} materialMovements={materialMovements} staff={staff} refetch={refetch} />
            )}
          </ViewTransition>
        </main>
      </div>
    </div>
  );
}

function OperatorApp({ role }: { role: string }) {
  const { materials, materialMovements, staff, loading, refetch } = useEstoqueData();

  if (loading) return <LoadingScreen />;

  const isObra = OBRA_ROLES.includes(role) && !ADMIN_ROLES.includes(role);

  return (
    <div>
      <TopBar title={isObra ? 'Almoxarifado de Obra' : 'Almoxarifado Central'} />
      <main className="p-6">
        {isObra ? (
          <Obra materials={materials} materialMovements={materialMovements} staff={staff} refetch={refetch} />
        ) : (
          <Central materials={materials} materialMovements={materialMovements} staff={staff} refetch={refetch} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  const user = useAuth((s) => s.user);

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      {!user ? <Login /> : ADMIN_ROLES.includes(user.role) ? <AdminApp /> : <OperatorApp role={user.role} />}
    </>
  );
}
