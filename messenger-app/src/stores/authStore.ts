
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
    user: User | null;
    token: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
    login: (user: User, token: string, refreshToken?: string) => void;
    setTokens: (token: string, refreshToken?: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            login: (user, token, refreshToken) => set({ user, token, refreshToken: refreshToken || null, isAuthenticated: true }),
            setTokens: (token, refreshToken) => set((state) => ({
                token,
                refreshToken: refreshToken || state.refreshToken,
            })),
            logout: () => set({ user: null, token: null, refreshToken: null, isAuthenticated: false }),
        }),
        {
            name: 'auth-storage',
            version: 2,
            storage: typeof window !== 'undefined' ? createJSONStorage(() => localStorage) : undefined,
            migrate: (persistedState: any, version: number) => {
                if (version < 2) {
                    return {
                        user: null,
                        token: null,
                        refreshToken: null,
                        isAuthenticated: false,
                    };
                }
                return persistedState;
            },
        }
    )
);
