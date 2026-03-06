import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VoiceChannel, VoiceChannelCategory, VoiceChannelParticipant, AudioDevice, VoiceSettings, ConnectionQualityLevel, ConnectionStats, SoundboardSound } from '@/types';
import { api } from '@/lib/api/client';
import { socketService } from '@/lib/socket';
import { voiceChannelPeerManager } from '@/lib/webrtc/VoiceChannelPeerManager';
import { useAuthStore } from './authStore';

interface VoiceChannelStore {
    // Voice channels state
    chatId: string | null;
    categories: VoiceChannelCategory[];
    currentChannel: VoiceChannel | null;
    isConnected: boolean;
    isMuted: boolean;
    isDeafened: boolean;
    participants: VoiceChannelParticipant[];

    // Audio devices
    audioDevices: AudioDevice[];
    voiceSettings: VoiceSettings;

    // Animation state
    leavingParticipants: VoiceChannelParticipant[];

    // UI state
    isVoicePanelOpen: boolean;
    showSettings: boolean;
    viewingChannel: { id: string; name: string; chatId: string } | null;

    // Stream watching state (screen shares from other users)
    watchingStreams: { userId: string; username: string }[];

    // PTT state
    isPTTActive: boolean;
    setPTTActive: (active: boolean) => void;

    // Connection quality
    connectionQuality: ConnectionQualityLevel;
    connectionStats: ConnectionStats | null;
    setConnectionQuality: (quality: ConnectionQualityLevel) => void;
    setConnectionStats: (stats: ConnectionStats | null) => void;

    // Soundboard
    soundboardSounds: SoundboardSound[];
    soundboardFavorites: string[];
    setSoundboardSounds: (sounds: SoundboardSound[]) => void;
    addSoundboardSound: (sound: SoundboardSound) => void;
    removeSoundboardSound: (soundId: string) => void;
    toggleSoundboardFavorite: (soundId: string) => void;

    // Screen share state
    screenSharers: Record<string, { viewerCount: number }>;
    setScreenSharers: (sharers: Record<string, { viewerCount: number }>) => void;
    updateScreenSharer: (userId: string, data: { viewerCount: number } | null) => void;

    // Priority speaker
    prioritySpeakerId: string | null;
    setPrioritySpeaker: (userId: string | null) => void;

    // Actions
    setCategories: (categories: VoiceChannelCategory[]) => void;
    setCurrentChannel: (channel: VoiceChannel | null) => void;
    setConnected: (connected: boolean) => void;
    setMuted: (muted: boolean) => void;
    setDeafened: (deafened: boolean) => void;
    setParticipants: (participants: VoiceChannelParticipant[]) => void;
    addParticipant: (participant: VoiceChannelParticipant) => void;
    removeParticipant: (userId: string) => void;
    updateParticipant: (userId: string, updates: Partial<VoiceChannelParticipant>) => void;

    // Audio device actions
    setAudioDevices: (devices: AudioDevice[]) => void;
    setVoiceSettings: (settings: Partial<VoiceSettings>) => void;
    setInputDevice: (deviceId: string) => void;
    setOutputDevice: (deviceId: string) => void;

    // UI actions
    setVoicePanelOpen: (open: boolean) => void;
    setShowSettings: (show: boolean) => void;
    setViewingChannel: (channel: { id: string; name: string; chatId: string } | null) => void;

    // Per-user volume (0-200, 100 = normal)
    userVolumes: Record<string, number>;
    setUserVolume: (userId: string, volume: number) => void;

    // Stream watching actions
    addWatching: (userId: string, username: string) => void;
    removeWatching: (userId: string) => void;
    clearWatching: () => void;

    // Voice channel actions
    loadChannels: (chatId: string) => Promise<void>;
    joinChannel: (channelId: string) => Promise<void>;
    leaveChannel: () => void;
    createChannel: (chatId: string, name: string, category?: string) => Promise<VoiceChannel>;
    deleteChannel: (channelId: string) => Promise<void>;
    renameCategory: (chatId: string, oldName: string, newName: string) => Promise<void>;
    deleteCategory: (chatId: string, category: string) => Promise<void>;
    reorderCategories: (chatId: string, categoryOrder: { category: string; position: number }[]) => Promise<void>;
    reorderChannels: (chatId: string, channels: { id: string; position: number; category: string }[]) => Promise<void>;
    reset: () => void;
}

