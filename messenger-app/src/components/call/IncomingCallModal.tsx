import { useEffect, useState } from 'react';
import { useCallStore } from '@/stores/callStore';
import { useAuthStore } from '@/stores/authStore';
import { socketService } from '@/lib/socket';
import { peerManager } from '@/lib/webrtc/PeerManager';
import { ringtone } from '@/lib/ringtone';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function IncomingCallModal() {
    const incomingCall = useCallStore((s) => s.incomingCall);
    const setIncomingCall = useCallStore((s) => s.setIncomingCall);
    const setActiveCall = useCallStore((s) => s.setActiveCall);
    const setLocalStream = useCallStore((s) => s.setLocalStream);
    const currentUser = useAuthStore((s) => s.user);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (incomingCall) {
            requestAnimationFrame(() => setIsVisible(true));
        } else {
            setIsVisible(false);
        }
    }, [incomingCall]);

    if (!incomingCall) return null;

    const handleAccept = async () => {
        ringtone.stop();

        setActiveCall({
            callId: incomingCall.callId,
            chatId: incomingCall.chatId,
            chatTitle: incomingCall.chatTitle,
            type: incomingCall.type,
            status: 'connecting',
            participants: [
                {
                    userId: incomingCall.callerId,
                    username: incomingCall.callerName,
                    avatar: incomingCall.callerAvatar,
                    isMuted: false,
                    volume: 100,
                },
                {
                    userId: currentUser?.id || '',
                    username: currentUser?.username || '',
                    firstName: currentUser?.firstName,
                    avatar: currentUser?.avatar,
                    isMuted: false,
                    volume: 100,
                },
            ],
            startedAt: new Date(),
            initiatorId: incomingCall.callerId,
        });

        try {
            const stream = await peerManager.init();
            setLocalStream(stream);
            peerManager.setCallId(incomingCall.callId);
        } catch {
            toast.error('Нет доступа к микрофону');
            setActiveCall(null);
            socketService.rejectCall(incomingCall.callId);
            setIncomingCall(null);
            return;
        }

        socketService.acceptCall(incomingCall.callId);
        setIncomingCall(null);
    };

    const handleReject = () => {
        ringtone.stop();
        socketService.rejectCall(incomingCall.callId);
        setIncomingCall(null);
    };

    const callerName = incomingCall.callerName || 'Неизвестный';
    const callerInitials = callerName.slice(0, 2).toUpperCase();

    return (
        <div
            className={cn(
                'fixed top-4 right-4 z-[100] w-[400px] max-w-[calc(100vw-2rem)]',
                'transition-all duration-300 ease-out',
                isVisible
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-full opacity-0'
            )}
        >
            <div className="bg-[#232428] rounded-lg shadow-2xl border border-white/10 p-4 flex items-center gap-4">
                {/* Avatar with pulsing green ring */}
                <div className="relative flex-shrink-0">
                    <div className="absolute -inset-1 rounded-full border-2 border-[#23a559] animate-pulse" />
                    <Avatar className="h-12 w-12">
                        <AvatarImage src={incomingCall.callerAvatar} className="object-cover" />
                        <AvatarFallback className="bg-[#5865f2] text-white text-sm font-medium">
                            {callerInitials}
                        </AvatarFallback>
                    </Avatar>
                </div>

                {/* Name + status */}
                <div className="flex-1 min-w-0">
                    <p className="text-[#dbdee1] font-semibold text-sm truncate">
                        {callerName}
                    </p>
                    <p className="text-[#949ba4] text-xs animate-pulse">
                        Входящий звонок...
                    </p>
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={handleAccept}
                        className="h-10 w-10 rounded-full bg-[#23a559] text-white flex items-center justify-center hover:bg-[#1a8f4a] transition-colors active:scale-90"
                    >
                        <Phone className="h-4 w-4" />
                    </button>
                    <button
                        onClick={handleReject}
                        className="h-10 w-10 rounded-full bg-[#ed4245] text-white flex items-center justify-center hover:bg-[#d63638] transition-colors active:scale-90"
                    >
                        <PhoneOff className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
