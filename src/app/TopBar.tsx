import { LogOut, Menu, Moon, Search, Sun } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/store/theme';
import { Logo } from '@/shared/ui/Logo';

const ROLE_LABELS: Record<string, string> = {
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

interface TopBarProps {
  title: string;
  onMenuClick?: () => void;
}

export function TopBar({ title, onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)]/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-2)] lg:hidden"
            title="Menu"
          >
            <Menu size={20} />
          </button>
        )}
        <Logo size={28} />
        <span className="hidden font-display text-sm font-bold text-[var(--text)] sm:inline">{title}</span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
        <label className="relative hidden max-w-xs flex-1 items-center md:flex">
          <Search size={15} className="pointer-events-none absolute left-3 text-[var(--text-muted)]" />
          <input
            type="search"
            placeholder="Buscar..."
            className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-2)] py-2 pl-9 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
          />
        </label>

        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--brand)]"
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-[var(--text)]">{user?.nome}</p>
          <p className="font-mono text-[10px] text-[var(--text-muted)]">{ROLE_LABELS[user?.role || ''] || user?.role}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/15 text-xs font-bold uppercase text-[var(--brand)]">
          {initials(user?.nome)}
        </span>
        <button
          onClick={logout}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-rose-500/10 hover:text-rose-500"
          title="Sair"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
