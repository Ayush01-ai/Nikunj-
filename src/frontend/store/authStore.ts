import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User) => void;
  logout: () => void;
  setLoading: (v: boolean) => void;
}

// Session identity is carried by the HttpOnly `ns_token` cookie (set/cleared server-side in
// /api/auth/verify-otp and /api/auth/logout) and sent automatically on same-origin requests.
// We intentionally do NOT persist the JWT itself here — keeping it out of localStorage/JS-
// reachable state limits what an XSS payload could steal.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) =>
        set({ user, isAuthenticated: true, isLoading: false }),

      logout: () =>
        set({ user: null, isAuthenticated: false }),

      setLoading: (v) => set({ isLoading: v }),
    }),
    {
      name: 'nikunj-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
