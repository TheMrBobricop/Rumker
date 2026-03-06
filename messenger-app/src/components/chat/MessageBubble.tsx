
import { useState, useRef, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, CheckCheck, Edit2, Clock, AlertCircle, Forward } from 'lucide-react';
import type { Message } from '@/types';
import { CachedImage } from '@/components/media/CachedImage';
import { MediaViewer, type MediaItem } from '@/components/media/MediaViewer';
import { WaveformPlayer } from '@/components/media/WaveformPlayer';
import { VideoThumbnail } from '@/components/media/VideoThumbnail';
import { PollBubble } from './PollBubble';
import { LocationBubble } from './LocationBubble';
import { ContactBubble } from './ContactBubble';
import { useSettingsStore } from '@/stores/settingsStore';
import { getUserColor } from '@/lib/userColors';

/** Parse message text into segments: plain text, fenced code blocks, inline code */
function parseMessageContent(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    // Split by fenced code blocks: ```lang\n...\n```
    const fencedRegex = /```(\w*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = fencedRegex.exec(text)) !== null) {
        // Text before the code block
        if (match.index > lastIndex) {
            parts.push(...parseInlineCode(text.slice(lastIndex, match.index), parts.length));
        }

        const lang = match[1];
        const code = match[2].replace(/\n$/, '');
        parts.push(
            <div key={`code-${parts.length}`} className="my-1.5 -mx-1 rounded-lg overflow-hidden">
                {lang && (
                    <div className="flex items-center justify-between bg-[#1e1e2e] px-3 py-1 text-[10px] text-gray-400 font-mono uppercase tracking-wider">
                        <span>{lang}</span>
                    </div>
                )}
                <pre className="bg-[#1e1e2e] text-[#cdd6f4] p-3 overflow-x-auto text-[13px] leading-relaxed scrollbar-thin">
                    <code>{code}</code>
                </pre>
            </div>
        );
        lastIndex = match.index + match[0].length;
    }

    // Remaining text
    if (lastIndex < text.length) {
        parts.push(...parseInlineCode(text.slice(lastIndex), parts.length));
    }

    return parts;
}

/** Extract YouTube video ID from a URL */
function extractYouTubeId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const m = url.match(pattern);
        if (m) return m[1];
    }
    return null;
}

/** Parse @mentions in plain text */
function parseMentions(text: string, keyOffset: number): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    const mentionRegex = /@(\w+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        parts.push(
            <span
                key={`mention-${keyOffset}-${parts.length}`}
                className="text-tg-primary font-medium bg-tg-primary/10 px-0.5 rounded cursor-pointer hover:bg-tg-primary/20"
            >
                @{match[1]}
            </span>
        );
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
}

/** Parse URLs in plain text into clickable links + YouTube embeds */
function parseUrls(text: string, keyOffset: number): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(...parseMentions(text.slice(lastIndex, match.index), keyOffset + parts.length));
        }

        const url = match[0];
        const ytId = extractYouTubeId(url);

        parts.push(
            <a
                key={`url-${keyOffset}-${parts.length}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-tg-primary underline underline-offset-2 hover:brightness-110 break-all"
                onClick={(e) => e.stopPropagation()}
            >
                {url}
            </a>
        );

        // YouTube embed
        if (ytId) {
            parts.push(
                <div key={`yt-${keyOffset}-${parts.length}`} className="my-1.5 -mx-1 rounded-lg overflow-hidden">
                    <iframe
                        src={`https://www.youtube.com/embed/${ytId}`}
                        className="w-full aspect-video rounded-lg"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="YouTube video"
                    />
                </div>
            );
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(...parseMentions(text.slice(lastIndex), keyOffset + parts.length));
    }

    return parts;
}

