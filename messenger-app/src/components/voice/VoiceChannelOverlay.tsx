import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { useAuthStore } from '@/stores/authStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Mic, MicOff, Headphones, HeadphoneOff,
    PhoneOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { socketService } from '@/lib/socket';
import { voiceChannelPeerManager } from '@/lib/webrtc/VoiceChannelPeerManager';
import { ConnectionQualityIndicator } from './ConnectionQualityIndicator';
import { useAnimatedMount, ANIM_FADE_SLIDE } from '@/lib/hooks/useAnimatedMount';

/*
 * Discord-exact Voice Connected bar at the bottom of sidebar.
 *
 * ┌───────────────────────────────────┐
 * │ 🟢 Voice Connected          📶   │
 * │    channel-name                   │
 * ├───────────────────────────────────┤
 * │ [avatar] username  [🎤][🎧][📞]  │
 * └───────────────────────────────────┘
 */

const DC = {
    panelBg:   '#232428',
    separator: '#1e1f22',
    green:     '#23a559',
    red:       '#ed4245',
    textWhite: '#dbdee1',
    textMuted: '#949ba4',
    blurple:   '#5865f2',
} as const;

export function VoiceChannelOverlay() {
    // ALL hooks must be called before any early return
    const currentChannel = useVoiceChannelStore((s) => s.currentChannel);
    const isMuted = useVoiceChannelStore((s) => s.isMuted);
    const isDeafened = useVoiceChannelStore((s) => s.isDeafened);
    const isConnected = useVoiceChannelStore((s) => s.isConnected);
    const participants = useVoiceChannelStore((s) => s.participants);
    const setMuted = useVoiceChannelStore((s) => s.setMuted);
    const setDeafened = useVoiceChannelStore((s) => s.setDeafened);
    const leaveChannel = useVoiceChannelStore((s) => s.leaveChannel);
    const setViewingChannel = useVoiceChannelStore((s) => s.setViewingChannel);
    const isPTTActive = useVoiceChannelStore((s) => s.isPTTActive);
    const inputMode = useVoiceChannelStore((s) => s.voiceSettings.inputMode);
    const currentUser = useAuthStore((s) => s.user);

    const shouldShow = isConnected && !!currentChannel;
    const { mounted, className: animClass } = useAnimatedMount(shouldShow, ANIM_FADE_SLIDE);

    // Early return AFTER all hooks
    if (!mounted || !currentChannel) return null;

    const isPTTMode = inputMode === 'pushToTalk';

    const toggleMute = () => {
        const newMuted = !isMuted;
        setMuted(newMuted);
        voiceChannelPeerManager.setMuted(newMuted);
        socketService.voiceMute(currentChannel.id, newMuted);
    };

    const toggleDeafen = () => {
        const newDeafened = !isDeafened;
        setDeafened(newDeafened);
        if (!isDeafened) {
            setMuted(true);
            voiceChannelPeerManager.setMuted(true);
        }
        voiceChannelPeerManager.setDeafened(newDeafened);
        socketService.voiceDeafen(currentChannel.id, newDeafened);
    };

    const handleDisconnect = () => {
        leaveChannel();
        setViewingChannel(null);
    };

    const handleOpenPanel = () => {
        setViewingChannel({
            id: currentChannel.id,
            name: currentChannel.name,
            chatId: '',
        });
    };

    const myParticipant = participants.find(p => p.userId === currentUser?.id);
    const isSpeaking = myParticipant?.isSpeaking ?? false;

    return (
        <div
            className={`shrink-0 ${animClass} select-none`}
            style={{ background: DC.panelBg }}
        >
            {/* ── Voice Connected (clickable → opens panel) ── */}
            <button
                onClick={handleOpenPanel}
                className="w-full flex items-center gap-2.5 px-3 pt-2.5 pb-1 transition-opacity hover:opacity-85"
            >
                {/* Green signal dot with ping */}
                <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                    <div className="w-2 h-2 rounded-full z-10" style={{ background: DC.green }} />
                    <div
                        className="absolute w-2 h-2 rounded-full animate-ping"
                        style={{ background: DC.green, animationDuration: '1.5s' }}
                    />
                </div>

                <div className="flex-1 min-w-0 text-left">
                    <div className="text-[13px] font-semibold leading-tight" style={{ color: DC.green }}>
                        Voice Connected
                    </div>
                    <div className="text-[11px] leading-tight truncate mt-0.5" style={{ color: DC.textMuted }}>
                        {currentChannel.name}
                    </div>
                </div>

                <ConnectionQualityIndicator size={20} />
            </button>

            {/* Separator */}
            <div className="mx-2 my-1.5" style={{ height: 1, background: DC.separator }} />

            {/* ── User panel + controls ── */}
            <div className="flex items-center gap-2 px-2 pb-2">
                {/* Avatar with speaking indicator */}
                <div className="relative shrink-0">
                    <Avatar className={cn("h-8 w-8", isSpeaking && "dc-speaking-ring")}>
                        <AvatarImage src={currentUser?.avatar} />
                        <AvatarFallback
                            className="text-[10px] font-semibold text-white"
                            style={{ background: DC.blurple }}
                        >
                            {(currentUser?.firstName || currentUser?.username || '?').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    {/* Online dot */}
                    <div
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full"
                        style={{ background: DC.green, border: `2.5px solid ${DC.panelBg}` }}
                    />
                </div>

                {/* Username + status */}
                <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate leading-tight" style={{ color: DC.textWhite }}>
                        {currentUser?.firstName || currentUser?.username}
                    </div>
                    <div
                        className="text-[11px] leading-tight truncate"
                        style={{ color: isDeafened || isMuted ? DC.red : isPTTActive ? DC.green : DC.textMuted }}
                    >
                        {isDeafened ? 'Deafened' : isMuted ? 'Muted' : isPTTMode ? (isPTTActive ? 'Speaking (PTT)' : 'Push to Talk') : 'Connected'}
                    </div>
                </div>

                {/* ── Control buttons ── */}
                <div className="flex items-center gap-0.5">
                    <button onClick={toggleMute} className="dc-voice-btn" title={isMuted ? 'Unmute' : 'Mute'}>
                        {isMuted ? (
                            <MicOff className="h-[18px] w-[18px]" style={{ color: DC.red }} />
                        ) : (
                            <Mic className="h-[18px] w-[18px]" style={{ color: DC.textMuted }} />
                        )}
                        <span className="dc-tooltip">{isMuted ? 'Unmute' : 'Mute'}</span>
                    </button>

                    <button onClick={toggleDeafen} className="dc-voice-btn" title={isDeafened ? 'Undeafen' : 'Deafen'}>
                        {isDeafened ? (
                            <HeadphoneOff className="h-[18px] w-[18px]" style={{ color: DC.red }} />
                        ) : (
                            <Headphones className="h-[18px] w-[18px]" style={{ color: DC.textMuted }} />
                        )}
                        <span className="dc-tooltip">{isDeafened ? 'Undeafen' : 'Deafen'}</span>
                    </button>

                    <button onClick={handleDisconnect} className="dc-voice-btn" title="Disconnect">
                        <PhoneOff className="h-[18px] w-[18px]" style={{ color: DC.red }} />
                        <span className="dc-tooltip">Disconnect</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
