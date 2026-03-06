import { useEffect, useRef } from 'react';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { voiceChannelPeerManager } from '@/lib/webrtc/VoiceChannelPeerManager';

/**
 * Push-to-Talk hook: holds key = unmuted, release = muted (with optional delay).
 * Only active when inputMode === 'pushToTalk' and user is connected to a voice channel.
 */
export function usePushToTalk() {
    const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isHeldRef = useRef(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input/textarea
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

            const state = useVoiceChannelStore.getState();
            if (!state.isConnected || state.voiceSettings.inputMode !== 'pushToTalk') return;
            if (e.code !== state.voiceSettings.pttKey) return;
            if (isHeldRef.current) return; // key repeat

            e.preventDefault();
            isHeldRef.current = true;

            // Cancel any pending release
            if (releaseTimerRef.current) {
                clearTimeout(releaseTimerRef.current);
                releaseTimerRef.current = null;
            }

            voiceChannelPeerManager.setPTTState(true);
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const state = useVoiceChannelStore.getState();
            if (!state.isConnected || state.voiceSettings.inputMode !== 'pushToTalk') return;
            if (e.code !== state.voiceSettings.pttKey) return;
            if (!isHeldRef.current) return;

            isHeldRef.current = false;
            const delay = state.voiceSettings.pttReleaseDelay || 0;

            if (delay > 0) {
                releaseTimerRef.current = setTimeout(() => {
                    voiceChannelPeerManager.setPTTState(false);
                    releaseTimerRef.current = null;
                }, delay);
            } else {
                voiceChannelPeerManager.setPTTState(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (releaseTimerRef.current) {
                clearTimeout(releaseTimerRef.current);
            }
        };
    }, []);
}
