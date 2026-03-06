import { useEffect, useRef, memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MicOff, HeadphoneOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CallParticipantTileProps {
    userId: string;
    username: string;
    firstName?: string;
    avatar?: string;
    isMuted: boolean;
    isDeafened?: boolean;
    isSpeaking: boolean;
    videoStream?: MediaStream | null;
    isLocal?: boolean;
    onContextMenu?: (e: React.MouseEvent) => void;
}

export const CallParticipantTile = memo(function CallParticipantTile({
    username,
    firstName,
    avatar,
    isMuted,
    isDeafened,
    isSpeaking,
    videoStream,
    isLocal,
    onContextMenu,
}: CallParticipantTileProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const displayName = firstName || username;
    const initials = displayName.slice(0, 2).toUpperCase();

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = videoStream || null;
        }
    }, [videoStream]);

    return (
        <div
            className={cn(
                'relative bg-[#2b2d31] rounded-xl overflow-hidden flex items-center justify-center aspect-video',
                'transition-shadow duration-200',
                isSpeaking && 'ring-2 ring-[#23a559] shadow-[0_0_12px_rgba(35,165,89,0.3)]'
            )}
            onContextMenu={onContextMenu}
        >
            {videoStream ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal}
                    className={cn(
                        'w-full h-full object-cover',
                        isLocal && 'scale-x-[-1]'
                    )}
                />
            ) : (
                <Avatar className="h-20 w-20">
                    <AvatarImage src={avatar} className="object-cover" />
                    <AvatarFallback className="bg-[#5865f2] text-white text-2xl font-medium">
                        {initials}
                    </AvatarFallback>
                </Avatar>
            )}

            {/* Bottom overlay: name + indicators */}
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/60 to-transparent flex items-center gap-2">
                <span className="text-[#dbdee1] text-sm font-medium truncate">
                    {displayName}
                    {isLocal && ' (Вы)'}
                </span>
                <div className="flex items-center gap-1 ml-auto">
                    {isMuted && (
                        <div className="h-5 w-5 rounded-full bg-[#ed4245]/80 flex items-center justify-center">
                            <MicOff className="h-3 w-3 text-white" />
                        </div>
                    )}
                    {isDeafened && (
                        <div className="h-5 w-5 rounded-full bg-[#ed4245]/80 flex items-center justify-center">
                            <HeadphoneOff className="h-3 w-3 text-white" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});
