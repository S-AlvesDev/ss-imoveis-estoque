import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Sun } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/store/theme';
import { Logo } from '@/shared/ui/Logo';
import type { Material } from '@/shared/types';
import type { AppView } from './Sidebar';
import { CommandPalette, type DestinoDeNavegacao } from './CommandPalette';

export const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  ADMINISTRATIVO: 'Administrativo',
  ALMOXARIFE_GERAL: 'Almoxarife Central',
  ALMOXARIFADO: 'Almoxarife Central',
  ALMOXARIFE_OBRA: 'Almoxarife de Obra',
};

function initials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

const ehMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

interface TopBarProps {
  onMenuClick?: () => void;
  materials: Material[];
  destinos: DestinoDeNavegacao[];
  telaDeMaterial: AppView | null;
  onNavigate: (view: AppView) => void;
  /** Materiais que precisam de compra — o número no sino. */
  alertas: number;
  /** Se a pessoa pode abrir a tela de Alertas (o sino leva lá). */
  podeVerAlertas: boolean;
}

/**
 * A barra do topo: busca (⌘K), sino e a pessoa. O título da tela não mora
 * mais aqui — cada tela abre com o próprio cabeçalho, e a unidade em uso
 * está no seletor da barra lateral.
 */
export function TopBar({ onMenuClick, materials, destinos, telaDeMaterial, onNavigate, alertas, podeVerAlertas }: TopBarProps) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [paleta, setPaleta] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Ctrl/⌘+K abre a busca de qualquer lugar do sistema.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaleta((v) => !v);
      }
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const fechar = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/80 px-4 backdrop-blur-md sm:px-6">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="-ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-2)] lg:hidden"
            title="Menu"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
        )}
        <span className="lg:hidden">
          <Logo size={28} />
        </span>

        <button
          type="button"
          onClick={() => setPaleta(true)}
          className="group flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-left text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--brand)]/50 sm:max-w-md"
          aria-label="Buscar (Ctrl+K)"
        >
          <Search size={16} className="shrink-0" />
          <span className="truncate">Buscar materiais, telas…</span>
          <kbd className="ml-auto hidden shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[10px] sm:block">{ehMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {podeVerAlertas && (
            <button
              type="button"
              onClick={() => onNavigate('alertas')}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--text)]"
              title={alertas > 0 ? `${alertas} material(is) abaixo do mínimo` : 'Sem alertas'}
              aria-label={alertas > 0 ? `${alertas} alertas de estoque` : 'Alertas de estoque'}
            >
              <Bell size={18} />
              {alertas > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--vermelho)] px-1 text-[10px] font-bold text-white ring-2 ring-[var(--bg)]">
                  {alertas > 99 ? '99+' : alertas}
                </span>
              )}
            </button>
          )}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menu}
              className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-[var(--bg-2)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold uppercase text-white shadow-md shadow-[var(--brand)]/30">
                {initials(user?.nome)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block max-w-[10rem] truncate text-sm font-semibold text-[var(--text)]">{user?.nome}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">{ROLE_LABELS[user?.role || ''] || user?.role}</span>
              </span>
              <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${menu ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {menu && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl"
                >
                  <div className="px-3 py-2 sm:hidden">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">{user?.nome}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{ROLE_LABELS[user?.role || ''] || user?.role}</p>
                  </div>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      toggle();
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-2)]"
                  >
                    {theme === 'dark' ? <Sun size={16} className="text-[var(--brand)]" /> : <Moon size={16} className="text-[var(--brand)]" />}
                    {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--vermelho)]/10 hover:text-[var(--vermelho)]"
                  >
                    <LogOut size={16} />
                    Sair
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <CommandPalette
        open={paleta}
        onClose={() => setPaleta(false)}
        materials={materials}
        destinos={destinos}
        telaDeMaterial={telaDeMaterial}
        onNavigate={onNavigate}
      />
    </>
  );
}
