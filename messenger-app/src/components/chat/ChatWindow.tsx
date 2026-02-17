
import { useEffect, useRef, useState, useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from 'sonner';
import { Search, MoreVertical, ArrowLeft, Phone, MessageSquare, Image, ChevronDown, X, Copy, Trash2, Forward, Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { MessageContextMenu } from './MessageContextMenu';
import { UserProfilePanel } from '@/components/users/UserProfilePanel';
import { uploadChatFile, markMessagesRead } from '@/lib/api/chats';
import { socketService } from '@/lib/socket';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import type { EditingMessage } from './MessageInput';
import type { MediaItem } from '@/components/media/MediaViewer';

interface ChatWindowProps {
    onBack?: () => void;
}

interface ContextMenuState {
    messageId: string;
    message: Message;
    x: number;
    y: number;
}

export function ChatWindow({ onBack }: ChatWindowProps) {
    const { activeChat, messages, loadMessages, loadMoreMessages, sendMessage, editMessageApi, deleteMessageApi, isLoadingMessages, isLoadingMore, hasMore, typingUsers, toggleReaction, clearUnread } = useChatStore();
    const currentUser = useAuthStore((s) => s.user);
    const { appearance } = useSettingsStore();

    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const [resetUploaderKey, setResetUploaderKey] = useState(0);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [profileOpen, setProfileOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [editingMessage, setEditingMessage] = useState<EditingMessage | null>(null);
    const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);

    // Scroll-to-bottom
    const [showScrollDown, setShowScrollDown] = useState(false);

    // Selection mode
    const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
    const selectionMode = selectedMessages.size > 0;
    const dragSelectingRef = useRef(false);
    const lastDragMsgRef = useRef<string | null>(null);
    const justEnteredSelectionRef = useRef(false);

    // Drag-and-drop files
    const [isDragging, setIsDragging] = useState(false);
    const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
    const dragCounter = useRef(0);

    // Socket: join/leave chat rooms, mark as read
    const prevActiveChatRef = useRef<string | null>(null);
    useEffect(() => {
        const prevId = prevActiveChatRef.current;
        const newId = activeChat?.id ?? null;

        if (prevId && prevId !== newId) {
            socketService.leaveChat(prevId);
        }
        if (newId && newId !== prevId) {
            socketService.joinChat(newId);
        }
        prevActiveChatRef.current = newId;

        if (activeChat) {
            loadMessages(activeChat.id);
            clearUnread(activeChat.id);
        }
    }, [activeChat, loadMessages, clearUnread]);

    // Mark last message as read when messages change
    useEffect(() => {
        if (!activeChat) return;
        const chatMessages = messages[activeChat.id];
        if (chatMessages && chatMessages.length > 0) {
            const lastMsg = chatMessages[chatMessages.length - 1];
            if (lastMsg.senderId !== currentUser?.id) {
                markMessagesRead(activeChat.id, lastMsg.id).catch(() => {});
                socketService.markRead(activeChat.id, lastMsg.id);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChat?.id, messages[activeChat?.id ?? '']?.length]);

    // Typing debounce
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleTyping = useCallback(() => {
        if (!activeChat) return;
        socketService.startTyping(activeChat.id);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            socketService.stopTyping(activeChat.id);
        }, 2000);
    }, [activeChat]);

    // Infinite scroll: IntersectionObserver at top
    const topSentinelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!activeChat) return;
        const sentinel = topSentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore[activeChat.id] && !isLoadingMore) {
                    loadMoreMessages(activeChat.id);
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [activeChat, hasMore, isLoadingMore, loadMoreMessages]);

    // Track scroll position for scroll-to-bottom button
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handleScroll = () => {
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            setShowScrollDown(distanceFromBottom > 300);
        };
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [activeChat?.id]);

    const scrollToBottom = useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, activeChat?.id]);

    // Clear selection on chat change
    const [prevChatId, setPrevChatId] = useState(activeChat?.id);
    if (prevChatId !== activeChat?.id) {
        setPrevChatId(activeChat?.id);
        if (contextMenu) setContextMenu(null);
        if (replyToMessage) setReplyToMessage(null);
        if (editingMessage) setEditingMessage(null);
        if (selectedMessages.size > 0) setSelectedMessages(new Set());
    }

    // ESC to exit selection mode
    useEffect(() => {
        if (!selectionMode) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedMessages(new Set());
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectionMode]);

    // Global mouseup to stop drag selection + long press
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressTargetRef = useRef<string | null>(null);

    useEffect(() => {
        const handleMouseUp = () => {
            dragSelectingRef.current = false;
            lastDragMsgRef.current = null;
            // Clear long press timer
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
            longPressTargetRef.current = null;
        };
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchend', handleMouseUp);
        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, []);

    // --- Selection handlers ---
    const handleToggleSelect = useCallback((msgId: string) => {
        setSelectedMessages(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) {
                next.delete(msgId);
            } else {
                next.add(msgId);
            }
            return next;
        });
    }, []);

    const handleSelectFromMenu = useCallback((message: Message) => {
        setSelectedMessages(new Set([message.id]));
    }, []);

    const handleClearSelection = useCallback(() => {
        setSelectedMessages(new Set());
    }, []);

    const handleCopySelected = useCallback(() => {
        if (!activeChat) return;
        const chatMessages = messages[activeChat.id] || [];
        const selected = chatMessages.filter(m => selectedMessages.has(m.id));
        const text = selected.map(m => m.content).filter(Boolean).join('\n');
        navigator.clipboard.writeText(text);
        toast.success('Скопировано');
        setSelectedMessages(new Set());
    }, [activeChat, messages, selectedMessages]);

    const handleDeleteSelected = useCallback(async () => {
        if (!activeChat) return;
        const ids = Array.from(selectedMessages);
        try {
            for (const id of ids) {
                await deleteMessageApi(activeChat.id, id);
            }
            toast.success(`Удалено: ${ids.length}`);
        } catch {
            toast.error('Не удалось удалить');
        }
        setSelectedMessages(new Set());
    }, [activeChat, selectedMessages, deleteMessageApi]);

    // Long-press + drag selection: mousedown on message
    const handleMsgMouseDown = useCallback((msgId: string) => {
        if (selectionMode) {
            // Already in selection mode — start drag immediately
            dragSelectingRef.current = true;
            lastDragMsgRef.current = msgId;
            handleToggleSelect(msgId);
            return;
        }

        // Not in selection mode — start long-press timer (400ms)
        longPressTargetRef.current = msgId;
        longPressTimerRef.current = setTimeout(() => {
            // Enter selection mode with this message
            setSelectedMessages(new Set([msgId]));
            dragSelectingRef.current = true;
            lastDragMsgRef.current = msgId;
            longPressTimerRef.current = null;
            justEnteredSelectionRef.current = true;
        }, 400);
    }, [selectionMode, handleToggleSelect]);

    // Cancel long-press if mouse moves to different message (= normal interaction)
    const handleMsgMouseEnter = useCallback((msgId: string) => {
        // If we have a long-press timer and mouse moved, cancel it
        if (longPressTimerRef.current && longPressTargetRef.current !== msgId) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        // Drag selection: add message when dragging over it
        if (dragSelectingRef.current && selectionMode) {
            if (lastDragMsgRef.current === msgId) return;
            lastDragMsgRef.current = msgId;
            setSelectedMessages(prev => {
                const next = new Set(prev);
                next.add(msgId);
                return next;
            });
        }
    }, [selectionMode]);

    // --- Context menu handlers ---
    const handleContextMenu = useCallback((e: React.MouseEvent, message: Message) => {
        if (selectionMode) {
            // In selection mode, toggle selection instead of showing context menu
            handleToggleSelect(message.id);
            return;
        }
        setContextMenu({
            messageId: message.id,
            message,
            x: e.clientX,
            y: e.clientY,
        });
    }, [selectionMode, handleToggleSelect]);

    const handleReply = useCallback((message: Message) => {
        setReplyToMessage(message);
    }, []);

    const handleCopy = useCallback((message: Message) => {
        if (message.content) {
            navigator.clipboard.writeText(message.content);
            toast.success('Скопировано');
        }
    }, []);

    const handleEdit = useCallback((message: Message) => {
        if (!activeChat) return;
        setEditingMessage({
            id: message.id,
            chatId: activeChat.id,
            content: message.content,
        });
    }, [activeChat]);

    const handleDelete = useCallback(async (message: Message) => {
        if (!activeChat) return;
        try {
            await deleteMessageApi(activeChat.id, message.id);
            toast.success('Сообщение удалено');
        } catch {
            toast.error('Не удалось удалить сообщение');
        }
    }, [activeChat, deleteMessageApi]);

    const handleReaction = useCallback((message: Message, emoji: string) => {
        if (!activeChat || !currentUser) return;
        toggleReaction(activeChat.id, message.id, emoji, currentUser.id);
    }, [activeChat, currentUser, toggleReaction]);

    const handleEditMessage = useCallback(async (messageId: string, chatId: string, content: string) => {
        try {
            await editMessageApi(chatId, messageId, content);
        } catch {
            toast.error('Не удалось изменить сообщение');
        }
    }, [editMessageApi]);

    // ── Drag-and-drop file handlers ──

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current++;
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDragging(false);

        const mediaFiles = Array.from(e.dataTransfer.files).filter(
            (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
        );
        if (mediaFiles.length > 0) {
            setDroppedFiles(mediaFiles.slice(0, 10));
        }
    }, []);

    const handleDroppedFilesHandled = useCallback(() => setDroppedFiles([]), []);

    if (!activeChat) {
        return (
            <div className="flex h-full flex-col items-center justify-center bg-tg-bg/50 gap-4 px-8 text-center animate-fade-scale-in">
                <div className="h-16 w-16 rounded-full bg-tg-primary/10 flex items-center justify-center">
                    <MessageSquare className="h-8 w-8 text-tg-primary" />
                </div>
                <div>
                    <p className="text-base font-medium text-tg-text">Выберите чат</p>
                    <p className="text-sm text-tg-text-secondary mt-1">Выберите чат из списка или создайте новый</p>
                </div>
            </div>
        );
    }

    const chatMessages = messages[activeChat.id] || [];

    const handleAvatarClick = () => {
        if (selectionMode) return;
        if (activeChat.type === 'private') {
            const otherParticipant = activeChat.participants.find(
                (p) => p.userId !== currentUser?.id
            );
            if (otherParticipant) {
                setProfileUserId(otherParticipant.userId);
                setProfileOpen(true);
            }
        }
    };

    const handleSendVoice = async (blob: Blob) => {
        if (!activeChat) return;
        try {
            const file = new File([blob], 'voice.webm', { type: blob.type });
            const result = await uploadChatFile(file);
            await sendMessage(activeChat.id, '', 'voice', result.url);
        } catch (error) {
            console.error('Failed to send voice message:', error);
            toast.error('Не удалось отправить голосовое сообщение');
        }
    };

    const handleSendMessage = async (text: string, files: File[], _sendAsFile = false) => {
        if (!text.trim() && files.length === 0) return;

        const currentReplyToId = replyToMessage?.id;

        try {
            for (const file of files) {
                // Check video size limit (1 GB)
                if (file.type.startsWith('video/') && file.size > 1024 * 1024 * 1024) {
                    toast.error('Не удалось отправить видео больше 1 ГБ');
                    continue;
                }
                const result = await uploadChatFile(file);
                const type = file.type.startsWith('video/') ? 'video'
                    : file.type.startsWith('audio/') ? 'voice'
                    : 'image';
                await sendMessage(activeChat.id, '', type, result.url);
            }

            if (text.trim()) {
                await sendMessage(activeChat.id, text, undefined, undefined, currentReplyToId);
            }

            setReplyToMessage(null);
            setResetUploaderKey(prev => prev + 1);
        } catch (error) {
            console.error('Failed to send message:', error);
            toast.error('Не удалось отправить сообщение');
        }
    };

    const getInitials = (title: string) => title.slice(0, 2).toUpperCase();

    // Handle click on message row — only toggle in selection mode
    // Prevent click from firing after long-press enters selection mode
    const handleMessageRowClick = (msg: Message) => {
        if (justEnteredSelectionRef.current) {
            justEnteredSelectionRef.current = false;
            return; // Skip click that follows the long-press mouseup
        }
        if (selectionMode) {
            handleToggleSelect(msg.id);
        }
    };

    return (
        <div
            className="flex flex-col h-full bg-tg-bg relative overflow-hidden"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Selection Toolbar */}
            {selectionMode ? (
                <header className="flex h-14 items-center justify-between border-b border-tg-divider bg-tg-primary px-3 sm:px-4 text-white shrink-0 animate-fade-scale-in">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleClearSelection}
                            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        <span className="font-medium text-sm">{selectedMessages.size} выбрано</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleCopySelected}
                            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                            title="Копировать"
                        >
                            <Copy className="h-5 w-5" />
                        </button>
                        <button
                            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                            title="Переслать"
                        >
                            <Forward className="h-5 w-5" />
                        </button>
                        <button
                            onClick={handleDeleteSelected}
                            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-red-200"
                            title="Удалить"
                        >
                            <Trash2 className="h-5 w-5" />
                        </button>
                    </div>
                </header>
            ) : (
                /* Chat Header */
                <header className="flex h-14 items-center justify-between border-b border-tg-divider bg-tg-header px-2 sm:px-4 text-white shrink-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="md:hidden h-9 w-9 shrink-0 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                        )}

                        <Avatar
                            className="h-9 w-9 cursor-pointer hover:opacity-90 transition-opacity shrink-0"
                            onClick={handleAvatarClick}
                        >
                            <AvatarImage src={activeChat.avatar} />
                            <AvatarFallback className="bg-white/20 text-white text-sm">
                                {getInitials(activeChat.title || 'Chat')}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex flex-col cursor-pointer min-w-0" onClick={handleAvatarClick}>
                            <span className="font-medium leading-tight truncate text-sm">{activeChat.title}</span>
                            <span className="text-[11px] text-white/60 leading-tight">
                                {(() => {
                                    const chatTyping = typingUsers[activeChat.id];
                                    if (chatTyping && chatTyping.length > 0) {
                                        return <span className="text-green-300">печатает...</span>;
                                    }
                                    if (activeChat.type === 'private') {
                                        const other = activeChat.participants.find(p => p.userId !== currentUser?.id);
                                        if (other?.user?.isOnline) return 'в сети';
                                        if (other?.user?.lastSeen) {
                                            const d = new Date(other.user.lastSeen);
                                            const now = new Date();
                                            const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
                                            if (diffMin < 1) return 'был(а) только что';
                                            if (diffMin < 60) return `был(а) ${diffMin} мин. назад`;
                                            return `был(а) недавно`;
                                        }
                                        return 'был(а) недавно';
                                    }
                                    return `${activeChat.participants.length} участников`;
                                })()}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center shrink-0">
                        <button className="h-9 w-9 hidden sm:flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors">
                            <Search className="h-5 w-5" />
                        </button>
                        <button className="h-9 w-9 hidden sm:flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors">
                            <Phone className="h-5 w-5" />
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="h-9 w-9 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors">
                                    <MoreVertical className="h-5 w-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel>Действия</DropdownMenuLabel>
                                <DropdownMenuItem>Информация о группе</DropdownMenuItem>
                                <DropdownMenuItem>Поиск сообщений</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>Отключить уведомления</DropdownMenuItem>
                                <DropdownMenuItem className="text-red-500">Удалить чат</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>
            )}

            {/* Messages + Input area — both on top of background */}
            <div className="flex-1 relative overflow-hidden">
                {/* Background layer — stays fixed, never scrolls */}
                <div
                    className="absolute inset-0 pointer-events-none z-0"
                    style={{
                        ...(appearance.chatBackground.type === 'image' ? {
                            backgroundImage: `url(${appearance.chatBackground.value})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        } : appearance.chatBackground.type === 'gradient' ? {
                            background: appearance.chatBackground.value,
                        } : {
                            backgroundColor: appearance.chatBackground.value,
                        }),
                        opacity: appearance.chatBackground.opacity,
                        filter: (appearance.chatBackground.blur ?? 0) > 0
                            ? `blur(${appearance.chatBackground.blur}px)`
                            : undefined,
                    }}
                />

                {/* Content layer: messages + input */}
                <div className="absolute inset-0 z-10 flex flex-col">
                    {/* Scrollable messages */}
                    <div
                        className="flex-1 overflow-y-auto scrollbar-thin scroll-smooth"
                        ref={scrollRef}
                    >
                        <div className={cn("px-3 sm:px-4 py-3 min-h-full flex flex-col justify-end")}>
                            <div className={cn(
                                "flex flex-col min-h-full justify-end max-w-3xl mx-auto w-full",
                                appearance.compactMode ? "gap-px" : "gap-1"
                            )}>
                                {/* Sentinel for infinite scroll */}
                                <div ref={topSentinelRef} className="h-1" />

                                {(isLoadingMessages || isLoadingMore) && (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-primary"></div>
                                    </div>
                                )}

                                {!isLoadingMessages && chatMessages.length === 0 && (
                                    <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                                        Нет сообщений. Начните диалог!
                                    </div>
                                )}

                                {(() => {
                                    const mediaItems: MediaItem[] = chatMessages
                                        .filter((m) => (m.type === 'image' || m.type === 'video') && m.mediaUrl)
                                        .map((m) => ({ id: m.id, src: m.mediaUrl!, type: m.type as 'image' | 'video' }));

                                    return chatMessages.map((msg, index) => {
                                        const isMe = msg.senderId === currentUser?.id;
                                        const prevMsg = chatMessages[index - 1];
                                        const nextMsg = chatMessages[index + 1];
                                        const showTail = !nextMsg || nextMsg.senderId !== msg.senderId;
                                        const showAvatar = appearance.showAvatars
                                            && activeChat.type !== 'private'
                                            && !isMe
                                            && (!nextMsg || nextMsg.senderId !== msg.senderId);
                                        const showSenderName = activeChat.type !== 'private'
                                            && !isMe
                                            && (!prevMsg || prevMsg.senderId !== msg.senderId);
                                        const isSending = msg.status === 'sending';
                                        const isSelected = selectedMessages.has(msg.id);

                                        return (
                                            <div
                                                key={msg.id}
                                                className={cn(
                                                    "flex w-full items-center relative",
                                                    selectionMode && "cursor-pointer select-none",
                                                    !selectionMode && (isMe ? "justify-end" : "justify-start"),
                                                    isSending && !selectionMode ? "animate-msg-send" : (!selectionMode ? "animate-message-in" : ""),
                                                    msg.status === 'error' && "opacity-50"
                                                )}
                                                style={!isSending && !selectionMode ? { animationDelay: `${Math.min(index * 15, 300)}ms` } : undefined}
                                                onClick={() => handleMessageRowClick(msg)}
                                                onMouseDown={() => handleMsgMouseDown(msg.id)}
                                                onMouseEnter={() => handleMsgMouseEnter(msg.id)}
                                            >
                                                {/* Selection highlight overlay */}
                                                {isSelected && (
                                                    <div className="absolute inset-0 bg-tg-primary/10 rounded-lg pointer-events-none z-0 animate-selection-pop" />
                                                )}

                                                {/* Selection checkbox */}
                                                {selectionMode && (
                                                    <div className="w-9 shrink-0 flex items-center justify-center z-10">
                                                        <div className={cn(
                                                            "h-[22px] w-[22px] rounded-full border-2 flex items-center justify-center transition-all duration-100",
                                                            isSelected
                                                                ? "bg-tg-primary border-tg-primary scale-100"
                                                                : "border-tg-text-secondary/30 scale-90"
                                                        )}>
                                                            {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Message content */}
                                                <div className={cn(
                                                    "flex w-full z-10",
                                                    isMe ? "justify-end" : "justify-start",
                                                    selectionMode && "pointer-events-none"
                                                )}>
                                                    {/* Group chat avatar */}
                                                    {appearance.showAvatars && activeChat.type !== 'private' && !isMe && (
                                                        <div className="w-8 shrink-0 self-end mr-1.5">
                                                            {showAvatar && (
                                                                <Avatar className="h-8 w-8">
                                                                    <AvatarImage src={msg.sender?.avatar} />
                                                                    <AvatarFallback className="bg-tg-primary/20 text-tg-primary text-xs">
                                                                        {(msg.sender?.firstName || msg.sender?.username || '?').slice(0, 2).toUpperCase()}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                            )}
                                                        </div>
                                                    )}
                                                    <MessageBubble
                                                        message={msg}
                                                        isMe={isMe}
                                                        showTail={showTail}
                                                        showSenderName={showSenderName}
                                                        onContextMenu={handleContextMenu}
                                                        onReactionClick={(messageId, emoji) => {
                                                            if (currentUser) {
                                                                toggleReaction(activeChat.id, messageId, emoji, currentUser.id);
                                                            }
                                                        }}
                                                        mediaItems={mediaItems}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                                <div ref={bottomRef} />
                            </div>
                        </div>
                    </div>

                    {/* Scroll-to-bottom button */}
                    {showScrollDown && (
                        <div className="absolute bottom-16 right-4 z-20 animate-scroll-btn">
                            <button
                                onClick={scrollToBottom}
                                className="h-10 w-10 rounded-full bg-card/90 backdrop-blur-sm shadow-lg flex items-center justify-center text-tg-text-secondary hover:text-tg-primary hover:bg-card transition-all duration-150 active:scale-90"
                            >
                                <ChevronDown className="h-5 w-5" />
                            </button>
                        </div>
                    )}

                    {/* Input Area — overlaps the chat background */}
                    {!selectionMode && (
                        <MessageInput
                            resetKey={resetUploaderKey}
                            onSendMessage={handleSendMessage}
                            onSendVoice={handleSendVoice}
                            onTyping={handleTyping}
                            editingMessage={editingMessage}
                            onEditMessage={handleEditMessage}
                            onCancelEdit={() => setEditingMessage(null)}
                            replyToMessage={replyToMessage ? {
                                id: replyToMessage.id,
                                content: replyToMessage.content,
                                senderName: replyToMessage.sender?.firstName || replyToMessage.sender?.username || 'User',
                            } : undefined}
                            onCancelReply={() => setReplyToMessage(null)}
                            droppedFiles={droppedFiles}
                            onDroppedFilesHandled={handleDroppedFilesHandled}
                        />
                    )}
                </div>

                {/* Drag-and-drop overlay */}
                {isDragging && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-tg-primary/10 pointer-events-none">
                        <div className="bg-card px-8 py-6 rounded-2xl shadow-xl border border-tg-primary/30 text-center animate-fade-scale-in">
                            <Image className="h-10 w-10 text-tg-primary mx-auto mb-3" />
                            <p className="text-sm font-semibold text-foreground">Отпустите для отправки</p>
                            <p className="text-xs text-muted-foreground mt-1">Фото и видео</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <MessageContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    message={contextMenu.message}
                    isMe={contextMenu.message.senderId === currentUser?.id}
                    onClose={() => setContextMenu(null)}
                    onReply={handleReply}
                    onCopy={handleCopy}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onReaction={handleReaction}
                    onSelect={handleSelectFromMenu}
                />
            )}

            {/* User Profile Panel */}
            <UserProfilePanel
                userId={profileUserId}
                open={profileOpen}
                onClose={() => setProfileOpen(false)}
            />
        </div>
    );
}
