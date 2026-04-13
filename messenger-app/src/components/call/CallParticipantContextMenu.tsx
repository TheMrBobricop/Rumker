import { useState, useEffect, useRef } from 'react';
import { useCallStore } from '@/stores/callStore';
import { peerManager } from '@/lib/webrtc/PeerManager';
import { cn } from '@/lib/utils';

interface CallParticipantContextMenuProps {
    userId: string;
    username: string;
    x: number;
    y: number;
    onClose: () => void;
}

export function CallParticipantContextMenu({ userId, username, x, y, onClose }: CallParticipantContextMenuProps) {
    const participantVolumes = useCallStore((s) => s.participantVolumes);
    const setParticipantVolume = useCallStore((s) => s.setParticipantVolume);
    const [volume, setVolume] = useState(participantVolumes[userId] ?? 100);
    const [localMuted, setLocalMuted] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    const handleVolumeChange = (newVolume: number) => {
        setVolume(newVolume);
        setParticipantVolume(userId, newVolume);
        peerManager.setVolume(userId, newVolume);
    };

    const handleLocalMute = () => {
        const newMuted = !localMuted;
        setLocalMuted(newMuted);
        handleVolumeChange(newMuted ? 0 : 100);
    };

    return (
        <div
            ref={menuRef}
            className="fixed z-[200] bg-[#111214] border border-white/10 rounded-lg shadow-xl py-2 px-3 w-56"
            style={{ top: y, left: x }}
        >
            <div className="text-[#dbdee1] text-sm font-semibold mb-2 truncate">
                {username}
            </div>

            {/* Volume slider */}
            <div className="mb-2">
                <div className="flex items-center justify-between text-xs text-[#949ba4] mb-1">
                    <span>Громкость</span>
                    <span>{volume}%</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={200}
                    value={volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#4e5058] rounded-full appearance-none cursor-pointer accent-[#5865f2]"
                />
            </div>

            {/* Mute for me */}
            <button
                onClick={handleLocalMute}
                className={cn(
                    'w-full text-left text-sm px-2 py-1.5 rounded hover:bg-[#383a40] transition-colors',
                    localMuted ? 'text-[#ed4245]' : 'text-[#dbdee1]'
                )}
            >
                {localMuted ? 'Размутить для себя' : 'Замутить для себя'}
            </button>
        </div>
    );
}
