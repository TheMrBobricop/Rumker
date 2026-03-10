
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Reply, Copy, Pencil, Trash2, CheckSquare, Forward, Pin, PinOff, Star, CheckCheck, X } from 'lucide-react';
import { addGifToFavorites, isGifFavorited } from './GifPicker';
import type { Message } from '@/types';
import { cn } from '@/lib/utils';

export interface ReadByUser {
    userId: string;
    username: string;
    firstName?: string;
    avatar?: string;
    readAt: string;
}

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
    canDeleteOthers?: boolean;
    canPin?: boolean;
    readBy?: ReadByUser[];
    isPrivateChat?: boolean;
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
    readBy,
    isPrivateChat,
}: MessageContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [closing, setClosing] = useState(false);
    const [showReadList, setShowReadList] = useState(false);

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
            if (e.key === 'Escape') {
                if (showReadList) setShowReadList(false);
                else handleClose();
            }
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
    }, [onClose, showReadList]);

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

            const originX = x - left;
            const originY = y - top;
            menuRef.current.style.setProperty('--ctx-origin', `${originX}px ${originY}px`);
            menuRef.current.style.visibility = 'visible';
        }
    }, [x, y, showReadList]);

    const hasText = message.type === 'text' && message.content;
    const hasReaders = isMe && readBy && readBy.length > 0;

    const menuContent = (
        <div
            ref={menuRef}
            className={cn(
                "fixed z-[100] min-w-[200px] max-w-[calc(100vw-16px)] rounded-xl bg-white dark:bg-zinc-800 shadow-xl border border-gray-100 dark:border-zinc-700 py-1",
                closing ? "animate-ctx-menu-out" : "animate-ctx-menu-in"
            )}
            style={{ left: x, top: y, visibility: 'hidden' }}
        >
            {/* Read by section — Telegram style */}
            {hasReaders && !showReadList && (
                <div className="border-b border-gray-100 dark:border-zinc-700">
                    {isPrivateChat ? (
                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 animate-readby-fade">
                            <CheckCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <span>Прочитано {readBy![0]?.readAt ? new Date(readBy![0].readAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                    ) : (
                        <button
                            className="flex items-center gap-2 px-3 py-2 w-full hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                            onClick={() => setShowReadList(true)}
                        >
                            {/* Avatar stack */}
                            <div className="flex -space-x-1.5">
                                {readBy!.slice(0, 5).map((reader, i) => (
                                    <div
                                        key={reader.userId}
                                        className="relative animate-readby-item"
                                        style={{ animationDelay: `${i * 30}ms`, zIndex: 5 - i }}
                                    >
                                        {reader.avatar ? (
                                            <img src={reader.avatar} alt="" className="h-6 w-6 rounded-full object-cover ring-2 ring-white dark:ring-zinc-800" />
                                        ) : (
                                            <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[10px] font-medium text-blue-600 dark:text-blue-400 ring-2 ring-white dark:ring-zinc-800">
                                                {(reader.firstName || reader.username || '?').slice(0, 1).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-1 ml-1">
                                <CheckCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {readBy!.length}
                                </span>
                            </div>
                        </button>
                    )}
                </div>
            )}

            {/* Expanded read list */}
            {hasReaders && showReadList && (
                <div className="border-b border-gray-100 dark:border-zinc-700">
                    <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                            Прочитали · {readBy!.length}
                        </span>
                        <button
                            onClick={() => setShowReadList(false)}
                            className="h-5 w-5 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                        >
                            <X className="h-3 w-3 text-gray-400" />
                        </button>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                        {readBy!.map((reader, i) => (
                            <div
                                key={reader.userId}
                                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors animate-readby-item"
                                style={{ animationDelay: `${i * 30}ms` }}
                            >
                                {reader.avatar ? (
                                    <img src={reader.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                                ) : (
                                    <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                        {(reader.firstName || reader.username || '?').slice(0, 1).toUpperCase()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate block">
                                        {reader.firstName || reader.username}
                                    </span>
                                </div>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                                    {reader.readAt ? new Date(reader.readAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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

            {/* Pin / Unpin */}
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
