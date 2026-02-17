
import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, CheckCheck, Edit2, Play, Pause } from 'lucide-react';
import type { Message } from '@/types';
import { CachedImage } from '@/components/media/CachedImage';
import { MediaViewer, type MediaItem } from '@/components/media/MediaViewer';
import { useSettingsStore } from '@/stores/settingsStore';

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

/** Parse inline `code` within a text segment */
function parseInlineCode(text: string, keyOffset: number): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    const inlineRegex = /`([^`]+)`/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = inlineRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
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
        parts.push(text.slice(lastIndex));
    }

    return parts;
}

function VoicePlayer({ src }: { src: string }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onMeta = () => setDuration(audio.duration || 0);
        const onTime = () => setCurrentTime(audio.currentTime);
        const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };
        audio.addEventListener('loadedmetadata', onMeta);
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('ended', onEnd);
        return () => {
            audio.removeEventListener('loadedmetadata', onMeta);
            audio.removeEventListener('timeupdate', onTime);
            audio.removeEventListener('ended', onEnd);
        };
    }, []);

    const toggle = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * duration;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const fmt = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-2.5 min-w-[180px] w-full">
            <audio ref={audioRef} src={src} preload="metadata" />
            <button
                onClick={toggle}
                className="h-9 w-9 shrink-0 rounded-full bg-tg-primary text-white flex items-center justify-center hover:opacity-90 transition-opacity active:scale-95"
            >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <div className="flex-1 flex flex-col gap-1 min-w-0">
                <div
                    className="h-1.5 rounded-full bg-black/10 dark:bg-white/15 cursor-pointer relative overflow-hidden"
                    onClick={handleSeek}
                >
                    <div
                        className="h-full rounded-full bg-tg-primary transition-[width] duration-100"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <span className="text-[10px] text-tg-text-secondary tabular-nums leading-none">
                    {fmt(currentTime)} / {fmt(duration)}
                </span>
            </div>
        </div>
    );
}

interface MessageBubbleProps {
    message: Message;
    isMe: boolean;
    showTail?: boolean;
    showSenderName?: boolean;
    onContextMenu?: (e: React.MouseEvent, message: Message) => void;
    onReactionClick?: (messageId: string, emoji: string) => void;
    /** All media items in this chat, for gallery navigation */
    mediaItems?: MediaItem[];
}

export function MessageBubble({ message, isMe, showTail = true, showSenderName, onContextMenu, onReactionClick, mediaItems }: MessageBubbleProps) {
    const [viewerOpen, setViewerOpen] = useState(false);
    const time = format(new Date(message.timestamp), 'HH:mm');
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { appearance } = useSettingsStore();

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
            ? 'message-bubble-tail-out rounded-tr-sm'
            : 'message-bubble-tail-in rounded-tl-sm'
        : '';

    const hasMedia = (message.type === 'image' || message.type === 'video') && message.mediaUrl;
    const isVoice = message.type === 'voice' && message.mediaUrl;
    const isSticker = message.type === 'sticker';

    return (
        <div className={cn("flex flex-col max-w-[85%] sm:max-w-[75%] md:max-w-[65%]", isMe ? "items-end" : "items-start")}>
            <div
                className={cn(
                    'group relative min-w-[60px] shadow-sm leading-relaxed transition-all duration-200 hover:brightness-[0.97]',
                    tailClass,
                    showTail ? 'mb-0.5' : 'mb-px',
                    isSticker ? 'bg-transparent shadow-none p-0'
                        : compactMode ? 'px-2 py-1' : 'px-2.5 py-1.5'
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
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchEnd}
            >
                <div className="flex flex-col">
                    {/* Sender name in group chats */}
                    {showSenderName && (
                        <div className="text-xs font-medium text-tg-primary mb-0.5 leading-tight">
                            {message.sender?.firstName || message.sender?.username || 'User'}
                        </div>
                    )}

                    {/* Reply Context */}
                    {message.replyToMessage && (
                        <div className="mb-1 border-l-2 border-tg-primary pl-2 text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-r p-1">
                            <div className="font-medium text-tg-primary leading-tight">
                                {(message.replyToMessage as Message & { senderName?: string }).senderName || (message.replyToMessage.senderId === message.senderId ? 'Вы' : 'User')}
                            </div>
                            <div className="truncate text-tg-text-secondary leading-tight">{message.replyToMessage.content}</div>
                        </div>
                    )}

                    {/* Voice */}
                    {isVoice && (
                        <VoicePlayer src={message.mediaUrl!} />
                    )}

                    {/* Image */}
                    {message.type === 'image' && message.mediaUrl && (
                        <div
                            className="-mx-2.5 -mt-1.5 mb-1 overflow-hidden rounded-t-[var(--message-border-radius,12px)] cursor-pointer first:rounded-t-[var(--message-border-radius,12px)]"
                            onClick={() => setViewerOpen(true)}
                        >
                            <CachedImage
                                src={message.mediaUrl}
                                fileId={message.id}
                                alt="Media"
                                className="max-h-[300px] w-full object-contain"
                            />
                        </div>
                    )}

                    {/* Video */}
                    {message.type === 'video' && message.mediaUrl && (
                        <div
                            className="-mx-2.5 -mt-1.5 mb-1 overflow-hidden rounded-t-[var(--message-border-radius,12px)] cursor-pointer relative"
                            onClick={() => setViewerOpen(true)}
                        >
                            <video
                                src={message.mediaUrl}
                                className="max-h-[300px] w-full object-contain"
                                preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <div className="bg-black/50 rounded-full p-3">
                                    <Play className="h-6 w-6 text-white fill-white" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Text */}
                    {!isSticker && message.content && (
                        <div className="whitespace-pre-wrap break-words select-text cursor-text">
                            {parseMessageContent(message.content)}
                            {showTimeStamps && <span className="inline-block w-[68px]" />}
                        </div>
                    )}

                    {/* Sticker */}
                    {isSticker && message.mediaUrl && (
                        <img src={message.mediaUrl} alt="Sticker" className="h-32 w-32 object-contain" />
                    )}
                </div>

                {/* Meta: Time & Status */}
                {showTimeStamps && (
                    <div className={cn(
                        "flex items-center gap-1 text-[11px] select-none leading-none",
                        isSticker && "bg-black/30 text-white rounded px-1 py-0.5 mt-1",
                        !isSticker && message.content && "float-right relative -mt-4 ml-2 text-tg-text-secondary",
                        !isSticker && !message.content && "flex justify-end mt-1 text-tg-text-secondary"
                    )}>
                        {message.isEdited && <Edit2 className="h-3 w-3 opacity-70" />}
                        <span>{time}</span>
                        {isMe && !isSticker && (
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
                )}
            </div>

            {/* Reaction Pills */}
            {message.reactions && message.reactions.length > 0 && (
                <div className={cn("flex flex-wrap gap-1 mt-0.5", isMe ? "justify-end" : "justify-start")}>
                    {message.reactions.map((reaction) => (
                        <button
                            key={reaction.emoji}
                            onClick={() => onReactionClick?.(message.id, reaction.emoji)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-xs transition-colors"
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
}
