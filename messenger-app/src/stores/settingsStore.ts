import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    ChatAppearanceSettings,
    CacheSettings,
    UserProfile,
    NotificationSettings,
    PrivacySettings,
} from '@/types';
import { THEME_PRESETS, applyThemePreset } from '@/lib/themes';

interface SettingsStore {
    // State
    appearance: ChatAppearanceSettings;
    cache: CacheSettings;
    profile: UserProfile;
    notifications: NotificationSettings;
    privacy: PrivacySettings;
    language: string;

    // Actions
    updateAppearance: (settings: Partial<ChatAppearanceSettings>) => void;
    updateCache: (settings: Partial<CacheSettings>) => void;
    updateProfile: (profile: Partial<UserProfile>) => void;
    updateNotifications: (settings: Partial<NotificationSettings>) => void;
    updatePrivacy: (settings: Partial<PrivacySettings>) => void;
    setLanguage: (language: string) => void;
    setTheme: (theme: 'light' | 'dark' | 'auto') => void;
    setThemePreset: (presetId: string) => void;
    resetSettings: () => void;
}

const defaultAppearance: ChatAppearanceSettings = {
    chatBackground: {
        type: 'color',
        value: '#f5f6f8',
        opacity: 1,
        blur: 0,
    },
    messageBubbles: {
        borderRadius: 12,
        fontSize: 14,
        outgoingColor: '#EFFDDE',
        incomingColor: '#FFFFFF',
        outgoingTextColor: '#2d3748',
        incomingTextColor: '#2d3748',
    },
    theme: 'light',
    themePreset: 'classic',
    compactMode: false,
    showAvatars: true,
    showTimeStamps: true,
    showTails: true,
};

const defaultCache: CacheSettings = {
    maxSize: 1024, // 1GB
    autoClean: true,
    cacheVideos: true,
    cacheImages: true,
    expirationDays: 30,
    clearCacheOnExit: false,
};

const defaultProfile: UserProfile = {
    id: '',
    username: '',
    firstName: '',
    lastName: '',
    bio: '',
    avatar: '',
    phone: '',
    createdAt: new Date(),
    isOnline: true,
};

const defaultNotifications: NotificationSettings = {
    enabled: true,
    sound: true,
    preview: true,
    vibrate: true,
};

const defaultPrivacy: PrivacySettings = {
    lastSeen: 'everyone',
    profilePhoto: 'everyone',
    phoneNumber: 'contacts',
};

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            // Initial state
            appearance: defaultAppearance,
            cache: defaultCache,
            profile: defaultProfile,
            notifications: defaultNotifications,
            privacy: defaultPrivacy,
            language: 'ru',

            // Actions
            updateAppearance: (settings) =>
                set((state) => ({
                    appearance: { ...state.appearance, ...settings },
                })),

            updateCache: (settings) =>
                set((state) => ({
                    cache: { ...state.cache, ...settings },
                })),

            updateProfile: (profile) =>
                set((state) => ({
                    profile: { ...state.profile, ...profile },
                })),

            updateNotifications: (settings) =>
                set((state) => ({
                    notifications: { ...state.notifications, ...settings },
                })),

            updatePrivacy: (settings) =>
                set((state) => ({
                    privacy: { ...state.privacy, ...settings },
                })),

            setLanguage: (language) => set({ language }),

            setTheme: (theme) =>
                set((state) => {
                    // Apply theme to document
                    const root = document.documentElement;
                    if (theme === 'dark') {
                        root.classList.add('dark');
                    } else if (theme === 'light') {
                        root.classList.remove('dark');
                    } else {
                        // Auto: follow system preference
                        const prefersDark = window.matchMedia(
                            '(prefers-color-scheme: dark)'
                        ).matches;
                        if (prefersDark) {
                            root.classList.add('dark');
                        } else {
                            root.classList.remove('dark');
                        }
                    }

                    return {
                        appearance: { ...state.appearance, theme },
                    };
                }),

            setThemePreset: (presetId) =>
                set((state) => {
                    const preset = THEME_PRESETS.find((p) => p.id === presetId);
                    if (!preset) return state;

                    applyThemePreset(presetId);

                    return {
                        appearance: {
                            ...state.appearance,
                            themePreset: presetId,
                            theme: preset.isDark ? 'dark' : 'light',
                            messageBubbles: {
                                ...state.appearance.messageBubbles,
                                ...preset.messageBubbles,
                            },
                            chatBackground: {
                                type: 'color',
                                value: preset.colors['--tg-bg'],
                                opacity: 1,
                                blur: 0,
                            },
                        },
                    };
                }),

            resetSettings: () =>
                set({
                    appearance: defaultAppearance,
                    cache: defaultCache,
                    notifications: defaultNotifications,
                    privacy: defaultPrivacy,
                    language: 'ru',
                }),
        }),
        {
            name: 'messenger-settings',
            partialize: (state) => ({
                appearance: state.appearance,
                cache: state.cache,
                profile: state.profile,
                notifications: state.notifications,
                privacy: state.privacy,
                language: state.language,
            }),
        }
    )
);
