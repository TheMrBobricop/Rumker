import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, MessageSquare, VolumeX, Volume2, MicOff, HeadphoneOff, PhoneOff, ArrowRightLeft, Crown } from 'lucide-react';
import { socketService } from '@/lib/socket';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { toast } from 'sonner';

interface ParticipantContextMenuProps {
    userId: string;
    username: string;
    isMe: boolean;
    x: number;
    y: number;
    onClose: () => void;
    onProfile: (userId: string) => void;
    onChat: (userId: string) => void;
    onMuteUser: (userId: string) => void;
    isUserMuted: boolean;
    userVolume?: number;
    onVolumeChange?: (userId: string, volume: number) => void;
    isAdmin?: boolean;
}

export function ParticipantContextMenu({
    userId, username, isMe, x, y,
    onClose, onProfile, onChat, onMuteUser, isUserMuted,
    userVolume = 100, onVolumeChange,
    isAdmin = false,
}: ParticipantContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [volume, setVolume] = useState(userVolume);
    const currentChannel = useVoiceChannelStore((s) => s.currentChannel);
    const categories = useVoiceChannelStore((s) => s.categories);
    const prioritySpeakerId = useVoiceChannelStore((s) => s.prioritySpeakerId);
    const [showMoveMenu, setShowMoveMenu] = useState(false);

    // Position adjustment to stay within viewport
    useEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.right > vw) el.style.left = `${vw - rect.width - 8}px`;
        if (rect.bottom > vh) el.style.top = `${vh - rect.height - 8}px`;
    }, []);

    // Close on outside click or Escape
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    const handleVolumeChange = (val: number) => {
        setVolume(val);
        onVolumeChange?.(userId, val);
    };

    // All available channels for "Move to"
    const allChannels = categories.flatMap(c => c.channels).filter(ch => ch.id !== currentChannel?.id);

    const items: { icon: typeof User; label: string; onClick: () => void; danger?: boolean; separator?: boolean }[] = [
        {
            icon: User,
            label: 'Профиль',
            onClick: () => { onProfile(userId); onClose(); },
        },
    ];

    if (!isMe) {
        items.push({
            icon: MessageSquare,
            label: 'Написать',
            onClick: () => { onChat(userId); onClose(); },
        });
        items.push({
            icon: isUserMuted ? Volume2 : VolumeX,
            label: isUserMuted ? 'Включить звук' : 'Замутить',
            onClick: () => { onMuteUser(userId); onClose(); },
        });
    }

    // Admin actions
    if (isAdmin && !isMe && currentChannel) {
        items.push({ icon: User, label: '', onClick: () => {}, separator: true });

        items.push({
            icon: MicOff,
            label: 'Серверный мут',
            onClick: () => {
                socketService.voiceAdminMute(currentChannel.id, userId, true);
                toast.success(`${username} замучен`);
                onClose();
            },
        });
        items.push({
            icon: HeadphoneOff,
            label: 'Серверный дефен',
            onClick: () => {
                socketService.voiceAdminDeafen(currentChannel.id, userId, true);
                toast.success(`${username} оглушён`);
                onClose();
            },
        });
        items.push({
            icon: PhoneOff,
            label: 'Отключить от канала',
            onClick: () => {
                socketService.voiceAdminDisconnect(currentChannel.id, userId);
                toast.success(`${username} отключён`);
                onClose();
            },
            danger: true,
        });

        if (allChannels.length > 0) {
            items.push({
                icon: ArrowRightLeft,
                label: 'Переместить в канал',
                onClick: () => setShowMoveMenu(!showMoveMenu),
            });
        }

        const isPriority = prioritySpeakerId === userId;
        items.push({
            icon: Crown,
            label: isPriority ? 'Убрать приоритет' : 'Приоритетный спикер',
            onClick: () => {
                socketService.voiceAdminPrioritySpeaker(currentChannel.id, isPriority ? null : userId);
                onClose();
            },
        });
    }

    return createPortal(
        <>
            <div className="fixed inset-0 z-40" />
            <div
                ref={menuRef}
                className="fixed z-50 min-w-[200px] overflow-hidden dc-ctx-menu"
                style={{ left: x, top: y, transformOrigin: 'top left', background: '#111214', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}
            >
                {/* Username header */}
                <div className="px-3 py-2" style={{ borderBottom: '1px solid #2b2d31' }}>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate" style={{ color: '#96989d' }}>{username}</span>
                        {prioritySpeakerId === userId && (
                            <Crown className="h-3 w-3" style={{ color: '#faa61a' }} />
                        )}
                    </div>
                </div>

                {/* Volume slider (only for other users) */}
                {!isMe && (
                    <div
                        className="px-3 py-2.5"
                        style={{ borderBottom: '1px solid #2b2d31' }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#96989d' }}>Громкость</span>
                            <span className="text-[11px] font-medium" style={{ color: '#dbdee1' }}>{volume}%</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={200}
                            value={volume}
                            onChange={(e) => handleVolumeChange(Number(e.target.value))}
                            className="dc-volume-slider w-full"
                            style={{ accentColor: '#5865f2' }}
                        />
                    </div>
                )}

                {items.map((item, i) => {
                    if (item.separator) {
                        return <div key={`sep-${i}`} className="mx-2 my-1" style={{ height: 1, background: '#2b2d31' }} />;
                    }
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.label}
                            onClick={item.onClick}
                            className="dc-ctx-item w-full flex items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors"
                            style={{ color: item.danger ? '#ed4245' : '#dbdee1' }}
                        >
                            <Icon className="h-4 w-4 shrink-0" style={{ color: item.danger ? '#ed4245' : '#96989d' }} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}

                {/* Move to channel sub-menu */}
                {showMoveMenu && allChannels.length > 0 && (
                    <div className="px-1 pb-1" style={{ borderTop: '1px solid #2b2d31' }}>
                        <div className="text-[10px] font-bold uppercase tracking-wide px-2 py-1.5" style={{ color: '#96989d' }}>
                            Переместить в
                        </div>
                        {allChannels.map(ch => (
                            <button
                                key={ch.id}
                                onClick={() => {
                                    if (currentChannel) {
                                        socketService.voiceAdminMove(currentChannel.id, userId, ch.id);
                                        toast.success(`${username} перемещён в ${ch.name}`);
                                    }
                                    onClose();
                                }}
                                className="dc-ctx-item w-full flex items-center gap-2 px-2 py-1.5 text-left text-[12px]"
                                style={{ color: '#dbdee1' }}
                            >
                                <Volume2 className="h-3.5 w-3.5 shrink-0" style={{ color: '#96989d' }} />
                                <span className="truncate">{ch.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </>,
        document.body
    );
}
