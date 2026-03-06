import { useState, useMemo } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { VoiceChannelList } from './VoiceChannelList';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Headphones, ChevronLeft } from 'lucide-react';

/**
 * "Voice" tab content — shows group chats, picking one reveals its VoiceChannelList.
 */
export function VoiceChannelTab() {
    const chats = useChatStore(s => s.chats);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

    // Only group/channel chats support voice channels
    const groupChats = useMemo(
        () => chats.filter(c => c.type === 'group' || c.type === 'channel'),
        [chats]
    );

    if (selectedChatId) {
        return (
            <div className="h-full flex flex-col">
                <button
                    onClick={() => setSelectedChatId(null)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Назад к группам
                </button>
                <div className="flex-1 overflow-y-auto px-1">
                    <VoiceChannelList chatId={selectedChatId} />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto scrollbar-thin">
            {groupChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-muted-foreground">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Headphones className="w-8 h-8 text-muted-foreground/60" />
                    </div>
                    <p className="text-sm">Нет групповых чатов</p>
                    <p className="text-xs mt-1 text-muted-foreground/70">
                        Создайте группу, чтобы использовать голосовые каналы
                    </p>
                </div>
            ) : (
                <div className="px-2 py-1">
                    {groupChats.map(chat => (
                        <div
                            key={chat.id}
                            onClick={() => setSelectedChatId(chat.id)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-tg-hover transition-colors"
                        >
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={chat.avatar ?? undefined} alt={chat.title} />
                                <AvatarFallback className="bg-gradient-to-br from-tg-primary/80 to-tg-primary text-white font-semibold text-sm">
                                    {(chat.title || 'G').slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-foreground truncate">
                                    {chat.title || 'Без названия'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Голосовые каналы
                                </div>
                            </div>
                            <Headphones className="h-4 w-4 text-muted-foreground" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
