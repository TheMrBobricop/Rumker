
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, CheckCheck, Edit2 } from 'lucide-react';
import type { Message } from '@/types';
import { CachedImage } from '@/components/media/CachedImage';

interface MessageBubbleProps {
    message: Message;
    isMe: boolean;
    showTail?: boolean;
}

export function MessageBubble({ message, isMe, showTail = true }: MessageBubbleProps) {
    const time = format(new Date(message.timestamp), 'HH:mm');

    // Определяем классы для входящих/исходящих
    const bubbleClass = isMe
        ? 'bg-tg-message-out text-tg-text self-end'
        : 'bg-tg-message-in text-tg-text self-start';

    const tailClass = showTail
        ? isMe
            ? 'message-bubble-tail-out rounded-tr-sm'
            : 'message-bubble-tail-in rounded-tl-sm'
        : '';

    return (
        <div
            className={cn(
                'group relative max-w-[80%] min-w-[60px] shadow-sm px-3 py-2 leading-relaxed transition-all hover:brightness-95',
                bubbleClass,
                tailClass,
                !showTail && 'mb-1',
                message.type === 'sticker' && 'bg-transparent shadow-none p-0'
            )}
            style={{
                borderRadius: message.type === 'sticker' ? undefined : `var(--message-border-radius, 12px)`,
                fontSize: `var(--message-font-size, 14px)`,
            }}
        >
            {/* Content Renderer */}
            <div className="flex flex-col">
                {/* Reply Context */}
                {message.replyToMessage && (
                    <div className="mb-1 border-l-2 border-tg-primary pl-2 text-xs text-tg-primary cursor-pointer hover:bg-black/5 rounded-r p-1">
                        <div className="font-medium text-tg-primary">{message.replyToMessage.senderId === message.senderId ? 'Вы' : 'User'}</div>
                        <div className="truncate text-tg-text-secondary">{message.replyToMessage.content}</div>
                    </div>
                )}

                {/* Media */}
                {(message.type === 'image' || message.type === 'video') && message.mediaUrl && (
                    <div className="mb-1 overflow-hidden rounded-lg">
                        <CachedImage
                            src={message.mediaUrl}
                            fileId={message.id} // Assuming fileId matches msgId for simplicity or stored in metadata
                            alt="Media"
                            className="max-h-[300px] w-full object-cover"
                        />
                    </div>
                )}

                {/* Text */}
                {message.type !== 'sticker' && (
                    <span className="whitespace-pre-wrap break-words pr-8">
                        {message.content}
                    </span>
                )}

                {/* Sticker */}
                {message.type === 'sticker' && message.mediaUrl && (
                    <img src={message.mediaUrl} alt="Sticker" className="h-32 w-32 object-contain" />
                )}
            </div>

            {/* Meta: Time & Status */}
            <div className={cn(
                "absolute bottom-1 right-2 flex items-center gap-1 text-[11px] text-tg-text-secondary select-none",
                message.type === 'sticker' && "bg-black/30 text-white rounded px-1" // Better visibility on stickers
            )}>
                {message.isEdited && <Edit2 className="h-3 w-3 opacity-70" />}
                <span>{time}</span>

                {isMe && message.type !== 'sticker' && (
                    <span className={cn(
                        message.status === 'read' ? 'text-tg-primary' : 'text-tg-text-secondary'
                    )}>
                        {message.status === 'read' ? (
                            <CheckCheck className="h-3 w-3" />
                        ) : (
                            <Check className="h-3 w-3" />
                        )}
                    </span>
                )}
            </div>
        </div>
    );
}
