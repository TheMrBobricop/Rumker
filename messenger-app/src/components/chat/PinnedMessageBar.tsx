import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

function getPreview(msg: Message): string {
    if (msg.content) return msg.content;

    switch (msg.type) {
        case 'image':
            return 'Фото';
        case 'video':
            return 'Видео';
        case 'voice':
            return 'Голосовое сообщение';
        case 'file':
            return 'Файл';
        case 'sticker':
            return 'Стикер';
        case 'poll':
            return 'Опрос';
        case 'location':
            return 'Геолокация';
        case 'contact':
            return 'Контакт';
        default:
            return 'Сообщение';
    }
}

function getSenderName(msg: Message): string {
    if (msg.sender?.firstName) return msg.sender.firstName;
    if (msg.sender?.username) return msg.sender.username;
    return 'Пользователь';
}

interface PinnedMessageBarProps {
    pinnedMessages: Message[];
    onOpenPanel: () => void;
    showSender?: boolean;
    className?: string;
}

export function PinnedMessageBar({ pinnedMessages, onOpenPanel, showSender, className }: PinnedMessageBarProps) {
    const currentMessage = pinnedMessages[0];
    const preview = useMemo(() => (currentMessage ? getPreview(currentMessage) : ''), [currentMessage]);
    const sender = useMemo(() => (currentMessage ? getSenderName(currentMessage) : ''), [currentMessage]);

    const thumbUrl = currentMessage?.mediaMetadata?.thumbnail ?? currentMessage?.mediaUrl ?? '';
    const showThumb = !!thumbUrl && (currentMessage?.type === 'image' || currentMessage?.type === 'video' || currentMessage?.type === 'sticker');

    if (!currentMessage) return null;

    return (
        <button
            type="button"
            onClick={onOpenPanel}
            title="Открыть закрепленные сообщения"
            className={cn(
                'group flex h-10 w-full items-center gap-2 rounded-md text-left hover:bg-white/5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0',
                className,
            )}
        >
            <span className="h-7 w-[2px] rounded-full pin-dash shrink-0" />

            {showThumb && (
                <span className="h-9 w-9 rounded-md overflow-hidden bg-black/30 shrink-0">
                    <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                </span>
            )}

            <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold tracking-[0.02em] text-[#8a7cff]">Закрепленное сообщение</span>
                <span key={currentMessage.id} className="block text-xs text-white/90 truncate animate-pin-header-in">
                    {showSender && sender ? `${sender}: ` : ''}
                    {preview}
                </span>
            </span>
        </button>
    );
}
