import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

function stripAuthTokens(user: User | null): User | null {
  if (!user) return null;
  return {
    ...user,
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
        }),
      setLoading: (loading) => set({ isLoading: loading }),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        }),
    }),
    {
      name: 'auth-storage',
      version: 2,
      partialize: (state) => ({
        user: stripAuthTokens(state.user),
        isAuthenticated: state.isAuthenticated,
        isLoading: true,
      }),
      migrate: (persistedState) => {
        const state = persistedState as Partial<AuthState>;
        const user = stripAuthTokens(state.user ?? null);
        return {
          user,
          isAuthenticated: !!user,
          isLoading: true,
        };
      },
    }
  )
);
