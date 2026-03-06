import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Returns display name and avatar for a user, taking into account
 * local profile overrides (visible only to the current user).
 */
export function useDisplayProfile(
    userId: string,
    serverName?: string,
    serverAvatar?: string
) {
    const override = useSettingsStore((s) => s.localProfileOverrides[userId]);
    return {
        displayName: override?.nickname || serverName || '',
        displayAvatar: override?.avatar || serverAvatar,
        hasOverride: !!override,
    };
}
