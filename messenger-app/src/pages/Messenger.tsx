
import { useEffect, useState, useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { ChatList } from '@/components/chat/ChatList';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { MainMenu } from '@/components/menu/MainMenu';
import { FriendsList } from '@/components/friends/FriendsList';
import { UserSearch } from '@/components/users/UserSearch';
import { MessageSquare, Users, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { findOrCreatePrivateChat } from '@/lib/api/chats';
import { cn } from '@/lib/utils';
import { applyThemePreset } from '@/lib/themes';
import { mediaCache } from '@/lib/cache/mediaCacheManager';
import { useSocket } from '@/lib/hooks/useSocket';

export function MessengerPage() {
    const { appearance, cache } = useSettingsStore();
    const { activeChat, setActiveChat, loadChats } = useChatStore();

    const [isMobile, setIsMobile] = useState(false);
    const [activeTab, setActiveTab] = useState<'chats' | 'friends'>('chats');
    const [showSearch, setShowSearch] = useState(false);

    // Connect socket for real-time
    useSocket();

    // Auto-clean expired media cache on mount
    useEffect(() => {
        if (cache.autoClean) {
            mediaCache.removeExpired(cache.expirationDays).catch(console.error);
        }

        // Clear cache on exit if enabled
        if (cache.clearCacheOnExit) {
            const handleBeforeUnload = () => {
                mediaCache.clearCache().catch(console.error);
            };
            window.addEventListener('beforeunload', handleBeforeUnload);
            return () => window.removeEventListener('beforeunload', handleBeforeUnload);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openOrCreateChat = useCallback(async (userId: string) => {
        try {
            const chat = await findOrCreatePrivateChat(userId);
            setActiveChat(chat);
            loadChats();
            setActiveTab('chats');
        } catch {
            toast.error('Не удалось открыть чат');
        }
    }, [setActiveChat, loadChats]);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        // Apply theme preset first (sets all CSS vars)
        if (appearance.themePreset) {
            applyThemePreset(appearance.themePreset);
        } else {
            // No preset — apply dark/light from theme setting
            const isDark = appearance.theme === 'dark' ||
                (appearance.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.classList.toggle('dark', isDark);
        }

        // Layer user's custom overrides on top
        const root = document.documentElement;
        root.style.setProperty(
            '--message-border-radius',
            `${appearance.messageBubbles.borderRadius}px`
        );
        root.style.setProperty(
            '--message-font-size',
            `${appearance.messageBubbles.fontSize}px`
        );
        root.style.setProperty(
            '--chat-background',
            appearance.chatBackground.value
        );
        root.style.setProperty(
            '--tg-message-out',
            appearance.messageBubbles.outgoingColor
        );
        root.style.setProperty(
            '--tg-message-in',
            appearance.messageBubbles.incomingColor
        );
    }, [appearance.themePreset, appearance.theme, appearance.messageBubbles.borderRadius, appearance.messageBubbles.fontSize, appearance.chatBackground.value, appearance.messageBubbles.outgoingColor, appearance.messageBubbles.incomingColor]);

    return (
        <div className="flex h-dvh w-screen overflow-hidden bg-background transition-colors duration-150">
            {/* Sidebar */}
            <aside
                className={cn(
                    'flex-col border-r border-border bg-card transition-colors duration-150',
                    'w-full md:w-[340px] lg:w-[380px] md:min-w-[300px] md:max-w-[420px]',
                    isMobile && activeChat ? 'hidden' : 'flex'
                )}
            >
                {/* Header */}
                <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 bg-card transition-colors duration-150">
                    <MainMenu />

                    {showSearch ? (
                        <>
                            <UserSearch
                                className="flex-1"
                                onSelectUser={(user) => {
                                    openOrCreateChat(user.id);
                                    setShowSearch(false);
                                }}
                            />
                            <button
                                onClick={() => setShowSearch(false)}
                                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground shrink-0"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </>
                    ) : (
                        <>
                            <span className="font-semibold text-lg flex-1 text-foreground">Rumker</span>
                            <button
                                onClick={() => setShowSearch(true)}
                                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
                            >
                                <Search className="h-5 w-5" />
                            </button>
                        </>
                    )}
                </header>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab('chats')}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors relative',
                            activeTab === 'chats'
                                ? 'text-tg-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <MessageSquare className="h-4 w-4" />
                        Чаты
                        {activeTab === 'chats' && (
                            <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('friends')}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors relative',
                            activeTab === 'friends'
                                ? 'text-tg-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <Users className="h-4 w-4" />
                        Друзья
                        {activeTab === 'friends' && (
                            <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full" />
                        )}
                    </button>
                </div>

                {/* Content */}
                <div key={activeTab} className="flex-1 overflow-hidden animate-fade-slide-in">
                    {activeTab === 'chats' ? (
                        <ChatList className="h-full" />
                    ) : (
                        <FriendsList onMessageFriend={(userId) => openOrCreateChat(userId)} />
                    )}
                </div>
            </aside>

            {/* Main Chat Area */}
            <main
                className={cn(
                    'flex-1 flex-col bg-tg-bg dark:bg-tg-bg-dark min-w-0 transition-colors duration-150',
                    isMobile && !activeChat ? 'hidden' : 'flex'
                )}
            >
                <ChatWindow onBack={() => setActiveChat(null)} />
            </main>
        </div>
    );
}
