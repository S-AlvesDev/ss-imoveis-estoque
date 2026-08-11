import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/shared/types';

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
      logout: () => set({ user: null, token: null }),
    }),
    { name: 'estoque-auth' }
  )
);
