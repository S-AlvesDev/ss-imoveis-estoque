import { AnimatePresence, motion } from 'motion/react';
import { LayoutDashboard, LogOut, Package, Warehouse, HardHat } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { Stripes } from '@/shared/ui/Stripes';
import { Logo } from '@/shared/ui/Logo';

export type AdminView = 'dashboard' | 'central' | 'obra' | 'materiais';

const NAV: { view: AdminView; label: string; icon: React.ReactNode }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { view: 'materiais', label: 'Materiais', icon: <Package size={17} /> },
  { view: 'central', label: 'Almoxarifado Central', icon: <Warehouse size={17} /> },
  { view: 'obra', label: 'Almoxarifado Obra', icon: <HardHat size={17} /> },
];

interface SidebarProps {
  active: AdminView;
  onChange: (v: AdminView) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ active, onChange, mobileOpen, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth();

  function handleSelect(view: AdminView) {
    onChange(view);
    onMobileClose();
  }

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onMobileClose}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-hidden bg-slate-950 text-slate-300 transition-transform duration-300 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="grain pointer-events-none absolute inset-0 opacity-[0.4]" />
        <Stripes className="absolute inset-x-0 top-0 h-1" color="rgba(245,158,11,0.9)" dense />

        <div className="relative flex h-16 items-center gap-2.5 px-6">
          <Logo size={30} className="rounded-full bg-white/95 p-0.5 shadow-md" />
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-white">SS Imóveis</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">Estoque</p>
          </div>
        </div>

        <nav className="relative mt-4 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const isActive = active === item.view;
            return (
              <button
                key={item.view}
                onClick={() => handleSelect(item.view)}
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive ? 'text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-lg bg-blue-600 shadow-lg shadow-blue-600/30"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">{item.icon}</span>
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="relative border-t border-white/10 p-4">
          <div className="mb-3 px-1">
            <p className="truncate text-sm font-semibold text-white">{user?.nome}</p>
            <p className="font-mono text-[10px] tracking-wide text-slate-500">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
