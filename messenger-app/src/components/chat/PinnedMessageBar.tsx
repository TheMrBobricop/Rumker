import { useState, useCallback, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

function getPreview(msg: Message): string {
    if (msg.content) return msg.content;
    switch (msg.type) {
        case 'image': return 'Фото';
        case 'video': return 'Видео';
        case 'voice': return 'Голосовое';
        case 'file': return 'Файл';
        case 'sticker': return 'Стикер';
        case 'poll': return 'Опрос';
        case 'location': return 'Геолокация';
        case 'contact': return 'Контакт';
        default: return 'Сообщение';
    }
}

function getSenderName(msg: Message): string {
    if (msg.sender?.firstName) return msg.sender.firstName;
    if (msg.sender?.username) return msg.sender.username;
    return 'Пользователь';
}

interface PinnedMessageBarProps {
    pinnedMessages: Message[];
    onScrollToMessage: (messageId: string) => void;
    onClose: () => void;
    onUnpinAll?: () => void;
    canUnpin?: boolean;
}

export function PinnedMessageBar({ pinnedMessages, onScrollToMessage, onClose, onUnpinAll, canUnpin }: PinnedMessageBarProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState<'up' | 'down'>('up');
    const [animating, setAnimating] = useState(false);
    const [showUnpinMenu, setShowUnpinMenu] = useState(false);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const total = pinnedMessages.length;

    // Reset index when pin list changes
    useEffect(() => {
        if (currentIndex >= total) {
            setCurrentIndex(Math.max(0, total - 1));
        }
    }, [total, currentIndex]);

    // Close unpin menu on outside click
    useEffect(() => {
        if (!showUnpinMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowUnpinMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showUnpinMenu]);

    const handleClick = useCallback(() => {
        if (total <= 0) return;

        if (total === 1) {
            onScrollToMessage(pinnedMessages[0].id);
            return;
        }

        // Cycle to next pin
        const nextIndex = (currentIndex + 1) % total;
        setDirection(nextIndex > currentIndex || (currentIndex === total - 1 && nextIndex === 0) ? 'up' : 'down');
        setAnimating(true);
        setTimeout(() => setAnimating(false), 200);
        setCurrentIndex(nextIndex);
        onScrollToMessage(pinnedMessages[nextIndex].id);
    }, [total, currentIndex, pinnedMessages, onScrollToMessage]);

    const handleCloseMouseDown = useCallback(() => {
        if (canUnpin && onUnpinAll) {
            longPressTimer.current = setTimeout(() => {
                setShowUnpinMenu(true);
                longPressTimer.current = null;
            }, 500);
        }
    }, [canUnpin, onUnpinAll]);

    const handleCloseMouseUp = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleCloseClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!showUnpinMenu) {
            onClose();
        }
    }, [onClose, showUnpinMenu]);

    const handleCloseContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (canUnpin && onUnpinAll) {
            setShowUnpinMenu(true);
        }
    }, [canUnpin, onUnpinAll]);

    if (total === 0) return null;

    const currentMessage = pinnedMessages[currentIndex] || pinnedMessages[0];

    // Segment indicator: show up to 4 segments
    const maxSegments = Math.min(total, 4);

    return (
        <div className="relative shrink-0">
            <div
                className="flex items-center gap-2 px-3 py-1.5 border-b border-tg-divider bg-card/95 backdrop-blur-sm cursor-pointer hover:bg-tg-hover transition-colors"
                onClick={handleClick}
            >
                {/* Telegram-style vertical segment indicator */}
                <div className="flex flex-col gap-[2px] shrink-0 h-8 justify-center">
                    {Array.from({ length: maxSegments }).map((_, i) => {
                        // Map segment index to whether it should be active
                        let isActive: boolean;
                        if (total <= 4) {
                            isActive = i === currentIndex;
                        } else {
                            // For >4 pins, map segments proportionally
                            if (i === 0) isActive = currentIndex === 0;
                            else if (i === maxSegments - 1) isActive = currentIndex === total - 1;
                            else {
                                const range = total - 2;
                                const segRange = maxSegments - 2;
                                const segStart = Math.round((i - 1) * range / segRange) + 1;
                                const segEnd = Math.round(i * range / segRange) + 1;
                                isActive = currentIndex >= segStart && currentIndex < segEnd;
                            }
                        }

                        return (
                            <div
                                key={i}
                                className={cn(
                                    "w-[3px] rounded-full transition-all duration-200",
                                    isActive
                                        ? "bg-tg-primary h-3"
                                        : "bg-tg-primary/30 h-2"
                                )}
                            />
                        );
                    })}
                </div>

                {/* Message content with slide animation */}
                <div className="flex-1 min-w-0 overflow-hidden">
                    <div
                        className={cn(
                            "transition-transform duration-200",
                            animating && direction === 'up' && "animate-slide-up-pin",
                            animating && direction === 'down' && "animate-slide-down-pin",
                        )}
                    >
                        <div className="text-[11px] font-semibold text-tg-primary leading-tight">
                            {total > 1
                                ? `Закреп. #${currentIndex + 1}`
                                : 'Закреплённое сообщение'}
                        </div>
                        <div className="text-xs text-tg-text truncate leading-snug mt-px">
                            <span className="font-medium text-tg-text-secondary">{getSenderName(currentMessage)}: </span>
                            {getPreview(currentMessage)}
                        </div>
                    </div>
                </div>

                {/* Close button with long-press for unpin-all */}
                <div className="relative shrink-0" ref={menuRef}>
                    <button
                        onClick={handleCloseClick}
                        onMouseDown={handleCloseMouseDown}
                        onMouseUp={handleCloseMouseUp}
                        onMouseLeave={handleCloseMouseUp}
                        onContextMenu={handleCloseContextMenu}
                        className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-tg-text-secondary"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>

                    {/* Unpin All context menu */}
                    {showUnpinMenu && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-card rounded-lg shadow-lg border border-tg-divider py-1 min-w-[160px]">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowUnpinMenu(false);
                                    onUnpinAll?.();
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-tg-hover transition-colors"
                            >
                                Открепить все
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
