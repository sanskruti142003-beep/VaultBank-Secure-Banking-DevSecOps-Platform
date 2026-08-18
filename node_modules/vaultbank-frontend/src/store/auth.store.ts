import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AUTH_STORAGE_KEY } from "@/constants/auth.constants";
import type { User } from "@/types/auth.types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  selectedAccountId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  setUser: (user: User | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setSelectedAccountId: (id: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      selectedAccountId: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      setAuth: (user, accessToken, refreshToken) => {
        set({
          user,
          accessToken,
          refreshToken,
          selectedAccountId: get().selectedAccountId,
          isAuthenticated: true,
          isLoading: false,
        });
      },
      clearAuth: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          selectedAccountId: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },
      setUser: (user) => {
        set({
          user,
          isAuthenticated: Boolean(
            user && (get().accessToken || get().refreshToken),
          ),
        });
      },
      setTokens: (accessToken, refreshToken) => {
        set((state) => ({
          accessToken,
          refreshToken,
          isAuthenticated: Boolean(state.user && (accessToken || refreshToken)),
        }));
      },
      setSelectedAccountId: (id) => {
        set({ selectedAccountId: id });
      },
      setLoading: (isLoading) => {
        set({ isLoading });
      },
      setHasHydrated: (hasHydrated) => {
        set({ hasHydrated });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        selectedAccountId: state.selectedAccountId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        state.setHasHydrated(true);
        if (state.user && (state.accessToken || state.refreshToken)) {
          state.setUser(state.user);
        }
      },
    },
  ),
);
