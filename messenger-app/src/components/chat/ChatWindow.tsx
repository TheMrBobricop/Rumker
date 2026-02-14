
import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Search, MoreVertical, ArrowLeft, Phone } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

interface ChatWindowProps {
    onBack?: () => void; // For mobile view
}

export function ChatWindow({ onBack }: ChatWindowProps) {
    const { activeChat, messages, loadMessages, sendMessage, isLoadingMessages } = useChatStore();
    const { appearance } = useSettingsStore();

    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const [resetUploaderKey, setResetUploaderKey] = useState(0);

    // Load messages when active chat changes
    useEffect(() => {
        if (activeChat) {
            loadMessages(activeChat.id);
        }
    }, [activeChat, loadMessages]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, activeChat?.id]);

    if (!activeChat) {
        return (
            <div className="flex h-full items-center justify-center bg-tg-bg/50 text-tg-text-secondary">
                Select a chat to start messaging
            </div>
        );
    }

    const chatMessages = messages[activeChat.id] || [];

    const handleSendMessage = async (text: string, files: File[]) => {
        if (!text.trim() && files.length === 0) return;
        
        try {
            // Send via API
            await sendMessage(activeChat.id, text);
            
            // Reset file uploader
            setResetUploaderKey(prev => prev + 1);
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    const getInitials = (title: string) => title.slice(0, 2).toUpperCase();

    return (
        <div className="flex flex-col h-full bg-tg-bg relative">
            {/* Chat Header */}
            <header className="flex h-16 items-center justify-between border-b border-tg-divider bg-tg-header px-4 text-white shadow-sm z-10">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden text-white hover:bg-white/10">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}

                    <Avatar className="h-10 w-10 cursor-pointer hover:opacity-90 transition-opacity">
                        <AvatarImage src={activeChat.avatar} />
                        <AvatarFallback className="bg-tg-primary text-white">
                            {getInitials(activeChat.title || 'Chat')}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex flex-col cursor-pointer">
                        <span className="font-medium leading-tight">{activeChat.title}</span>
                        <span className="text-xs text-white/70">
                            {activeChat.type === 'private' ? 'был(а) недавно' : `${activeChat.participants.length} участников`}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hidden sm:flex">
                        <Search className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                        <Phone className="h-5 w-5" />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                                <MoreVertical className="h-5 w-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
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

            {/* Messages List */}
            <div
                className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scroll-smooth"
                ref={scrollRef}
                style={{
                    backgroundImage: appearance.chatBackground.type === 'image'
                        ? `url(${appearance.chatBackground.value})`
                        : 'none',
                    backgroundColor: appearance.chatBackground.type === 'color'
                        ? appearance.chatBackground.value
                        : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            >
                <div className="flex flex-col gap-2 min-h-full justify-end">
                    {isLoadingMessages && (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-primary"></div>
                        </div>
                    )}
                    
                    {!isLoadingMessages && chatMessages.length === 0 && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            Нет сообщений. Начните диалог!
                        </div>
                    )}

                    {chatMessages.map((msg, index) => {
                        const isMe = msg.senderId === 'me';
                        // Show tail only if next message is different sender or long gap
                        const nextMsg = chatMessages[index + 1];
                        const showTail = !nextMsg || nextMsg.senderId !== msg.senderId;

                        return (
                            <div
                                key={msg.id}
                                className={cn(
                                    "flex w-full mb-1",
                                    isMe ? "justify-end" : "justify-start"
                                )}
                            >
                                <MessageBubble
                                    message={msg}
                                    isMe={isMe}
                                    showTail={showTail}
                                />
                            </div>
                        );
                    })}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* Input Area */}
            <MessageInput
                key={resetUploaderKey} // Reset when files sent
                onSendMessage={handleSendMessage}
                onSendVoice={() => console.log('Voice rec logic here')}
                onTyping={() => console.log('User is typing...')}
            />
        </div>
    );
}