// Group flat channel list into categories
function groupByCategory(channels: any[]): VoiceChannelCategory[] {
    const catMap = new Map<string, VoiceChannelCategory>();
    for (const ch of channels) {
        const catId = ch.category || 'general';
        if (!catMap.has(catId)) {
            catMap.set(catId, {
                id: catId,
                name: catId === 'general' ? 'Общие' : catId,
                position: catMap.size,
                channels: [],
            });
        }
        catMap.get(catId)!.channels.push({
            id: ch.id,
            name: ch.name,
            description: ch.description,
            position: ch.position,
            categoryId: catId,
            participants: ch.participants || [],
            maxParticipants: ch.maxParticipants,
            isLocked: ch.isLocked,
            createdAt: new Date(ch.createdAt),
            createdBy: ch.createdBy,
        });
    }
    return Array.from(catMap.values());
}

export const useVoiceChannelStore = create<VoiceChannelStore>()(persist((set, get) => ({
    // Initial state — empty until loadChannels is called
    chatId: null,
    categories: [],
    currentChannel: null,
    isConnected: false,
    isMuted: false,
    isDeafened: false,
    participants: [],
    audioDevices: [],
    voiceSettings: {
        inputVolume: 100,
        outputVolume: 100,
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
        inputMode: 'voiceActivity',
        pttKey: 'Space',
        pttReleaseDelay: 200,
        noiseGateEnabled: false,
        noiseGateThreshold: 15,
        screenShareQuality: 'auto',
        screenShareFps: 30,
        attenuationEnabled: false,
        attenuationAmount: 50,
    },
    leavingParticipants: [],
    isVoicePanelOpen: false,
    showSettings: false,
    viewingChannel: null,
    userVolumes: {},
    watchingStreams: [],

    // PTT
    isPTTActive: false,

    // Connection quality
    connectionQuality: 'excellent' as ConnectionQualityLevel,
    connectionStats: null,

    // Soundboard
    soundboardSounds: [],
    soundboardFavorites: [],

    // Screen sharers
    screenSharers: {},

    // Priority speaker
    prioritySpeakerId: null,

    // Setters
    setCategories: (categories) => set({ categories }),
    setCurrentChannel: (channel) => set({ currentChannel: channel }),
    setConnected: (connected) => set({ isConnected: connected }),
    setMuted: (muted) => set({ isMuted: muted }),
    setDeafened: (deafened) => set({ isDeafened: deafened }),
    setParticipants: (participants) => set({ participants }),
    addParticipant: (participant) => set((state) => ({
        participants: state.participants.some(p => p.userId === participant.userId)
            ? state.participants
            : [...state.participants, participant],
    })),
    removeParticipant: (userId) => {
        const leaving = get().participants.find(p => p.userId === userId);
        if (leaving) {
            set((state) => ({
                participants: state.participants.filter(p => p.userId !== userId),
                leavingParticipants: [...state.leavingParticipants, leaving],
            }));
            setTimeout(() => {
                set((state) => ({
                    leavingParticipants: state.leavingParticipants.filter(p => p.userId !== userId),
                }));
            }, 300);
        } else {
            set((state) => ({
                participants: state.participants.filter(p => p.userId !== userId),
            }));
        }
    },
    updateParticipant: (userId, updates) => set((state) => ({
        participants: state.participants.map(p =>
            p.userId === userId ? { ...p, ...updates } : p
        ),
    })),

    // Audio device actions
    setAudioDevices: (devices) => set({ audioDevices: devices }),
    setVoiceSettings: (settings) => set((state) => ({
        voiceSettings: { ...state.voiceSettings, ...settings },
    })),
    setInputDevice: (deviceId) => set((state) => ({
        voiceSettings: { ...state.voiceSettings, inputDeviceId: deviceId },
    })),
    setOutputDevice: (deviceId) => set((state) => ({
        voiceSettings: { ...state.voiceSettings, outputDeviceId: deviceId },
    })),

    // UI actions
    setVoicePanelOpen: (open) => set({ isVoicePanelOpen: open }),
    setShowSettings: (show) => set({ showSettings: show }),
    setViewingChannel: (channel) => set({ viewingChannel: channel }),

    // Per-user volume
    setUserVolume: (userId, volume) => set((state) => ({
        userVolumes: { ...state.userVolumes, [userId]: volume },
    })),

    // PTT
    setPTTActive: (active) => set({ isPTTActive: active }),

    // Connection quality
    setConnectionQuality: (quality) => set({ connectionQuality: quality }),
    setConnectionStats: (stats) => set({ connectionStats: stats }),

    // Soundboard
    setSoundboardSounds: (sounds) => set({ soundboardSounds: sounds }),
    addSoundboardSound: (sound) => set((state) => ({
        soundboardSounds: [...state.soundboardSounds, sound],
    })),
    removeSoundboardSound: (soundId) => set((state) => ({
        soundboardSounds: state.soundboardSounds.filter(s => s.id !== soundId),
    })),
    toggleSoundboardFavorite: (soundId) => set((state) => {
        const has = state.soundboardFavorites.includes(soundId);
        return {
            soundboardFavorites: has
                ? state.soundboardFavorites.filter(id => id !== soundId)
                : [...state.soundboardFavorites, soundId],
        };
    }),

    // Screen sharers
    setScreenSharers: (sharers) => set({ screenSharers: sharers }),
    updateScreenSharer: (userId, data) => set((state) => {
        if (!data) {
            const { [userId]: _, ...rest } = state.screenSharers;
            return { screenSharers: rest };
        }
        return { screenSharers: { ...state.screenSharers, [userId]: data } };
    }),

    // Priority speaker
    setPrioritySpeaker: (userId) => set({ prioritySpeakerId: userId }),

    // Stream watching
    addWatching: (userId, username) => set((state) => ({
        watchingStreams: state.watchingStreams.some(w => w.userId === userId)
            ? state.watchingStreams
            : [...state.watchingStreams, { userId, username }],
    })),
    removeWatching: (userId) => set((state) => ({
        watchingStreams: state.watchingStreams.filter(w => w.userId !== userId),
    })),
    clearWatching: () => set({ watchingStreams: [] }),

    // Voice channel actions
    loadChannels: async (chatId: string) => {
        try {
            const channels = await api.get<any[]>(`/voice-channels?chatId=${chatId}`);
            set({ chatId, categories: groupByCategory(channels) });
        } catch (error) {
            console.error('[VoiceStore] Failed to load channels:', error);
            set({ chatId, categories: [] });
        }
    },

    joinChannel: async (channelId: string) => {
        // Leave current channel first
        const current = get().currentChannel;
        if (current) {
            socketService.voiceLeave(current.id);
            voiceChannelPeerManager.destroy();
        }

        const channel = get().categories
            .flatMap(cat => cat.channels)
            .find(ch => ch.id === channelId);

        if (!channel) {
            console.error('[VoiceStore] Channel not found in categories:', channelId);
            return;
        }

        // Init WebRTC mic — if fails, still join but muted
        let micFailed = false;
        try {
            const settings = get().voiceSettings;
            await voiceChannelPeerManager.init(settings.inputDeviceId || undefined);
            voiceChannelPeerManager.startVoiceActivityDetection();
        } catch (err) {
            console.warn('[VoiceStore] Failed to get mic access, joining muted:', err);
            micFailed = true;
        }

        // Add self to participants optimistically (socket event may be delayed)
        const currentUser = useAuthStore.getState().user;
        const existingParticipants = channel.participants || [];
        const selfAlreadyIn = existingParticipants.some(p => p.userId === currentUser?.id);
        const selfParticipant: VoiceChannelParticipant = {
            userId: currentUser?.id || '',
            username: currentUser?.username || '',
            firstName: currentUser?.firstName,
            avatar: currentUser?.avatar,
            isMuted: micFailed,
            isDeafened: false,
            isSpeaking: false,
            joinedAt: new Date(),
        };

        // IMPORTANT: Set currentChannel BEFORE emitting voice:join.
        // The server responds with voice:participants:sync immediately,
        // and the handler in useSocket checks currentChannel?.id to match.
        set({
            currentChannel: channel,
            isConnected: true,
            isMuted: micFailed,
            participants: selfAlreadyIn
                ? existingParticipants
                : [...existingParticipants, selfParticipant],
        });

        socketService.voiceJoin(channelId);
    },

    leaveChannel: () => {
        const current = get().currentChannel;
        if (current) {
            socketService.voiceLeave(current.id);
        }
        voiceChannelPeerManager.destroy();
        set({
            currentChannel: null,
            isConnected: false,
            participants: [],
            isMuted: false,
            isDeafened: false,
            watchingStreams: [],
        });
    },

    createChannel: async (chatId: string, name: string, category?: string) => {
        const data = await api.post<any>('/voice-channels', {
            chatId,
            name,
            category: category || 'general',
        });

        const newChannel: VoiceChannel = {
            id: data.id,
            name: data.name,
            description: data.description,
            categoryId: data.category || 'general',
            position: data.position,
            participants: [],
            maxParticipants: data.maxParticipants,
            isLocked: data.isLocked,
            createdAt: new Date(data.createdAt),
            createdBy: data.createdBy,
        };

        set((state) => {
            const catId = newChannel.categoryId;
            const existing = state.categories.find(c => c.id === catId);
            if (existing) {
                return {
                    categories: state.categories.map(cat =>
                        cat.id === catId
                            ? { ...cat, channels: [...cat.channels, newChannel] }
                            : cat
                    ),
                };
            }
            // New category
            return {
                categories: [...state.categories, {
                    id: catId,
                    name: catId,
                    position: state.categories.length,
                    channels: [newChannel],
                }],
            };
        });

        return newChannel;
    },

    deleteChannel: async (channelId: string) => {
        await api.delete(`/voice-channels/${channelId}`);
        set((state) => ({
            categories: state.categories.map(cat => ({
                ...cat,
                channels: cat.channels.filter(ch => ch.id !== channelId),
            })).filter(cat => cat.channels.length > 0),
            currentChannel: state.currentChannel?.id === channelId ? null : state.currentChannel,
            isConnected: state.currentChannel?.id === channelId ? false : state.isConnected,
        }));
    },

    renameCategory: async (chatId: string, oldName: string, newName: string) => {
        await api.patch('/voice-channels/categories/rename', { chatId, oldName, newName });
        set((state) => ({
            categories: state.categories.map(cat =>
                cat.id === oldName ? { ...cat, id: newName, name: newName === 'general' ? 'Общие' : newName } : cat
            ),
        }));
    },

    deleteCategory: async (chatId: string, category: string) => {
        await api.post('/voice-channels/categories/delete', { chatId, category });
        set((state) => ({
            categories: state.categories.filter(cat => cat.id !== category),
        }));
    },

    reorderCategories: async (chatId: string, categoryOrder: { category: string; position: number }[]) => {
        await api.patch('/voice-channels/categories/reorder', { chatId, categoryOrder });
        // Re-sort categories locally
        set((state) => {
            const orderMap = new Map(categoryOrder.map(o => [o.category, o.position]));
            return {
                categories: [...state.categories].sort((a, b) =>
                    (orderMap.get(a.id) ?? a.position) - (orderMap.get(b.id) ?? b.position)
                ),
            };
        });
    },

    reorderChannels: async (chatId: string, channels: { id: string; position: number; category: string }[]) => {
        // Optimistic update
        const prev = get().categories;
        const channelMap = new Map(channels.map(c => [c.id, c]));

        set((state) => {
            // Rebuild categories from reorder data
            const newCategories = state.categories.map(cat => ({
                ...cat,
                channels: cat.channels
                    .map(ch => {
                        const update = channelMap.get(ch.id);
                        if (update) return { ...ch, position: update.position, categoryId: update.category };
                        return ch;
                    })
                    .filter(ch => ch.categoryId === cat.id)
                    .sort((a, b) => a.position - b.position),
            }));
            // Move channels that changed category
            for (const [chId, update] of channelMap) {
                const existsInTarget = newCategories.find(c => c.id === update.category)?.channels.some(ch => ch.id === chId);
                if (!existsInTarget) {
                    const sourceChannel = prev.flatMap(c => c.channels).find(ch => ch.id === chId);
                    if (sourceChannel) {
                        const targetCat = newCategories.find(c => c.id === update.category);
                        if (targetCat) {
                            targetCat.channels.push({ ...sourceChannel, position: update.position, categoryId: update.category });
                            targetCat.channels.sort((a, b) => a.position - b.position);
                        }
                    }
                }
            }
            return { categories: newCategories.filter(c => c.channels.length > 0) };
        });

        try {
            await api.patch('/voice-channels/reorder', { chatId, channels });
        } catch {
            // Revert on error
            set({ categories: prev });
        }
    },

    reset: () => set({
        chatId: null,
        categories: [],
        currentChannel: null,
        isConnected: false,
        isMuted: false,
        isDeafened: false,
        participants: [],
        leavingParticipants: [],
        isVoicePanelOpen: false,
        showSettings: false,
        viewingChannel: null,
        watchingStreams: [],
    }),
}), {
    name: 'voice-settings',
    partialize: (state) => ({
        voiceSettings: state.voiceSettings,
        userVolumes: state.userVolumes,
    }),
}));
