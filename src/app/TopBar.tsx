import { LogOut } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { Logo } from '@/shared/ui/Logo';

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  ADMINISTRATIVO: 'Administrativo',
  ALMOXARIFE_GERAL: 'Almoxarife Central',
  ALMOXARIFADO: 'Almoxarife Central',
  ALMOXARIFE_OBRA: 'Almoxarife de Obra',
};

export function TopBar({ title }: { title: string }) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2.5">
        <Logo size={28} />
        <span className="font-display text-sm font-bold text-slate-800">{title}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-slate-800">{user?.nome}</p>
          <p className="font-mono text-[10px] text-slate-400">{ROLE_LABELS[user?.role || ''] || user?.role}</p>
        </div>
        <button
          onClick={logout}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          title="Sair"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
