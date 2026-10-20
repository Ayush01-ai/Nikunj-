import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // True once the one-time client bootstrap (see AuthBootstrap) has asked
  // `/api/auth/me` whether a session exists (legacy cookie or Clerk) and gotten an
  // answer. Pages that gate on `isAuthenticated` should wait for this to avoid
  // bouncing a genuinely-signed-in Clerk user before the hydration check completes.
  authChecked: boolean;

  setUser: (user: User) => void;
  logout: () => void;
  setLoading: (v: boolean) => void;
  setAuthChecked: (v: boolean) => void;
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
      authChecked: false,

      setUser: (user) =>
        set({ user, isAuthenticated: true, isLoading: false, authChecked: true }),

      logout: () =>
        set({ user: null, isAuthenticated: false, authChecked: true }),

      setLoading: (v) => set({ isLoading: v }),
      setAuthChecked: (v) => set({ authChecked: v }),
    }),
    {
      name: 'nikunj-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
