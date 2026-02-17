
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Reply, Copy, Pencil, Trash2, CheckSquare, Forward } from 'lucide-react';
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
}: MessageContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleTouchOutside = (e: TouchEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleScroll = () => onClose();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
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
    }, [onClose]);

    // Adjust position so menu doesn't overflow viewport
    useEffect(() => {
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
                top = vh - rect.height - padding;
            }
            if (top < padding) {
                top = padding;
            }

            menuRef.current.style.left = `${left}px`;
            menuRef.current.style.top = `${top}px`;
        }
    }, [x, y]);

    const hasText = message.type === 'text' && message.content;

    const menuContent = (
        <div
            ref={menuRef}
            className="fixed z-[100] min-w-[200px] max-w-[calc(100vw-16px)] rounded-xl bg-white dark:bg-zinc-800 shadow-xl border border-gray-100 dark:border-zinc-700 py-1 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: x, top: y }}
        >
            {/* Emoji Reactions Row */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 dark:border-zinc-700">
                {REACTIONS.map((emoji) => (
                    <button
                        key={emoji}
                        className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors text-lg active:scale-110"
                        onClick={() => { onReaction(message, emoji); onClose(); }}
                    >
                        {emoji}
                    </button>
                ))}
            </div>

            {/* Actions */}
            <MenuItem
                icon={<Reply className="h-4 w-4" />}
                label="Ответить"
                onClick={() => { onReply(message); onClose(); }}
            />

            {hasText && (
                <MenuItem
                    icon={<Copy className="h-4 w-4" />}
                    label="Копировать"
                    onClick={() => { onCopy(message); onClose(); }}
                />
            )}

            {onForward && (
                <MenuItem
                    icon={<Forward className="h-4 w-4" />}
                    label="Переслать"
                    onClick={() => { onForward(message); onClose(); }}
                />
            )}

            {onSelect && (
                <MenuItem
                    icon={<CheckSquare className="h-4 w-4" />}
                    label="Выделить"
                    onClick={() => { onSelect(message); onClose(); }}
                />
            )}

            {isMe && (
                <MenuItem
                    icon={<Pencil className="h-4 w-4" />}
                    label="Изменить"
                    onClick={() => { onEdit(message); onClose(); }}
                />
            )}

            {isMe && (
                <MenuItem
                    icon={<Trash2 className="h-4 w-4" />}
                    label="Удалить"
                    onClick={() => { onDelete(message); onClose(); }}
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
                "flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-zinc-700",
                destructive ? "text-red-500" : "text-gray-700 dark:text-gray-200"
            )}
            onClick={onClick}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
