import { format, isToday, isYesterday } from 'date-fns';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CheckCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ChatListProps {
    className?: string;
}

export function ChatList({ className }: ChatListProps) {
    const { chats, activeChat, setActiveChat, typingUsers, loadChats, isLoading } = useChatStore();
    const currentUserId = useAuthStore((s) => s.user?.id);

    useEffect(() => {
        loadChats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const formatTime = (date: Date) => {
        if (isToday(date)) {
            return format(date, 'HH:mm');
        }
        if (isYesterday(date)) {
            return 'Вчера';
        }
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

    return (
        <div className={cn('relative h-full', className)}>
            <div className="h-full overflow-y-auto scrollbar-thin">
                {isLoading && (
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

                {chats.map((chat, index) => {
                    const isActive = activeChat?.id === chat.id;
                    const isTyping = typingUsers[chat.id]?.length > 0;
                    const lastMsg = chat.lastMessage;

                    // Check if other participant is online (for private chats)
                    const otherParticipant = chat.type === 'private'
                        ? chat.participants.find(p => p.userId !== currentUserId)
                        : null;
                    const isOnline = otherParticipant?.user?.isOnline ?? false;

                    return (
                        <button
                            key={chat.id}
                            onClick={() => setActiveChat(chat)}
                            style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                            className={cn(
                                'group flex w-full items-center gap-3 px-3 py-2.5 transition-colors hover:bg-tg-hover focus:outline-none active:bg-tg-hover/80 animate-fade-slide-in',
                                isActive && 'bg-tg-active-chat hover:bg-tg-active-chat'
                            )}
                        >
                            <div className="relative shrink-0">
                                <Avatar className="h-11 w-11">
                                    <AvatarImage src={chat.avatar ?? undefined} alt={chat.title} />
                                    <AvatarFallback
                                        className={cn(
                                            'bg-gradient-to-br from-tg-primary/80 to-tg-primary text-white font-medium text-sm',
                                            isActive && 'from-white/20 to-white/30 text-white'
                                        )}
                                    >
                                        {getInitials(chat.title || 'Chat')}
                                    </AvatarFallback>
                                </Avatar>
                                {isOnline && (
                                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-card" />
                                )}
                            </div>

                            <div className="flex flex-1 flex-col overflow-hidden text-left min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <span
                                        className={cn(
                                            'truncate font-medium text-foreground text-sm',
                                            isActive && 'text-white'
                                        )}
                                    >
                                        {chat.title || 'Без названия'}
                                    </span>
                                    <span
                                        className={cn(
                                            'shrink-0 text-[11px] text-tg-text-secondary',
                                            isActive && 'text-white/70'
                                        )}
                                    >
                                        {lastMsg ? formatTime(new Date(lastMsg.timestamp)) : ''}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between mt-0.5">
                                    <div className="flex flex-1 items-center overflow-hidden pr-2 min-w-0">
                                        {isTyping ? (
                                            <span
                                                className={cn(
                                                    'truncate text-[13px] text-tg-primary',
                                                    isActive && 'text-white'
                                                )}
                                            >
                                                печатает...
                                            </span>
                                        ) : (
                                            <>
                                                {lastMsg && lastMsg.senderId === currentUserId && (
                                                    <span className={cn("mr-1 text-[13px]", isActive ? "text-white" : "text-tg-primary")}>
                                                        Вы:
                                                    </span>
                                                )}
                                                <span
                                                    className={cn(
                                                        'truncate text-[13px] text-tg-text-secondary',
                                                        isActive && 'text-white/80'
                                                    )}
                                                >
                                                    {lastMsg?.content || 'Нет сообщений'}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                        {lastMsg?.senderId === 'me' && !chat.unreadCount && (
                                            <div className={cn(isActive ? "text-white" : "text-tg-primary")}>
                                                {lastMsg.status === 'read' ? (
                                                    <CheckCheck className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Check className="h-3.5 w-3.5" />
                                                )}
                                            </div>
                                        )}

                                        {chat.unreadCount > 0 && (
                                            <div
                                                className={cn(
                                                    'flex h-5 min-w-5 items-center justify-center rounded-full bg-tg-primary px-1.5 text-[11px] font-medium text-white',
                                                    isActive && 'bg-white text-tg-primary'
                                                )}
                                            >
                                                {chat.unreadCount}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

        </div>
    );
}
