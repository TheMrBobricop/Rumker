import { format, isToday, isYesterday } from 'date-fns';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CheckCheck, Pin, BellOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatListContextMenu } from './ChatListContextMenu';
import { toast } from 'sonner';
import type { Chat } from '@/types';
import { useAnimatedMount, ANIM_MODAL, ANIM_BACKDROP } from '@/lib/hooks/useAnimatedMount';

interface ChatListProps {
    className?: string;
}

export function ChatList({ className }: ChatListProps) {
    const chats = useChatStore((s) => s.chats);
    const activeChat = useChatStore((s) => s.activeChat);
    const setActiveChat = useChatStore((s) => s.setActiveChat);
    const typingUsers = useChatStore((s) => s.typingUsers);
    const loadChats = useChatStore((s) => s.loadChats);
    const isLoading = useChatStore((s) => s.isLoading);
    const hasLoadedOnce = useChatStore((s) => s.hasLoadedOnce);
    const togglePinChat = useChatStore((s) => s.togglePinChat);
    const toggleMuteChat = useChatStore((s) => s.toggleMuteChat);
    const clearChatMessages = useChatStore((s) => s.clearChatMessages);
    const deleteChatAction = useChatStore((s) => s.deleteChatAction);
    const currentUserId = useAuthStore((s) => s.user?.id);
    const localOverrides = useSettingsStore((s) => s.localProfileOverrides);

    // Context menu
    const [ctxMenu, setCtxMenu] = useState<{ chat: Chat; x: number; y: number } | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressChatRef = useRef<string | null>(null);

    // Delete confirmation
    const [deleteConfirm, setDeleteConfirm] = useState<Chat | null>(null);
    // Clear confirmation
    const [clearConfirm, setClearConfirm] = useState<Chat | null>(null);

    // Animated dialogs
    const { mounted: delBackdropMounted, className: delBackdropClass } = useAnimatedMount(!!deleteConfirm, ANIM_BACKDROP);
    const { mounted: delModalMounted, className: delModalClass } = useAnimatedMount(!!deleteConfirm, ANIM_MODAL);
    const { mounted: clrBackdropMounted, className: clrBackdropClass } = useAnimatedMount(!!clearConfirm, ANIM_BACKDROP);
    const { mounted: clrModalMounted, className: clrModalClass } = useAnimatedMount(!!clearConfirm, ANIM_MODAL);

    useEffect(() => {
        loadChats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const formatTime = (date: Date) => {
        if (isToday(date)) return format(date, 'HH:mm');
        if (isYesterday(date)) return 'Вчера';
        return format(date, 'dd.MM.yy');
    };

    const getInitials = (title: string) => {
        return title
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
    };

    // Context menu handlers
    const handleContextMenu = useCallback((e: React.MouseEvent, chat: Chat) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ chat, x: e.clientX, y: e.clientY });
    }, []);

    const handleLongPressStart = useCallback((chat: Chat, e: React.TouchEvent) => {
        longPressChatRef.current = chat.id;
        const touch = e.touches[0];
        longPressTimerRef.current = setTimeout(() => {
            setCtxMenu({ chat, x: touch.clientX, y: touch.clientY });
        }, 500);
    }, []);

    const handleLongPressEnd = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        longPressChatRef.current = null;
    }, []);

    const handleLongPressMove = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const handlePin = useCallback((chat: Chat) => {
        togglePinChat(chat.id);
        toast.success(chat.isPinned ? 'Чат откреплён' : 'Чат закреплён');
    }, [togglePinChat]);

    const handleMute = useCallback((chat: Chat) => {
        toggleMuteChat(chat.id);
        toast.success(chat.isMuted ? 'Звук включён' : 'Звук отключён');
    }, [toggleMuteChat]);

    const handleClear = useCallback((chat: Chat) => {
        setClearConfirm(chat);
    }, []);

    const handleDelete = useCallback((chat: Chat) => {
        setDeleteConfirm(chat);
    }, []);

    const confirmClear = useCallback(async () => {
        if (!clearConfirm) return;
        try {
            await clearChatMessages(clearConfirm.id);
            toast.success('Чат очищен');
        } catch {
            toast.error('Не удалось очистить чат');
        }
        setClearConfirm(null);
    }, [clearConfirm, clearChatMessages]);

    const confirmDelete = useCallback(async () => {
        if (!deleteConfirm) return;
        try {
            await deleteChatAction(deleteConfirm.id);
            toast.success('Чат удалён');
        } catch {
            toast.error('Не удалось удалить чат');
        }
        setDeleteConfirm(null);
    }, [deleteConfirm, deleteChatAction]);

    // Sort chats: pinned first, then by last message time
    const sortedChats = useMemo(() => [...chats].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const aTime = a.lastMessage ? new Date(a.lastMessage.timestamp).getTime() : new Date(a.createdAt).getTime();
        const bTime = b.lastMessage ? new Date(b.lastMessage.timestamp).getTime() : new Date(b.createdAt).getTime();
        return bTime - aTime;
    }), [chats]);

    return (
        <div className={cn('relative h-full', className)}>
            <div className="h-full overflow-y-auto scrollbar-thin px-2 py-1">
                {isLoading && !hasLoadedOnce && (
                    <div className="p-3 space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-3">
                                <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!isLoading && chats.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-muted-foreground">
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <p className="text-sm">Нет чатов</p>
                        <p className="text-xs mt-1 text-muted-foreground/70">Найдите пользователя через поиск, чтобы начать общение</p>
                    </div>
                )}

                {sortedChats.map((chat, index) => {
                    const isActive = activeChat?.id === chat.id;
                    const isTyping = typingUsers[chat.id]?.length > 0;
                    const lastMsg = chat.lastMessage;

                    // Check if other participant is online (for private chats)
                    const otherParticipant = chat.type === 'private'
                        ? chat.participants.find(p => p.userId !== currentUserId)
                        : null;
                    const isOnline = otherParticipant?.user?.isOnline ?? false;
                    // Local profile override for private chat display name
                    const localOverride = otherParticipant ? localOverrides[otherParticipant.userId] : undefined;
                    const displayTitle = localOverride?.nickname || chat.title || 'Без названия';

                    return (
                        <div
                            key={chat.id}
                            onClick={() => setActiveChat(chat)}
                            onContextMenu={(e) => handleContextMenu(e, chat)}
                            onTouchStart={(e) => handleLongPressStart(chat, e)}
                            onTouchEnd={handleLongPressEnd}
                            onTouchMove={handleLongPressMove}
                            className={cn(
                                'group flex w-full items-center gap-3 px-3 py-[9px] transition-all duration-150 cursor-pointer rounded-xl focus:outline-none active:scale-[0.98] select-none animate-chat-item-in',
                                isActive
                                    ? 'bg-tg-active-chat hover:bg-tg-active-chat'
                                    : 'hover:bg-tg-hover'
                            )}
                            style={index < 20 ? { animationDelay: `${index * 30}ms` } : undefined}
                        >
                            <div className="relative shrink-0">
                                <Avatar className="h-[52px] w-[52px]">
                                    <AvatarImage src={chat.avatar ?? undefined} alt={displayTitle} />
                                    <AvatarFallback
                                        className={cn(
                                            'bg-gradient-to-br from-tg-primary/80 to-tg-primary text-white font-semibold text-base',
                                            isActive && 'from-white/20 to-white/30 text-white'
                                        )}
                                    >
                                        {getInitials(displayTitle)}
                                    </AvatarFallback>
                                </Avatar>
                                {isOnline && (
                                    <span className={cn(
                                        "absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 border-[2.5px]",
                                        isActive ? "border-tg-active-chat" : "border-card"
                                    )} />
                                )}
                            </div>

                            <div className="flex flex-1 flex-col overflow-hidden text-left min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        {chat.isPinned && (
                                            <Pin className={cn("h-3.5 w-3.5 shrink-0 rotate-45", isActive ? "text-white/70" : "text-tg-text-secondary")} />
                                        )}
                                        <span
                                            className={cn(
                                                'truncate font-semibold text-foreground text-[15px] leading-tight',
                                                isActive && 'text-white'
                                            )}
                                        >
                                            {displayTitle}
                                        </span>
                                        {chat.isMuted && (
                                            <BellOff className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-white/50" : "text-tg-text-secondary/50")} />
                                        )}
                                    </div>
                                    <span
                                        className={cn(
                                            'shrink-0 text-[11px] text-tg-text-secondary',
                                            isActive && 'text-white/70'
                                        )}
                                    >
                                        {lastMsg ? formatTime(new Date(lastMsg.timestamp)) : ''}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between mt-1">
                                    <div className="flex flex-1 items-center overflow-hidden pr-2 min-w-0">
                                        {isTyping ? (
                                            <span
                                                className={cn(
                                                    'truncate text-sm text-tg-primary',
                                                    isActive && 'text-white'
                                                )}
                                            >
                                                печатает...
                                            </span>
                                        ) : (
                                            <>
                                                {lastMsg && lastMsg.senderId === currentUserId && (
                                                    <span className={cn("mr-1 text-sm font-medium", isActive ? "text-white" : "text-tg-primary")}>
                                                        Вы:
                                                    </span>
                                                )}
                                                <span
                                                    className={cn(
                                                        'truncate text-sm text-tg-text-secondary',
                                                        isActive && 'text-white/80'
                                                    )}
                                                >
                                                    {lastMsg
                                                        ? lastMsg.type === 'poll' ? '📊 Опрос'
                                                        : lastMsg.type === 'location' ? '📍 Геолокация'
                                                        : lastMsg.type === 'contact' ? '👤 Контакт'
                                                        : lastMsg.type === 'voice' ? '🎤 Голосовое сообщение'
                                                        : lastMsg.type === 'video' ? '🎬 Видео'
                                                        : lastMsg.type === 'image' ? '🖼 Фото'
                                                        : lastMsg.type === 'file' ? '📎 Файл'
                                                        : (lastMsg.content || 'Нет сообщений')
                                                        : 'Нет сообщений'}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                        {lastMsg?.senderId === currentUserId && !chat.unreadCount && (
                                            <div className={cn(isActive ? "text-white" : "text-tg-primary")}>
                                                {lastMsg?.status === 'read' ? (
                                                    <CheckCheck className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Check className="h-3.5 w-3.5" />
                                                )}
                                            </div>
                                        )}

                                        {chat.unreadCount > 0 && (
                                            <div
                                                className={cn(
                                                    'flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white animate-badge-pop',
                                                    chat.isMuted
                                                        ? 'bg-muted-foreground/50'
                                                        : 'bg-tg-primary',
                                                    isActive && 'bg-white text-tg-primary'
                                                )}
                                            >
                                                {chat.unreadCount}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Context Menu */}
            {ctxMenu && (
                <ChatListContextMenu
                    chat={ctxMenu.chat}
                    x={ctxMenu.x}
                    y={ctxMenu.y}
                    onClose={() => setCtxMenu(null)}
                    onPin={handlePin}
                    onMute={handleMute}
                    onClear={handleClear}
                    onDelete={handleDelete}
                />
            )}

            {/* Delete Confirmation */}
            {(delBackdropMounted || delModalMounted) && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${delBackdropClass}`} onClick={() => setDeleteConfirm(null)}>
                    <div className={`bg-card rounded-xl p-6 mx-4 max-w-sm w-full shadow-xl ${delModalClass}`} onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-foreground mb-2">Удалить чат</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Удалить «{deleteConfirm?.title || 'Без названия'}»? Это действие нельзя отменить.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 text-sm rounded-lg hover:bg-muted transition-colors text-foreground"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                                Удалить
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clear Confirmation */}
            {(clrBackdropMounted || clrModalMounted) && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${clrBackdropClass}`} onClick={() => setClearConfirm(null)}>
                    <div className={`bg-card rounded-xl p-6 mx-4 max-w-sm w-full shadow-xl ${clrModalClass}`} onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-foreground mb-2">Очистить чат</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Удалить все сообщения в «{clearConfirm?.title || 'Без названия'}»?
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setClearConfirm(null)}
                                className="px-4 py-2 text-sm rounded-lg hover:bg-muted transition-colors text-foreground"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={confirmClear}
                                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                                Очистить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
