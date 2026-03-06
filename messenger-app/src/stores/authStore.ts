
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';
import { tokenStorage } from '@/lib/tokenStorage';

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (user: User, token: string) => void;
    setTokens: (token: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            login: (user, token) => set({ user, token, isAuthenticated: true }),
            setTokens: (token) => set({ token }),
            logout: () => {
                tokenStorage.clear();
                // Dynamic import to break circular dependency authStore ↔ chatStore
                import('./chatStore').then(({ useChatStore }) => {
                    useChatStore.getState().reset();
                });
                set({ user: null, token: null, isAuthenticated: false });
            },
        }),
        {
            name: 'auth-storage',
            version: 3,
            storage: typeof window !== 'undefined' ? createJSONStorage(() => localStorage) : undefined,
            migrate: (persistedState: any, version: number) => {
                if (version < 3) {
                    // Сбрасываем старое состояние — убираем refreshToken из localStorage
                    return {
                        user: null,
                        token: null,
                        isAuthenticated: false,
                    };
                }
                return persistedState;
            },
        }
    )
);
