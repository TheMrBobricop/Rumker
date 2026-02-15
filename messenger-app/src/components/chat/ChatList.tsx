import { format, isToday, isYesterday } from 'date-fns';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, CheckCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatListHeader } from './ChatListHeader';
import { FloatingCreateButton } from './FloatingCreateButton';

interface ChatListProps {
    className?: string;
}

export function ChatList({ className }: ChatListProps) {
    const { chats, activeChat, setActiveChat, typingUsers, loadChats, isLoading } = useChatStore();

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
        <ScrollArea className={cn('h-full w-full', className)}>
            <div className="flex flex-col">
                {/* Header with create chat buttons */}
                <ChatListHeader onCreateChat={() => {}} />
                
                {isLoading && (
                    <div className="p-3 space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <Skeleton className="h-12 w-12 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {!isLoading && chats.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                        Нет чатов. Создайте новый чат или подключите Telegram.
                    </div>
                )}
                {chats.map((chat) => {
                    const isActive = activeChat?.id === chat.id;
                    const isTyping = typingUsers[chat.id]?.length > 0;
                    const lastMsg = chat.lastMessage;

                    return (
                        <button
                            key={chat.id}
                            onClick={() => setActiveChat(chat)}
                            className={cn(
                                'group flex w-full items-center gap-3 px-3 py-2 transition-colors hover:bg-tg-hover focus:outline-none',
                                isActive && 'bg-tg-active-chat hover:bg-tg-active-chat'
                            )}
                        >
                            {/* Avatar */}
                            <Avatar className="h-12 w-12 flex-shrink-0">
                                <AvatarImage src={chat.avatar} alt={chat.title} />
                                <AvatarFallback
                                    className={cn(
                                        'bg-gradient-to-br from-blue-400 to-blue-600 text-white font-medium',
                                        isActive && 'from-white/20 to-white/20 text-white'
                                    )}
                                >
                                    {getInitials(chat.title || 'Chat')}
                                </AvatarFallback>
                            </Avatar>

                            {/* Content */}
                            <div className="flex flex-1 flex-col overflow-hidden text-left">
                                {/* Top Row: Name and Time */}
                                <div className="flex items-center justify-between">
                                    <span
                                        className={cn(
                                            'truncate font-medium text-foreground',
                                            isActive && 'text-white'
                                        )}
                                    >
                                        {chat.title || 'Без названия'}
                                    </span>
                                    <span
                                        className={cn(
                                            'ml-2 flex-shrink-0 text-xs text-tg-text-secondary',
                                            isActive && 'text-white/70'
                                        )}
                                    >
                                        {lastMsg ? formatTime(new Date(lastMsg.timestamp)) : ''}
                                    </span>
                                </div>

                                {/* Bottom Row: Message Preview / Typing / Draft */}
                                <div className="flex items-center justify-between mt-1">
                                    <div className="flex flex-1 items-center overflow-hidden pr-2">
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
                                                {lastMsg && lastMsg.senderId === 'me' && (
                                                    <span className={cn("mr-1", isActive ? "text-white" : "text-tg-primary")}>
                                                        Вы:
                                                    </span>
                                                )}
                                                <span
                                                    className={cn(
                                                        'truncate text-sm text-tg-text-secondary',
                                                        isActive && 'text-white/80'
                                                    )}
                                                >
                                                    {lastMsg?.content || 'Нет сообщений'}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* Unread Badge or Read Status */}
                                    <div className="flex items-center gap-1">
                                        {/* Read Status for outgoing */}
                                        {lastMsg?.senderId === 'me' && !chat.unreadCount && (
                                            <div className={cn(isActive ? "text-white" : "text-tg-primary")}>
                                                {lastMsg.status === 'read' ? (
                                                    <CheckCheck className="h-4 w-4" />
                                                ) : (
                                                    <Check className="h-4 w-4" />
                                                )}
                                            </div>
                                        )}

                                        {chat.unreadCount > 0 && (
                                            <div
                                                className={cn(
                                                    'flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-tg-text-secondary px-1.5 text-xs font-medium text-white',
                                                    isActive && 'bg-white text-tg-primary' // Invert colors when active
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
            
            {/* Floating Create Button */}
            <FloatingCreateButton onCreateChat={(chat) => {
                console.log('Chat created:', chat);
                // TODO: Обновить список чатов и активировать новый
            }} />
        </ScrollArea>
    );
}
