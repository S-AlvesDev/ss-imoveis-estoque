import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/shared/types';
import { useMarca } from '@/store/marca';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setSession: (user: AuthUser, token: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setSession: (user, token) => set({ user, token }),
      logout: () => {
        // A tela de login é do produto, não da organização que acabou de sair.
        useMarca.getState().setOrganizacao(null);
        set({ user: null, token: null });
      },
    }),
    { name: 'estoque-auth' }
  )
);
