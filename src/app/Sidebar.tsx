import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, BookOpen, Building2, Check, ChevronsUpDown, HardHat, LayoutDashboard, LifeBuoy, LogOut, Package, Plus, Settings, Users, Warehouse,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { Stripes } from '@/shared/ui/Stripes';
import { Logo } from '@/shared/ui/Logo';
import { ADMIN_ROLES } from '@/shared/constants';
import type { NivelAcesso, Unidade } from '@/shared/types';

export type AppView = 'dashboard' | 'central' | 'obra' | 'materiais' | 'alertas' | 'suporte' | 'ajuda' | 'usuarios' | 'configuracoes';

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
      { view: 'configuracoes', label: 'Configurações', icon: <Settings size={17} />, roles: ADMIN_ROLES },
    ],
  },
];

/** O que a pessoa pode no Central e na Obra da unidade em uso. */
export interface AcessoNaUnidade {
  central: NivelAcesso | null;
  obra: NivelAcesso | null;
}

/**
 * Grupos visíveis, já sem os vazios. As telas de Central e Obra aparecem
 * para quem tem o depósito (qualquer nível) na unidade em uso — não é mais
 * o cargo que decide. Administrador vê tudo.
 */
export function navGroupsFor(role: string, acesso: AcessoNaUnidade): NavGroup[] {
  const isAdmin = ADMIN_ROLES.includes(role);

  return NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => {
      if (item.roles) return isAdmin;
      if (item.view === 'central') return isAdmin || acesso.central !== null;
      if (item.view === 'obra') return isAdmin || acesso.obra !== null;
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}

/** Lista achatada — usada para decidir a tela inicial de cada perfil. */
export function navItemsFor(role: string, acesso: AcessoNaUnidade): NavItem[] {
  return navGroupsFor(role, acesso).flatMap((g) => g.items);
}

interface UnitSwitcherProps {
  unidades: Unidade[];
  unidade: Unidade | null;
  onChange: (id: string) => void;
  /** Só admin cria unidade; para os demais o botão não aparece. */
  onCreate?: () => void;
}

/**
 * A unidade que as telas estão mostrando. Trocar aqui troca o que "Central" e
 * "Obra" significam em todo o sistema — e para onde cada operação vai.
 */
function UnitSwitcher({ unidades, unidade, onChange, onCreate }: UnitSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!unidade) return null;

  return (
    <div ref={ref} className="relative px-3 pb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-left transition-colors hover:border-[var(--brand)]/40"
      >
        <Building2 size={15} className="shrink-0 text-[var(--brand)]" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Unidade</span>
          <span className="block truncate text-sm font-semibold text-[var(--text)]">{unidade.nome}</span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-[var(--text-muted)]" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-x-3 z-10 mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl"
          >
            {unidades.map((u) => {
              const atual = u.id === unidade.id;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={atual}
                    onClick={() => { onChange(u.id); setOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--brand)]/10 ${
                      atual ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    <span className="w-4 shrink-0">{atual && <Check size={14} className="text-[var(--brand)]" />}</span>
                    <span className="truncate">{u.nome}</span>
                  </button>
                </li>
              );
            })}
            {onCreate && (
              <li className="mt-1 border-t border-[var(--border)] pt-1">
                <button
                  type="button"
                  onClick={() => { onCreate(); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10"
                >
                  <Plus size={14} className="w-4 shrink-0" />
                  Nova unidade
                </button>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SidebarProps {
  active: AppView;
  onChange: (v: AppView) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  unidades: Unidade[];
  unidade: Unidade | null;
  onChangeUnidade: (id: string) => void;
  onNovaUnidade?: () => void;
  acesso: AcessoNaUnidade;
}

export function Sidebar({ active, onChange, mobileOpen, onMobileClose, unidades, unidade, onChangeUnidade, onNovaUnidade, acesso }: SidebarProps) {
  const { user, logout } = useAuth();
  const groups = navGroupsFor(user?.role || '', acesso);

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

        <div className="relative">
          <UnitSwitcher unidades={unidades} unidade={unidade} onChange={onChangeUnidade} onCreate={onNovaUnidade} />
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
