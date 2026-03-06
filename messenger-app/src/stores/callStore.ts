import { create } from 'zustand';
import type { ActiveCall, IncomingCall, CallParticipant } from '@/types';
import type { ConnectionQuality, ConnectionStats } from '@/lib/webrtc/PeerManager';

interface CallStore {
    activeCall: ActiveCall | null;
    incomingCall: IncomingCall | null;
    localStream: MediaStream | null;
    isMuted: boolean;
    isDeafened: boolean;
    isCameraOn: boolean;
    isScreenSharing: boolean;
    cameraStream: MediaStream | null;
    screenStream: MediaStream | null;
    participantVolumes: Record<string, number>; // userId -> 0-200
    remoteVideos: Record<string, { camera?: MediaStream; screen?: MediaStream }>;
    speakingUsers: Record<string, boolean>; // 'local' | userId -> isSpeaking
    connectionQuality: ConnectionQuality;
    connectionStats: ConnectionStats | null;
    focusedStream: { userId: string; kind: 'camera' | 'screen' } | null;

    // Actions
    setActiveCall: (call: ActiveCall | null) => void;
    setIncomingCall: (call: IncomingCall | null) => void;
    setLocalStream: (stream: MediaStream | null) => void;
    toggleMute: () => void;
    setMuted: (muted: boolean) => void;
    toggleDeafen: () => void;
    setDeafened: (deafened: boolean) => void;
    setCameraOn: (on: boolean) => void;
    setScreenSharing: (sharing: boolean) => void;
    setCameraStream: (stream: MediaStream | null) => void;
    setScreenStream: (stream: MediaStream | null) => void;
    setParticipantVolume: (userId: string, volume: number) => void;
    addParticipant: (p: CallParticipant) => void;
    removeParticipant: (userId: string) => void;
    updateParticipantMute: (userId: string, muted: boolean) => void;
    updateParticipantDeafen: (userId: string, deafened: boolean) => void;
    setCallStatus: (status: ActiveCall['status']) => void;
    setRemoteVideo: (userId: string, kind: 'camera' | 'screen', stream: MediaStream | null) => void;
    setSpeakingUsers: (users: Record<string, boolean>) => void;
    setConnectionQuality: (quality: ConnectionQuality) => void;
    setConnectionStats: (stats: ConnectionStats | null) => void;
    setFocusedStream: (focused: { userId: string; kind: 'camera' | 'screen' } | null) => void;
    reset: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
    activeCall: null,
    incomingCall: null,
    localStream: null,
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    cameraStream: null,
    screenStream: null,
    participantVolumes: {},
    remoteVideos: {},
    speakingUsers: {},
    connectionQuality: 'excellent' as ConnectionQuality,
    connectionStats: null,
    focusedStream: null,

    setActiveCall: (call) => set({ activeCall: call }),

    setIncomingCall: (call) => set({ incomingCall: call }),

    setLocalStream: (stream) => set({ localStream: stream }),

    toggleMute: () =>
        set((state) => {
            const newMuted = !state.isMuted;
            if (state.localStream) {
                state.localStream.getAudioTracks().forEach((t) => {
                    t.enabled = !newMuted;
                });
            }
            return { isMuted: newMuted };
        }),

    setMuted: (muted) =>
        set((state) => {
            if (state.localStream) {
                state.localStream.getAudioTracks().forEach((t) => {
                    t.enabled = !muted;
                });
            }
            return { isMuted: muted };
        }),

    toggleDeafen: () =>
        set((state) => {
            const newDeafened = !state.isDeafened;
            // When deafening, also mute mic
            if (newDeafened && !state.isMuted) {
                if (state.localStream) {
                    state.localStream.getAudioTracks().forEach((t) => {
                        t.enabled = false;
                    });
                }
                return { isDeafened: newDeafened, isMuted: true };
            }
            return { isDeafened: newDeafened };
        }),

    setDeafened: (deafened) => set({ isDeafened: deafened }),

    setCameraOn: (on) => set({ isCameraOn: on }),
    setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),
    setCameraStream: (stream) => set({ cameraStream: stream }),
    setScreenStream: (stream) => set({ screenStream: stream }),

    setParticipantVolume: (userId, volume) =>
        set((state) => ({
            participantVolumes: { ...state.participantVolumes, [userId]: volume },
        })),

    addParticipant: (p) =>
        set((state) => {
            if (!state.activeCall) return state;
            const exists = state.activeCall.participants.some((x) => x.userId === p.userId);
            if (exists) return state;
            return {
                activeCall: {
                    ...state.activeCall,
                    participants: [...state.activeCall.participants, p],
                },
            };
        }),

    removeParticipant: (userId) =>
        set((state) => {
            if (!state.activeCall) return state;
            return {
                activeCall: {
                    ...state.activeCall,
                    participants: state.activeCall.participants.filter((p) => p.userId !== userId),
                },
            };
        }),

    updateParticipantMute: (userId, muted) =>
        set((state) => {
            if (!state.activeCall) return state;
            return {
                activeCall: {
                    ...state.activeCall,
                    participants: state.activeCall.participants.map((p) =>
                        p.userId === userId ? { ...p, isMuted: muted } : p
                    ),
                },
            };
        }),

    updateParticipantDeafen: (userId, deafened) =>
        set((state) => {
            if (!state.activeCall) return state;
            return {
                activeCall: {
                    ...state.activeCall,
                    participants: state.activeCall.participants.map((p) =>
                        p.userId === userId ? { ...p, isDeafened: deafened } : p
                    ),
                },
            };
        }),

    setCallStatus: (status) =>
        set((state) => {
            if (!state.activeCall) return state;
            return {
                activeCall: { ...state.activeCall, status },
            };
        }),

    setRemoteVideo: (userId, kind, stream) =>
        set((state) => {
            const existing = state.remoteVideos[userId] || {};
            return {
                remoteVideos: {
                    ...state.remoteVideos,
                    [userId]: { ...existing, [kind]: stream || undefined },
                },
            };
        }),

    setSpeakingUsers: (users) => set({ speakingUsers: users }),

    setConnectionQuality: (quality) => set({ connectionQuality: quality }),
    setConnectionStats: (stats) => set({ connectionStats: stats }),
    setFocusedStream: (focused) => set({ focusedStream: focused }),

    reset: () =>
        set((state) => {
            if (state.localStream) {
                state.localStream.getTracks().forEach((t) => t.stop());
            }
            if (state.cameraStream) {
                state.cameraStream.getTracks().forEach((t) => t.stop());
            }
            if (state.screenStream) {
                state.screenStream.getTracks().forEach((t) => t.stop());
            }
            return {
                activeCall: null,
                incomingCall: null,
                localStream: null,
                isMuted: false,
                isDeafened: false,
                isCameraOn: false,
                isScreenSharing: false,
                cameraStream: null,
                screenStream: null,
                participantVolumes: {},
                remoteVideos: {},
                speakingUsers: {},
                connectionQuality: 'excellent' as ConnectionQuality,
                connectionStats: null,
                focusedStream: null,
            };
        }),
}));
