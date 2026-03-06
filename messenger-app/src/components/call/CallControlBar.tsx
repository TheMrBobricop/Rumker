import { useCallback } from 'react';
import { useCallStore } from '@/stores/callStore';
import { socketService } from '@/lib/socket';
import { peerManager } from '@/lib/webrtc/PeerManager';
import { Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CallControlBarProps {
    onLeave: () => void;
    participantCount?: number;
}

export function CallControlBar({ onLeave, participantCount }: CallControlBarProps) {
    const activeCall = useCallStore((s) => s.activeCall);
    const isMuted = useCallStore((s) => s.isMuted);
    const isDeafened = useCallStore((s) => s.isDeafened);
    const isCameraOn = useCallStore((s) => s.isCameraOn);
    const isScreenSharing = useCallStore((s) => s.isScreenSharing);
    const toggleMute = useCallStore((s) => s.toggleMute);
    const toggleDeafen = useCallStore((s) => s.toggleDeafen);

    const handleToggleMute = useCallback(() => {
        if (!activeCall) return;
        toggleMute();
        socketService.toggleCallMute(activeCall.callId, !isMuted);
    }, [activeCall, isMuted, toggleMute]);

    const handleToggleDeafen = useCallback(() => {
        if (!activeCall) return;
        const newDeafened = !isDeafened;
        toggleDeafen();
        peerManager.setDeafened(newDeafened);
        socketService.deafenCall(activeCall.callId, newDeafened);
        // Deafen also mutes
        if (newDeafened && !isMuted) {
            socketService.toggleCallMute(activeCall.callId, true);
        }
    }, [activeCall, isDeafened, isMuted, toggleDeafen]);

    const handleToggleCamera = useCallback(async () => {
        try {
            const stream = await peerManager.toggleCamera();
            useCallStore.getState().setCameraOn(!!stream);
            useCallStore.getState().setCameraStream(stream);
        } catch {
            toast.error('Нет доступа к камере');
        }
    }, []);

    const handleToggleScreen = useCallback(async () => {
        try {
            const stream = await peerManager.toggleScreenShare();
            useCallStore.getState().setScreenSharing(!!stream);
            useCallStore.getState().setScreenStream(stream);
        } catch {
            toast.error('Не удалось начать демонстрацию экрана');
        }
    }, []);

    return (
        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-[#2b2d31] rounded-full">
            {/* Mute */}
            <button
                onClick={handleToggleMute}
                className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
                    isMuted
                        ? 'bg-[#ed4245] text-white hover:bg-[#d63638]'
                        : 'bg-[#383a40] text-[#dbdee1] hover:bg-[#43444b]'
                )}
                title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>

            {/* Deafen */}
            <button
                onClick={handleToggleDeafen}
                className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
                    isDeafened
                        ? 'bg-[#ed4245] text-white hover:bg-[#d63638]'
                        : 'bg-[#383a40] text-[#dbdee1] hover:bg-[#43444b]'
                )}
                title={isDeafened ? 'Включить звук' : 'Оглушить'}
            >
                {isDeafened ? <HeadphoneOff className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
            </button>

            {/* Video */}
            <button
                onClick={handleToggleCamera}
                className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
                    isCameraOn
                        ? 'bg-[#383a40] text-white hover:bg-[#43444b]'
                        : 'bg-[#383a40] text-[#949ba4] hover:bg-[#43444b]'
                )}
                title={isCameraOn ? 'Выключить камеру' : 'Включить камеру'}
            >
                {isCameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>

            {/* Screen Share */}
            <button
                onClick={handleToggleScreen}
                className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
                    isScreenSharing
                        ? 'bg-[#5865f2] text-white hover:bg-[#4752c4]'
                        : 'bg-[#383a40] text-[#949ba4] hover:bg-[#43444b]'
                )}
                title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
            >
                {isScreenSharing ? <Monitor className="h-5 w-5" /> : <MonitorOff className="h-5 w-5" />}
            </button>

            {/* Participant count badge (group calls) */}
            {participantCount && participantCount > 2 && (
                <div className="px-2 py-1 bg-[#383a40] rounded-full text-[#949ba4] text-xs font-medium">
                    {participantCount}
                </div>
            )}

            {/* Disconnect */}
            <button
                onClick={onLeave}
                className="h-10 w-10 rounded-full bg-[#ed4245] text-white flex items-center justify-center hover:bg-[#d63638] transition-colors"
                title="Отключиться"
            >
                <PhoneOff className="h-5 w-5" />
            </button>
        </div>
    );
}