/** Parse inline `code` within a text segment */
function parseInlineCode(text: string, keyOffset: number): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    const inlineRegex = /`([^`]+)`/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = inlineRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(...parseUrls(text.slice(lastIndex, match.index), keyOffset + parts.length));
        }
        parts.push(
            <code
                key={`inline-${keyOffset}-${parts.length}`}
                className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-[13px] font-mono"
            >
                {match[1]}
            </code>
        );
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(...parseUrls(text.slice(lastIndex), keyOffset + parts.length));
    }

    return parts;
}

interface MessageBubbleProps {
    message: Message;
    isMe: boolean;
    showTail?: boolean;
    showSenderName?: boolean;
    onContextMenu?: (e: React.MouseEvent, message: Message) => void;
    onReactionClick?: (messageId: string, emoji: string) => void;
    onDoubleClick?: (message: Message) => void;
    onScrollToMessage?: (messageId: string) => void;
    /** All media items in this chat, for gallery navigation */
    mediaItems?: MediaItem[];
    /** Custom admin title for sender */
    senderTitle?: string;
    /** Role of the sender (owner/admin/member) */
    senderRole?: string;
}

export const MessageBubble = memo(function MessageBubble({ message, isMe, showTail = true, showSenderName, onContextMenu, onReactionClick, onDoubleClick, onScrollToMessage, mediaItems, senderTitle, senderRole: _senderRole }: MessageBubbleProps) {
    const [viewerOpen, setViewerOpen] = useState(false);
    const time = format(new Date(message.timestamp), 'HH:mm');
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const appearance = useSettingsStore((s) => s.appearance);
    // Local profile override for sender name
    const localOverride = useSettingsStore((s) => s.localProfileOverrides[message.senderId]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        longPressTimer.current = setTimeout(() => {
            if (onContextMenu) {
                const touch = e.touches[0];
                const syntheticEvent = {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    preventDefault: () => {},
                } as React.MouseEvent;
                onContextMenu(syntheticEvent, message);
            }
        }, 500);
    }, [onContextMenu, message]);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const customBgColor = isMe
        ? appearance.messageBubbles.outgoingColor
        : appearance.messageBubbles.incomingColor;

    const customTextColor = isMe
        ? appearance.messageBubbles.outgoingTextColor
        : appearance.messageBubbles.incomingTextColor;

    const showTimeStamps = appearance.showTimeStamps ?? true;
    const compactMode = appearance.compactMode ?? false;
    const showTails = appearance.showTails ?? true;
    const tailClass = showTail && showTails
        ? isMe
            ? 'message-bubble-tail-out rounded-br-none'
            : 'message-bubble-tail-in rounded-bl-none'
        : '';

    const hasMedia = (message.type === 'image' || message.type === 'video') && message.mediaUrl;
    const isVoice = message.type === 'voice' && message.mediaUrl;
    const isSticker = message.type === 'sticker';
    const isGif = message.type === 'image' && message.mediaUrl && (
        message.mediaUrl.includes('tenor.com') ||
        message.mediaUrl.includes('.gif') ||
        message.mediaUrl.includes('giphy.com')
    );

    return (
        <div className={cn("flex flex-col min-w-0 max-w-[85%] sm:max-w-[75%] md:max-w-[55%]", isMe ? "items-end" : "items-start")}>
            <div
                className={cn(
                    'group relative min-w-[60px] shadow-sm leading-[1.3] transition-[colors,shadow,transform] duration-150 hover:shadow-md active:scale-[0.99] overflow-hidden',
                    tailClass,
                    showTail ? 'mb-0.5' : 'mb-px',
                    isSticker ? 'bg-transparent shadow-none p-0'
                        : compactMode ? 'px-2 py-[4px]' : 'px-[8px] py-[5px]'
                )}
                style={{
                    borderRadius: isSticker ? undefined : `var(--message-border-radius, 12px)`,
                    fontSize: `var(--message-font-size, 14px)`,
                    backgroundColor: isSticker ? undefined : customBgColor,
                    color: isSticker ? undefined : customTextColor,
                    '--bubble-color': customBgColor,
                } as React.CSSProperties}
                onContextMenu={(e) => {
                    if (onContextMenu) {
                        e.preventDefault();
                        onContextMenu(e, message);
                    }
                }}
                onDoubleClick={(e) => {
                    if (onDoubleClick) {
                        e.preventDefault();
                        onDoubleClick(message);
                    }
                }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchEnd}
            >
                <div className="flex flex-col">
                    {/* Sender name + custom title in group chats */}
                    {showSenderName && (
                        <div className="flex items-center gap-1.5 mb-0.5 leading-tight">
                            <span className="text-xs font-medium" style={{ color: getUserColor(message.senderId) }}>
                                {localOverride?.nickname || message.sender?.firstName || message.sender?.username || 'User'}
                            </span>
                            {senderTitle && (
                                <span className="text-[10px] text-muted-foreground font-normal">{senderTitle}</span>
                            )}
                        </div>
                    )}

                    {/* Forwarded From Header */}
                    {message.forwardedFrom && (
                        <div className="flex items-center gap-1.5 mb-1 text-xs" style={{ color: getUserColor(message.forwardedFrom.id || message.forwardedFrom.name) }}>
                            <Forward className="h-3 w-3" />
                            <span className="font-medium">Переслано от {message.forwardedFrom.name}</span>
                        </div>
                    )}

                    {/* Reply Context */}
                    {message.replyToMessage && (() => {
                        const replyColor = getUserColor(message.replyToMessage.senderId);
                        return (
                            <div
                                className="mb-1 border-l-2 pl-2 text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-r p-1 active:bg-black/10 dark:active:bg-white/10 transition-colors"
                                style={{ borderLeftColor: replyColor }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onScrollToMessage?.(message.replyToMessage!.id);
                                }}
                            >
                                <div className="font-medium leading-tight" style={{ color: replyColor }}>
                                    {(message.replyToMessage as Message & { senderName?: string }).senderName || (message.replyToMessage.senderId === message.senderId ? 'Вы' : 'User')}
                                </div>
                                <div className="truncate text-tg-text-secondary leading-tight">{message.replyToMessage.content}</div>
                            </div>
                        );
                    })()}

                    {/* Voice — WaveformPlayer */}
                    {isVoice && (
                        <WaveformPlayer src={message.mediaUrl!} messageId={message.id} isMe={isMe} />
                    )}

                    {/* Image */}
                    {message.type === 'image' && message.mediaUrl && (
                        <div
                            className="relative -mx-[9px] -mt-[6px] mb-1 overflow-hidden cursor-pointer bg-black/5 dark:bg-white/5"
                            onClick={() => setViewerOpen(true)}
                        >
                            <CachedImage
                                src={message.mediaUrl}
                                fileId={message.id}
                                alt="Media"
                                style={{ maxHeight: 'min(400px, 70vh)', maxWidth: '100%', display: 'block', margin: '0 auto' }}
                            />
                            {isGif && (
                                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    GIF
                                </div>
                            )}
                        </div>
                    )}

                    {/* Video — VideoThumbnail */}
                    {message.type === 'video' && message.mediaUrl && (
                        <VideoThumbnail
                            src={message.mediaUrl}
                            onOpenViewer={() => setViewerOpen(true)}
                        />
                    )}

                    {/* Poll */}
                    {message.type === 'poll' && message.pollData && (
                        <PollBubble pollData={message.pollData} isMe={isMe} />
                    )}

                    {/* Location */}
                    {message.type === 'location' && message.locationData && (
                        <LocationBubble locationData={message.locationData} />
                    )}

                    {/* Contact */}
                    {message.type === 'contact' && message.contactData && (
                        <ContactBubble contactData={message.contactData} />
                    )}

                    {/* Text content with spacer for time */}
                    {!isSticker && message.type !== 'poll' && message.type !== 'location' && message.type !== 'contact' && message.content && (
                        <div className="whitespace-pre-wrap break-words select-text cursor-text">
                            {parseMessageContent(message.content)}
                            {showTimeStamps && <span className="inline-block w-[58px]" />}
                        </div>
                    )}

                    {/* Sticker */}
                    {isSticker && message.mediaUrl && (
                        <img src={message.mediaUrl} alt="Sticker" className="h-32 w-32 object-contain" />
                    )}

                    {/* Sticker — emoji-only (no mediaUrl) */}
                    {isSticker && !message.mediaUrl && message.content && (
                        <span className="text-7xl leading-none">{message.content}</span>
                    )}
                </div>

                {/* Absolute time overlay for text messages (Telegram-style bottom-right) */}
                {showTimeStamps && !isSticker && message.content && message.type !== 'poll' && message.type !== 'location' && message.type !== 'contact' && (
                    <span
                        className="absolute bottom-[5px] right-[8px] flex items-center gap-1 text-[11px] select-none leading-none whitespace-nowrap pointer-events-none"
                        style={{ color: isMe ? undefined : 'var(--tg-text-secondary)' }}
                    >
                        {message.isEdited && <Edit2 className={cn("h-3 w-3", isMe ? "opacity-[0.55]" : "opacity-70")} />}
                        <span className={isMe ? "opacity-[0.55]" : ""}>{time}</span>
                        {isMe && (
                            <span className={cn(
                                "transition-colors duration-300",
                                message.status === 'read' ? 'text-tg-primary'
                                    : message.status === 'error' ? 'text-red-500'
                                    : 'opacity-[0.55]'
                            )}>
                                {message.status === 'sending' ? (
                                    <Clock className="h-3 w-3 animate-pulse" />
                                ) : message.status === 'error' ? (
                                    <AlertCircle className="h-3 w-3" />
                                ) : message.status === 'read' ? (
                                    <CheckCheck className="h-3 w-3" />
                                ) : (
                                    <Check className="h-3 w-3" />
                                )}
                            </span>
                        )}
                    </span>
                )}

                {/* Time for non-text messages (media only, stickers, polls, etc.) */}
                {showTimeStamps && (isSticker || !message.content || message.type === 'poll' || message.type === 'location' || message.type === 'contact') && (
                    <div className={cn(
                        "flex items-center gap-1 text-[11px] select-none leading-none",
                        isSticker && "bg-black/30 text-white rounded px-1 py-0.5 mt-1",
                        !isSticker && "flex justify-end mt-0.5 text-tg-text-secondary"
                    )}>
                        {message.isEdited && <Edit2 className="h-3 w-3 opacity-70" />}
                        <span>{time}</span>
                        {isMe && !isSticker && (
                            <span className={cn(
                                "transition-colors duration-300",
                                message.status === 'read' ? 'text-tg-primary'
                                    : message.status === 'error' ? 'text-red-500'
                                    : 'text-tg-text-secondary'
                            )}>
                                {message.status === 'sending' ? (
                                    <Clock className="h-3 w-3 animate-pulse" />
                                ) : message.status === 'error' ? (
                                    <AlertCircle className="h-3 w-3" />
                                ) : message.status === 'read' ? (
                                    <CheckCheck className="h-3 w-3" />
                                ) : (
                                    <Check className="h-3 w-3" />
                                )}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Reaction Pills */}
            {message.reactions && message.reactions.length > 0 && (
                <div className={cn("flex flex-wrap gap-1 mt-0.5", isMe ? "justify-end" : "justify-start")}>
                    {message.reactions.map((reaction, i) => (
                        <button
                            key={reaction.emoji}
                            onClick={() => onReactionClick?.(message.id, reaction.emoji)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-xs transition-colors animate-reaction-pop"
                            style={{ animationDelay: `${i * 30}ms` }}
                        >
                            <span>{reaction.emoji}</span>
                            <span className="text-tg-text-secondary">{reaction.userIds.length}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Media Viewer */}
            {hasMedia && (
                <MediaViewer
                    isOpen={viewerOpen}
                    onClose={() => setViewerOpen(false)}
                    src={message.mediaUrl}
                    fileId={message.id}
                    type={message.type as 'image' | 'video'}
                    mediaItems={mediaItems}
                    currentIndex={mediaItems?.findIndex(m => m.id === message.id)}
                />
            )}
        </div>
    );
});
