import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, BookOpen, HardHat, LayoutDashboard, LifeBuoy, LogOut, Package, Users, Warehouse } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { Stripes } from '@/shared/ui/Stripes';
import { Logo } from '@/shared/ui/Logo';
import { ADMIN_ROLES, OBRA_ROLES } from '@/shared/constants';

export type AppView = 'dashboard' | 'central' | 'obra' | 'materiais' | 'alertas' | 'suporte' | 'ajuda' | 'usuarios';

/** Compatibilidade com o nome antigo, ainda usado em algumas assinaturas. */
export type AdminView = AppView;

interface NavItem {
  view: AppView;
  label: string;
  icon: React.ReactNode;
  /** Quando ausente, o item aparece para todos os perfis com acesso ao estoque. */
  roles?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} />, roles: ADMIN_ROLES },
      { view: 'alertas', label: 'Alertas', icon: <AlertTriangle size={17} />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Estoque',
    items: [
      { view: 'materiais', label: 'Materiais', icon: <Package size={17} />, roles: ADMIN_ROLES },
      { view: 'central', label: 'Almoxarifado Central', icon: <Warehouse size={17} /> },
      { view: 'obra', label: 'Almoxarifado Obra', icon: <HardHat size={17} /> },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { view: 'suporte', label: 'Suporte', icon: <LifeBuoy size={17} /> },
      { view: 'ajuda', label: 'Ajuda', icon: <BookOpen size={17} /> },
      { view: 'usuarios', label: 'Usuários', icon: <Users size={17} />, roles: ADMIN_ROLES },
    ],
  },
];

/** Grupos visíveis para o perfil, já sem os vazios. Operadores só veem o próprio almoxarifado. */
export function navGroupsForRole(role: string): NavGroup[] {
  const isAdmin = ADMIN_ROLES.includes(role);
  const isObra = OBRA_ROLES.includes(role);

  return NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => {
      if (item.roles) return isAdmin;
      if (item.view === 'central') return isAdmin || !isObra;
      if (item.view === 'obra') return isAdmin || isObra;
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}

/** Lista achatada — usada para decidir a tela inicial de cada perfil. */
export function navItemsForRole(role: string): NavItem[] {
  return navGroupsForRole(role).flatMap((g) => g.items);
}

interface SidebarProps {
  active: AppView;
  onChange: (v: AppView) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ active, onChange, mobileOpen, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const groups = navGroupsForRole(user?.role || '');

  function handleSelect(view: AppView) {
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
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/*
        No desktop a sidebar precisa ser `sticky`, não `static`: como item de um
        flex ela media 100vh enquanto a página é mais alta, então rolava para
        fora e deixava um vazio à esquerda. `self-start` é obrigatório — sem ele
        o `align-items: stretch` do flex estica a aside até a altura do conteúdo
        e o sticky não tem folga para grudar.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-transform duration-300 lg:sticky lg:top-0 lg:translate-x-0 lg:self-start ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="grain pointer-events-none absolute inset-0 hidden opacity-[0.3] dark:block" />
        <Stripes className="absolute inset-x-0 top-0 h-1" color="rgba(255,142,41,0.9)" dense />

        <div className="relative flex h-16 shrink-0 items-center gap-2.5 px-6">
          <Logo size={30} className="rounded-full bg-white p-0.5 shadow-sm ring-1 ring-black/5" />
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-[var(--text)]">SS Imóveis</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Estoque</p>
          </div>
        </div>

        {/* Rola por dentro se um dia a navegação passar da altura da tela. */}
        <nav className="relative mt-2 flex-1 space-y-5 overflow-y-auto px-3 pb-2">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = active === item.view;
                  return (
                    <button
                      key={item.view}
                      onClick={() => handleSelect(item.view)}
                      className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'text-white'
                          : 'text-[var(--text-muted)] hover:bg-[var(--brand)]/10 hover:text-[var(--brand)]'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active-pill"
                          className="absolute inset-0 rounded-xl bg-[var(--brand)] shadow-lg shadow-[var(--brand)]/30"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className="relative">{item.icon}</span>
                      <span className="relative">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative shrink-0 border-t border-[var(--border)] p-4">
          <div className="mb-3 px-1">
            <p className="truncate text-sm font-semibold text-[var(--text)]">{user?.nome}</p>
            <p className="font-mono text-[10px] tracking-wide text-[var(--text-muted)]">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
