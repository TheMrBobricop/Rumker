import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pin, PinOff, BellOff, Bell, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Chat } from '@/types';

interface ChatListContextMenuProps {
    chat: Chat;
    x: number;
    y: number;
    onClose: () => void;
    onPin: (chat: Chat) => void;
    onMute: (chat: Chat) => void;
    onClear: (chat: Chat) => void;
    onDelete: (chat: Chat) => void;
}

export function ChatListContextMenu({
    chat, x, y, onClose, onPin, onMute, onClear, onDelete,
}: ChatListContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Position adjustment
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

    const items = [
        {
            icon: chat.isPinned ? PinOff : Pin,
            label: chat.isPinned ? 'Открепить' : 'Закрепить',
            onClick: () => { onPin(chat); onClose(); },
        },
        {
            icon: chat.isMuted ? Bell : BellOff,
            label: chat.isMuted ? 'Включить звук' : 'Без звука',
            onClick: () => { onMute(chat); onClose(); },
        },
        {
            icon: XCircle,
            label: 'Очистить чат',
            onClick: () => { onClear(chat); onClose(); },
        },
        {
            icon: Trash2,
            label: 'Удалить чат',
            danger: true,
            onClick: () => { onDelete(chat); onClose(); },
        },
    ];

    return createPortal(
        <>
            <div className="fixed inset-0 z-40" />
            <div
                ref={menuRef}
                className="fixed z-50 min-w-[180px] bg-card rounded-xl shadow-xl border border-border overflow-hidden animate-ctx-menu-in"
                style={{ left: x, top: y, transformOrigin: 'top left' }}
            >
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.label}
                            onClick={item.onClick}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted active:scale-[0.97]",
                                item.danger ? "text-red-500" : "text-foreground"
                            )}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </>,
        document.body
    );
}
