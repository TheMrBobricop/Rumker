import { useEffect } from 'react';
import {
    X,
    PinOff,
    Pin,
    Image as ImageIcon,
    Video,
    Mic,
    FileText,
    MapPin,
    User as UserIcon,
    BarChart3,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { Message } from '@/types';
import { useAnimatedMount, ANIM_PIN_PANEL } from '@/lib/hooks/useAnimatedMount';

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

function getTypeIcon(type: Message['type']) {
    switch (type) {
        case 'image':
            return <ImageIcon className="h-4 w-4 text-blue-500" />;
        case 'video':
            return <Video className="h-4 w-4 text-purple-500" />;
        case 'voice':
            return <Mic className="h-4 w-4 text-emerald-500" />;
        case 'file':
            return <FileText className="h-4 w-4 text-orange-500" />;
        case 'poll':
            return <BarChart3 className="h-4 w-4 text-pink-500" />;
        case 'location':
            return <MapPin className="h-4 w-4 text-red-500" />;
        case 'contact':
            return <UserIcon className="h-4 w-4 text-cyan-500" />;
        default:
            return <Pin className="h-4 w-4 text-tg-primary" />;
    }
}

interface PinnedMessagesPanelProps {
    open: boolean;
    pinnedMessages: Message[];
    onClose: () => void;
    onJumpToMessage: (messageId: string) => void;
    onUnpin?: (message: Message) => void;
    onUnpinAll?: () => void;
    canUnpin?: boolean;
    inline?: boolean;
}

export function PinnedMessagesPanel({
    open,
    pinnedMessages,
    onClose,
    onJumpToMessage,
    onUnpin,
    onUnpinAll,
    canUnpin,
    inline,
}: PinnedMessagesPanelProps) {
    useEffect(() => {
        if (!open) return;

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const { mounted, className: panelAnimClass } = useAnimatedMount(open, ANIM_PIN_PANEL);

    if (!open && !mounted) return null;

    const total = pinnedMessages.length;

    const content = (
        <div className={`flex h-full flex-col overflow-hidden ${inline ? panelAnimClass : 'animate-pin-panel-in'}`}>
            <div className="flex items-center justify-between border-b border-tg-divider px-4 py-3">
                <div className="flex items-center gap-2">
                    <Pin className="h-4 w-4 text-tg-primary" />
                    <div>
                        <div className="text-sm font-semibold text-tg-text">Закрепленные сообщения</div>
                        <div className="text-[11px] text-tg-text-secondary">{total} шт.</div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {canUnpin && onUnpinAll && total > 0 && (
                        <button
                            onClick={() => onUnpinAll()}
                            className="rounded-full bg-muted px-2.5 py-1 text-xs text-tg-text-secondary transition-colors hover:bg-muted/70"
                        >
                            Открепить все
                        </button>
                    )}

                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-tg-text-secondary transition-colors hover:bg-muted"
                        title="Закрыть"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {total === 0 ? (
                    <div className="px-4 py-6 text-sm text-tg-text-secondary">Нет закрепленных сообщений</div>
                ) : (
                    pinnedMessages.map((message, index) => (
                        <button
                            key={message.id}
                            className="flex w-full items-start gap-3 border-b border-tg-divider/60 px-4 py-3 text-left transition-colors hover:bg-tg-hover animate-pin-item-in"
                            style={{ animationDelay: `${index * 25}ms` }}
                            onClick={() => {
                                onJumpToMessage(message.id);
                                onClose();
                            }}
                        >
                            <div className="mt-0.5 shrink-0">{getTypeIcon(message.type)}</div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-[11px] text-tg-text-secondary">
                                    <span className="font-medium text-tg-primary">{getSenderName(message)}</span>
                                    <span>-</span>
                                    <span>{new Date(message.timestamp).toLocaleDateString('ru-RU')}</span>
                                    <span>{new Date(message.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="mt-0.5 truncate text-sm text-tg-text">{getPreview(message)}</div>
                            </div>

                            {canUnpin && onUnpin && (
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onUnpin(message);
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-full text-tg-text-secondary transition-colors hover:bg-muted"
                                    title="Открепить"
                                >
                                    <PinOff className="h-4 w-4" />
                                </button>
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>
    );

    if (inline) {
        return content;
    }

    return (
        <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
            <SheetContent
                side="right"
                className="w-full max-w-[420px] overflow-hidden p-0 sm:w-[360px]"
                aria-describedby={undefined}
            >
                <SheetTitle className="sr-only">Закрепленные сообщения</SheetTitle>
                {content}
            </SheetContent>
        </Sheet>
    );
}
