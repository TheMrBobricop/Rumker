
import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { ChatList } from '@/components/chat/ChatList';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { MainMenu } from '@/components/menu/MainMenu';
import { FriendsList } from '@/components/friends/FriendsList';
import { UserSearch } from '@/components/users/UserSearch';
import { RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncTelegramDialogs } from '@/lib/api/chats';
import { toast } from 'sonner';

export function MessengerPage() {
    const { appearance, setTheme } = useSettingsStore();
    const { activeChat, setActiveChat, loadChats } = useChatStore();

    const [isMobile, setIsMobile] = useState(false);
    const [activeTab, setActiveTab] = useState<'chats' | 'friends'>('chats');
    
    useEffect(() => {
        setIsMobile(window.innerWidth < 768);
    }, []);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        setTheme(appearance.theme);
        
        // Apply theme to document
        const isDark = appearance.theme === 'dark' || 
            (appearance.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Apply custom CSS variables for message bubbles
        document.documentElement.style.setProperty(
            '--message-border-radius', 
            `${appearance.messageBubbles.borderRadius}px`
        );
        document.documentElement.style.setProperty(
            '--message-font-size', 
            `${appearance.messageBubbles.fontSize}px`
        );
        document.documentElement.style.setProperty(
            '--chat-background', 
            appearance.chatBackground.value
        );
    }, [appearance.theme, appearance.messageBubbles.borderRadius, appearance.messageBubbles.fontSize, appearance.chatBackground.value, setTheme]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleSyncTelegram = async () => {
        setIsSyncing(true);
        try {
            const result = await syncTelegramDialogs();
            if (result.success) {
                toast.success('Telegram dialogs synced');
                // Reload chats to show new data
                await loadChats();
            } else {
                toast.error(result.message || 'Failed to sync');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Telegram not connected';
            toast.error(message);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-background">
            {/* Sidebar */}
            <aside
                className={`flex w-full md:w-[360px] flex-col border-r border-border bg-card transition-all ${isMobile && activeChat ? 'hidden' : 'flex'
                    }`}
            >
                <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 bg-tg-bg dark:bg-tg-bg-dark">
                    <div className="flex items-center gap-2">
                        <MainMenu />
                        <span className="font-semibold hidden sm:inline-block">Rumker</span>
                    </div>

                    <div className="relative flex-1 max-w-[200px]">
                        <UserSearch 
                            className="w-full"
                            onSelectUser={(user) => {
                                toast.success(`Selected user: @${user.username}`);
                                // TODO: Start chat with user
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-1">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={handleSyncTelegram} 
                            disabled={isSyncing}
                            title="Sync Telegram"
                        >
                            <RefreshCw className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </header>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab('chats')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === 'chats' 
                                ? 'text-tg-primary border-b-2 border-tg-primary' 
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Chats
                    </button>
                    <button
                        onClick={() => setActiveTab('friends')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === 'friends' 
                                ? 'text-tg-primary border-b-2 border-tg-primary' 
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Users className="h-4 w-4" />
                        Friends
                    </button>
                </div>

                {/* Content */}
                {activeTab === 'chats' ? (
                    <ChatList className="flex-1" />
                ) : (
                    <div className="flex-1 overflow-hidden">
                        <FriendsList />
                    </div>
                )}
            </aside>

            {/* Main Chat Area */}
            <main
                className={`flex-1 flex-col bg-tg-bg dark:bg-tg-bg-dark transition-all ${isMobile && !activeChat ? 'hidden' : 'flex'
                    }`}
            >
                <ChatWindow onBack={() => setActiveChat(null)} />
            </main>
        </div>
    );
}
