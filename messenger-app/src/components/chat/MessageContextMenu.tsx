
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Reply, Copy, Pencil, Trash2, CheckSquare, Forward, Pin, PinOff, Star } from 'lucide-react';
import { addGifToFavorites, isGifFavorited } from './GifPicker';
import type { Message } from '@/types';
import { cn } from '@/lib/utils';

interface MessageContextMenuProps {
    x: number;
    y: number;
    message: Message;
    isMe: boolean;
    onClose: () => void;
    onReply: (message: Message) => void;
    onCopy: (message: Message) => void;
    onEdit: (message: Message) => void;
    onDelete: (message: Message) => void;
    onReaction: (message: Message, emoji: string) => void;
    onSelect?: (message: Message) => void;
    onForward?: (message: Message) => void;
    onPin?: (message: Message) => void;
    onUnpin?: (message: Message) => void;
    isPinned?: boolean;
    /** Admin can delete others' messages */
    canDeleteOthers?: boolean;
    /** Admin can pin/unpin messages */
    canPin?: boolean;
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export function MessageContextMenu({
    x,
    y,
    message,
    isMe,
    onClose,
    onReply,
    onCopy,
    onEdit,
    onDelete,
    onReaction,
    onSelect,
    onForward,
    onPin,
    onUnpin,
    isPinned,
    canDeleteOthers,
    canPin,
}: MessageContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [closing, setClosing] = useState(false);

    const handleClose = () => {
        setClosing(true);
        setTimeout(() => onClose(), 120);
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                handleClose();
            }
        };
        const handleTouchOutside = (e: TouchEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                handleClose();
            }
        };
        const handleScroll = () => handleClose();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleTouchOutside);
        document.addEventListener('scroll', handleScroll, true);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleTouchOutside);
            document.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onClose]);

    // Adjust position so menu doesn't overflow viewport
    useLayoutEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const padding = 8;

            let left = x;
            let top = y;

            if (rect.right > vw) {
                left = vw - rect.width - padding;
            }
            if (left < padding) {
                left = padding;
            }
            if (rect.bottom > vh) {
                top = y - rect.height;
                if (top < padding) top = padding;
            }
            if (top < padding) {
                top = padding;
            }

            menuRef.current.style.left = `${left}px`;
            menuRef.current.style.top = `${top}px`;

            // Set transform origin relative to click position
            const originX = x - left;
            const originY = y - top;
            menuRef.current.style.setProperty('--ctx-origin', `${originX}px ${originY}px`);
            menuRef.current.style.visibility = 'visible';
        }
    }, [x, y]);

    const hasText = message.type === 'text' && message.content;

    const menuContent = (
        <div
            ref={menuRef}
            className={cn(
                "fixed z-[100] min-w-[200px] max-w-[calc(100vw-16px)] rounded-xl bg-white dark:bg-zinc-800 shadow-xl border border-gray-100 dark:border-zinc-700 py-1",
                closing ? "animate-ctx-menu-out" : "animate-ctx-menu-in"
            )}
            style={{ left: x, top: y, visibility: 'hidden' }}
        >
            {/* Emoji Reactions Row */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 dark:border-zinc-700">
                {REACTIONS.map((emoji, i) => (
                    <button
                        key={emoji}
                        className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors text-lg active:scale-110 animate-reaction-pop"
                        style={{ animationDelay: `${i * 30}ms` }}
                        onClick={() => { onReaction(message, emoji); handleClose(); }}
                    >
                        {emoji}
                    </button>
                ))}
            </div>

            {/* Actions */}
            <MenuItem
                icon={<Reply className="h-4 w-4" />}
                label="Ответить"
                onClick={() => { onReply(message); handleClose(); }}
            />

            {hasText && (
                <MenuItem
                    icon={<Copy className="h-4 w-4" />}
                    label="Копировать"
                    onClick={() => { onCopy(message); handleClose(); }}
                />
            )}

            {onForward && (
                <MenuItem
                    icon={<Forward className="h-4 w-4" />}
                    label="Переслать"
                    onClick={() => { onForward(message); handleClose(); }}
                />
            )}

            {/* Save GIF to favorites */}
            {message.type === 'image' && message.mediaUrl && (message.mediaUrl.includes('.gif') || message.mediaUrl.includes('tenor.com') || message.mediaUrl.includes('giphy.com')) && (
                <MenuItem
                    icon={<Star className="h-4 w-4" />}
                    label={isGifFavorited(message.mediaUrl) ? 'Убрать из избранного' : 'GIF в избранное'}
                    onClick={() => {
                        if (message.mediaUrl) {
                            addGifToFavorites(message.mediaUrl);
                        }
                        handleClose();
                    }}
                />
            )}

            {/* Pin / Unpin — show for admins with can_pin or owner */}
            {(canPin || isMe) && (isPinned && onUnpin ? (
                <MenuItem
                    icon={<PinOff className="h-4 w-4" />}
                    label="Открепить"
                    onClick={() => { onUnpin(message); handleClose(); }}
                />
            ) : onPin ? (
                <MenuItem
                    icon={<Pin className="h-4 w-4" />}
                    label="Закрепить"
                    onClick={() => { onPin(message); handleClose(); }}
                />
            ) : null)}

            {onSelect && (
                <MenuItem
                    icon={<CheckSquare className="h-4 w-4" />}
                    label="Выделить"
                    onClick={() => { onSelect(message); handleClose(); }}
                />
            )}

            {isMe && (
                <MenuItem
                    icon={<Pencil className="h-4 w-4" />}
                    label="Изменить"
                    onClick={() => { onEdit(message); handleClose(); }}
                />
            )}

            {(isMe || canDeleteOthers) && (
                <MenuItem
                    icon={<Trash2 className="h-4 w-4" />}
                    label="Удалить"
                    onClick={() => { onDelete(message); handleClose(); }}
                    destructive
                />
            )}
        </div>
    );

    return createPortal(menuContent, document.body);
}

function MenuItem({
    icon,
    label,
    onClick,
    destructive = false,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    destructive?: boolean;
}) {
    return (
        <button
            className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-zinc-700 min-h-[44px] active:scale-[0.97]",
                destructive ? "text-red-500" : "text-gray-700 dark:text-gray-200"
            )}
            onClick={onClick}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
