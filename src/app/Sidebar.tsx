import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, BookOpen, Building2, Check, ChevronRight, ChevronsUpDown, HardHat, LayoutDashboard, LifeBuoy, LogOut, Package, Plus, Settings, Users, Warehouse,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useMarca } from '@/store/marca';
import { PRODUTO } from '@/shared/produto';
import { Logo, LogoProduto } from '@/shared/ui/Logo';
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
      { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, roles: ADMIN_ROLES },
      { view: 'alertas', label: 'Alertas', icon: <AlertTriangle size={18} />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Estoque',
    items: [
      { view: 'materiais', label: 'Materiais', icon: <Package size={18} />, roles: ADMIN_ROLES },
      { view: 'central', label: 'Almoxarifado Central', icon: <Warehouse size={18} /> },
      { view: 'obra', label: 'Almoxarifado Obra', icon: <HardHat size={18} /> },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { view: 'suporte', label: 'Suporte', icon: <LifeBuoy size={18} /> },
      { view: 'ajuda', label: 'Ajuda', icon: <BookOpen size={18} /> },
      { view: 'usuarios', label: 'Usuários', icon: <Users size={18} />, roles: ADMIN_ROLES },
      { view: 'configuracoes', label: 'Configurações', icon: <Settings size={18} />, roles: ADMIN_ROLES },
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
        className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--sidebar-border)] bg-white/[0.04] px-3 py-2 text-left transition-colors hover:border-[var(--brand)]/50 hover:bg-white/[0.06]"
      >
        <Building2 size={15} className="shrink-0 text-[var(--brand)]" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">Unidade</span>
          <span className="block truncate text-sm font-semibold text-white">{unidade.nome}</span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-[var(--sidebar-muted)]" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-x-3 z-10 mt-1 overflow-hidden rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-bg-2)] py-1 shadow-2xl"
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
                      atual ? 'font-semibold text-white' : 'text-[var(--sidebar-text)]'
                    }`}
                  >
                    <span className="w-4 shrink-0">{atual && <Check size={14} className="text-[var(--brand)]" />}</span>
                    <span className="truncate">{u.nome}</span>
                  </button>
                </li>
              );
            })}
            {onCreate && (
              <li className="mt-1 border-t border-[var(--sidebar-border)] pt-1">
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
  /** Materiais que precisam de compra — o número vermelho ao lado de Alertas. */
  alertas: number;
  /** Quantos materiais existem na unidade, para o cartão de saúde do estoque. */
  totalMateriais: number;
}

/**
 * O cartão do rodapé. Hoje mostra a saúde do estoque da unidade: a fatia
 * dos materiais que está acima do mínimo. Quando existirem planos, este
 * mesmo lugar vira "uso do plano" (materiais, unidades, usuários).
 */
function CartaoSaude({ alertas, total, onClick }: { alertas: number; total: number; onClick?: () => void }) {
  if (total === 0) return null;
  const pct = Math.max(0, Math.round(((total - alertas) / total) * 100));
  const cor = pct >= 80 ? 'var(--verde)' : pct >= 50 ? 'var(--brand)' : 'var(--vermelho)';
  const conteudo = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand)]">
          <Package size={15} />
        </span>
        <span className="text-sm font-bold text-white">Saúde do estoque</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--sidebar-muted)]">
        <span>
          <span className="font-semibold text-white">{pct}%</span> acima do mínimo
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

export function Sidebar({ active, onChange, mobileOpen, onMobileClose, unidades, unidade, onChangeUnidade, onNovaUnidade, acesso, alertas, totalMateriais }: SidebarProps) {
  const { user, logout } = useAuth();
  const organizacao = useMarca((s) => s.organizacao);
  const groups = navGroupsFor(user?.role || '', acesso);
  const podeVerAlertas = groups.some((g) => g.items.some((i) => i.view === 'alertas'));

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
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] transition-transform duration-300 lg:sticky lg:top-0 lg:translate-x-0 lg:self-start ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="grain pointer-events-none absolute inset-0 opacity-[0.25]" />
        {/* o brilho laranja que sobe do canto, como no mockup */}
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-[var(--brand)]/25 blur-3xl" />

        {/* A marca: a da organização, se ela subiu um logo; senão, a do produto com o slogan. */}
        <div className="relative flex h-[4.5rem] shrink-0 items-center px-5">
          {organizacao?.logo_url ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <Logo size={36} className="rounded-xl" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-bold text-white">{organizacao.nome}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--sidebar-muted)]">{PRODUTO.nome}</p>
              </div>
            </div>
          ) : (
            <LogoProduto height={40} fundo="escuro" slogan />
          )}
        </div>

        <div className="relative">
          <UnitSwitcher unidades={unidades} unidade={unidade} onChange={onChangeUnidade} onCreate={onNovaUnidade} />
        </div>

        {/* Rola por dentro se um dia a navegação passar da altura da tela. */}
        <nav className="relative mt-3 flex-1 space-y-6 overflow-y-auto px-3 pb-2">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--sidebar-muted)]">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = active === item.view;
                  return (
                    <button
                      key={item.view}
                      onClick={() => handleSelect(item.view)}
                      className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${
                        isActive ? 'text-white' : 'text-[var(--sidebar-text)] hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active-pill"
                          className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand)]/40 shadow-[0_8px_24px_-8px_var(--brand)]"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className={`relative ${isActive ? 'text-white' : 'text-[var(--sidebar-muted)]'}`}>{item.icon}</span>
                      <span className="relative flex-1 text-left">{item.label}</span>
                      {item.view === 'alertas' && alertas > 0 && (
                        <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--vermelho)] px-1.5 text-[11px] font-bold text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]">
                          {alertas > 99 ? '99+' : alertas}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative shrink-0 space-y-3 p-4">
          <CartaoSaude alertas={alertas} total={totalMateriais} onClick={podeVerAlertas ? () => handleSelect('alertas') : undefined} />
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-[var(--sidebar-text)] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut size={18} className="text-[var(--sidebar-muted)]" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
