import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { ChatList } from '@/components/chat/ChatList';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { MainMenu } from '@/components/menu/MainMenu';
import { FriendsList } from '@/components/friends/FriendsList';
import { UserSearch } from '@/components/users/UserSearch';
import { NewChatFAB } from '@/components/chat/NewChatFAB';
import { MessageSquare, Users, Search, X, Headphones } from 'lucide-react';
import { toast } from 'sonner';
import { findOrCreatePrivateChat } from '@/lib/api/chats';
import { cn } from '@/lib/utils';
import { applyThemePreset } from '@/lib/themes';
import { mediaCache } from '@/lib/cache/mediaCacheManager';
import { useSocket } from '@/lib/hooks/useSocket';
import { requestNotificationPermission, updateDocumentTitle } from '@/lib/notifications';
import { api } from '@/lib/api/client';
import { tokenStorage } from '@/lib/tokenStorage';
import { IncomingCallModal } from '@/components/call/IncomingCallModal';
import { ActiveCallOverlay } from '@/components/call/ActiveCallOverlay';
import { VoiceChannelOverlay } from '@/components/voice/VoiceChannelOverlay';
import { VoiceChannelsTab } from '@/components/voice/VoiceChannelsTab';
import { VoiceChannelPanel } from '@/components/voice/VoiceChannelPanel';
import { VoiceStreamPiP } from '@/components/voice/VoiceStreamPiP';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import type { Chat } from '@/types';

const TAB_ORDER: Array<'chats' | 'friends' | 'voice'> = ['chats', 'friends', 'voice'];

export function MessengerPage() {
    const appearance = useSettingsStore((s) => s.appearance);
    const cache = useSettingsStore((s) => s.cache);
    const activeChat = useChatStore((s) => s.activeChat);
    const setActiveChat = useChatStore((s) => s.setActiveChat);
    const loadChats = useChatStore((s) => s.loadChats);
    const chats = useChatStore((s) => s.chats);
    const viewingChannel = useVoiceChannelStore((s) => s.viewingChannel);

    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
    const [activeTab, setActiveTab] = useState<'chats' | 'friends' | 'voice'>('chats');
    const [tabAnimDirection, setTabAnimDirection] = useState<'left' | 'right'>('left');
    const [showSearch, setShowSearch] = useState(false);
    const delayedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tabSwipeStartRef = useRef<{ x: number; y: number; pointerType: 'mouse' | 'touch' | 'pen' } | null>(null);
    const wheelSwipeLockRef = useRef(0);

    // Resizable sidebar (desktop only)
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('rumker-sidebar-width');
        return saved ? Number(saved) : 340;
    });
    const isResizingRef = useRef(false);

    // Connect socket for real-time
    useSocket();

    // Request notification permission on mount
    useEffect(() => {
        requestNotificationPermission();
    }, []);

    // Proactive token refresh on mount prevents stale token logouts
    useEffect(() => {
        // Refresh token is sent via httpOnly cookie automatically
        api.get('/auth/me').catch(() => {
            useAuthStore.getState().logout();
            tokenStorage.setToken(null);
        });
    }, []);

    // Update document title with total unread count
    useEffect(() => {
        const totalUnread = chats.reduce((sum, c) => sum + c.unreadCount, 0);
        updateDocumentTitle(totalUnread);
    }, [chats]);

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
            if (isMobile) setMobileView('chat');
        } catch {
            toast.error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0447\u0430\u0442');
        }
    }, [setActiveChat, loadChats, isMobile]);

    const handleChatCreated = useCallback((chat: Chat) => {
        setActiveChat(chat);
        loadChats();
        setActiveTab('chats');
        if (isMobile) setMobileView('chat');
    }, [setActiveChat, loadChats, isMobile]);

    // Debounced resize handler (initial value set via useState initializer)
    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const check = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                setIsMobile(window.innerWidth < 768);
            }, 150);
        };
        window.addEventListener('resize', check);
        return () => {
            window.removeEventListener('resize', check);
            clearTimeout(timeoutId);
        };
    }, []);

    // Sidebar resize handlers (desktop)
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (ev: MouseEvent) => {
            if (!isResizingRef.current) return;
            const newWidth = Math.min(500, Math.max(260, ev.clientX));
            setSidebarWidth(newWidth);
        };
        const onMouseUp = () => {
            isResizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Save to localStorage
            setSidebarWidth(w => {
                localStorage.setItem('rumker-sidebar-width', String(w));
                return w;
            });
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, []);

    // Sync mobileView when activeChat changes + cancel any pending delayed clear
    useEffect(() => {
        if (activeChat) {
            // Cancel the delayed setActiveChat(null) from handleBack — prevents
            // the race where navigating back then quickly selecting a new chat
            // would null out the freshly-selected chat after 300ms.
            if (delayedClearRef.current) {
                clearTimeout(delayedClearRef.current);
                delayedClearRef.current = null;
            }
            if (isMobile) setMobileView('chat');
        }
    }, [activeChat, isMobile]);

    // Clear viewingChannel when a new chat is selected
    const prevActiveChatForVoiceRef = useRef(activeChat?.id);
    useEffect(() => {
        if (activeChat?.id && activeChat.id !== prevActiveChatForVoiceRef.current) {
            useVoiceChannelStore.getState().setViewingChannel(null);
        }
        prevActiveChatForVoiceRef.current = activeChat?.id;
    }, [activeChat?.id]);

    // Switch to chat view on mobile when viewingChannel is set
    useEffect(() => {
        if (viewingChannel && isMobile) {
            setMobileView('chat');
        }
    }, [viewingChannel, isMobile]);

    const handleVoicePanelBack = useCallback(() => {
        useVoiceChannelStore.getState().setViewingChannel(null);
        if (isMobile) setMobileView('list');
    }, [isMobile]);

    const switchTab = useCallback((nextTab: 'chats' | 'friends' | 'voice') => {
        if (nextTab === activeTab) return;
        const currentIndex = TAB_ORDER.indexOf(activeTab);
        const nextIndex = TAB_ORDER.indexOf(nextTab);
        setTabAnimDirection(nextIndex > currentIndex ? 'left' : 'right');
        setActiveTab(nextTab);
    }, [activeTab]);

    const beginSwipe = useCallback((x: number, y: number, pointerType: 'mouse' | 'touch' | 'pen') => {
        tabSwipeStartRef.current = { x, y, pointerType };
    }, []);

    const finishSwipe = useCallback((x: number, y: number) => {
        const start = tabSwipeStartRef.current;
        tabSwipeStartRef.current = null;
        if (!start) return;

        const dx = x - start.x;
        const dy = y - start.y;
        const threshold = start.pointerType === 'mouse' ? 90 : 60;
        if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.2) return;

        const currentIndex = TAB_ORDER.indexOf(activeTab);
        if (dx < 0 && currentIndex < TAB_ORDER.length - 1) {
            switchTab(TAB_ORDER[currentIndex + 1]);
        } else if (dx > 0 && currentIndex > 0) {
            switchTab(TAB_ORDER[currentIndex - 1]);
        }
    }, [activeTab, switchTab]);

    const canStartSwipe = (target: EventTarget | null) => {
        if (!(target instanceof Element)) return true;
        return !target.closest('button,a,input,textarea,select,label,[role="button"],[data-no-tab-swipe="true"]');
    };

    const onTabTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        const touch = e.changedTouches[0];
        beginSwipe(touch.clientX, touch.clientY, 'touch');
    }, [beginSwipe]);

    const onTabTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        const touch = e.changedTouches[0];
        finishSwipe(touch.clientX, touch.clientY);
    }, [finishSwipe]);

    const onTabPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'mouse') return;
        if (!canStartSwipe(e.target)) return;
        beginSwipe(e.clientX, e.clientY, (e.pointerType as 'mouse' | 'touch' | 'pen') || 'mouse');
    }, [beginSwipe]);

    const onTabPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'mouse') return;
        finishSwipe(e.clientX, e.clientY);
    }, [finishSwipe]);

    const onTabPointerCancel = useCallback(() => {
        tabSwipeStartRef.current = null;
    }, []);

    const onTabWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (Math.abs(e.deltaX) < 32 || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.2) return;

        const now = Date.now();
        if (now - wheelSwipeLockRef.current < 260) return;
        wheelSwipeLockRef.current = now;

        const currentIndex = TAB_ORDER.indexOf(activeTab);
        if (e.deltaX > 0 && currentIndex < TAB_ORDER.length - 1) {
            switchTab(TAB_ORDER[currentIndex + 1]);
            e.preventDefault();
        } else if (e.deltaX < 0 && currentIndex > 0) {
            switchTab(TAB_ORDER[currentIndex - 1]);
            e.preventDefault();
        }
    }, [activeTab, switchTab]);

    const handleBack = useCallback(() => {
        setMobileView('list');
        // Delay clearing activeChat so slide animation plays
        if (delayedClearRef.current) clearTimeout(delayedClearRef.current);
        delayedClearRef.current = setTimeout(() => {
            setActiveChat(null);
        }, 300);
    }, [setActiveChat]);

    useEffect(() => {
        return () => {
            if (delayedClearRef.current) clearTimeout(delayedClearRef.current);
        };
    }, []);

    useLayoutEffect(() => {
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

    // Mobile: use CSS transform slide layout
    if (isMobile) {
        return (
            <div className="h-dvh w-screen overflow-hidden bg-background transition-colors duration-150">
                <IncomingCallModal />
                <ActiveCallOverlay />
                {!viewingChannel && <VoiceStreamPiP />}
                <div
                    className="flex h-full w-[200vw]"
                    style={{
                        transform: mobileView === 'chat' ? 'translateX(-100vw)' : 'translateX(0)',
                        transition: 'transform 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                    }}
                >
                    {/* Panel 1: Sidebar */}
                    <div className="w-screen h-full flex flex-col border-r border-border bg-card">
                        {/* Header */}
                        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 bg-card transition-colors duration-150">
                            <MainMenu onOpenContacts={() => setActiveTab('friends')} />

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
                                onClick={() => switchTab('chats')}
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
                                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full animate-tab-indicator" />
                                )}
                            </button>
                            <button
                                onClick={() => switchTab('friends')}
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
                                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full animate-tab-indicator" />
                                )}
                            </button>
                            <button
                                onClick={() => switchTab('voice')}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors relative',
                                    activeTab === 'voice'
                                        ? 'text-tg-primary'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <Headphones className="h-4 w-4" />
                                Голос
                                {activeTab === 'voice' && (
                                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full animate-tab-indicator" />
                                )}
                            </button>
                        </div>

                        {/* Content */}
                        <div
                            className="flex-1 overflow-hidden relative"
                            onTouchStart={onTabTouchStart}
                            onTouchEnd={onTabTouchEnd}
                            onPointerDown={onTabPointerDown}
                            onPointerUp={onTabPointerUp}
                            onPointerCancel={onTabPointerCancel}
                            onWheel={onTabWheel}
                        >
                            <div key={`${activeTab}-${tabAnimDirection}-m`} className={cn("h-full", tabAnimDirection === 'left' ? 'animate-tab-swipe-in-left' : 'animate-tab-swipe-in-right')}>
                                {activeTab === 'chats' && <ChatList className="h-full" />}
                                {activeTab === 'friends' && <FriendsList onMessageFriend={(userId) => openOrCreateChat(userId)} />}
                                {activeTab === 'voice' && <VoiceChannelsTab className="h-full" onOpenChat={openOrCreateChat} />}
                            </div>
                            {activeTab !== 'voice' && <NewChatFAB onChatCreated={handleChatCreated} />}
                        </div>
                        <VoiceChannelOverlay />
                    </div>

                    {/* Panel 2: Chat or Voice Channel Panel */}
                    <div className="w-screen h-full flex flex-col bg-tg-bg dark:bg-tg-bg-dark min-w-0">
                        {viewingChannel ? (
                            <VoiceChannelPanel onBack={handleVoicePanelBack} />
                        ) : (
                            <ChatWindow onBack={handleBack} />
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Desktop layout
    return (
        <div className="flex h-dvh w-screen overflow-hidden bg-background transition-colors duration-150">
            <IncomingCallModal />
            <ActiveCallOverlay />
            {!viewingChannel && <VoiceStreamPiP />}
            {/* Sidebar */}
            <aside
                className="flex flex-col border-r border-border bg-card transition-colors duration-150 shrink-0"
                style={{ width: sidebarWidth }}
            >
                {/* Header */}
                <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 bg-card transition-colors duration-150">
                    <MainMenu onOpenContacts={() => setActiveTab('friends')} />

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
                        onClick={() => switchTab('chats')}
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
                            <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full animate-tab-indicator" />
                        )}
                    </button>
                    <button
                        onClick={() => switchTab('friends')}
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
                            <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full animate-tab-indicator" />
                        )}
                    </button>
                    <button
                        onClick={() => switchTab('voice')}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors relative',
                            activeTab === 'voice'
                                ? 'text-tg-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <Headphones className="h-4 w-4" />
                        Голос
                        {activeTab === 'voice' && (
                            <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full animate-tab-indicator" />
                        )}
                    </button>
                </div>

                {/* Content */}
                <div
                    className="flex-1 overflow-hidden relative"
                    onTouchStart={onTabTouchStart}
                    onTouchEnd={onTabTouchEnd}
                    onPointerDown={onTabPointerDown}
                    onPointerUp={onTabPointerUp}
                    onPointerCancel={onTabPointerCancel}
                    onWheel={onTabWheel}
                >
                    <div key={`${activeTab}-${tabAnimDirection}-d`} className={cn("h-full", tabAnimDirection === 'left' ? 'animate-tab-swipe-in-left' : 'animate-tab-swipe-in-right')}>
                        {activeTab === 'chats' && <ChatList className="h-full" />}
                        {activeTab === 'friends' && <FriendsList onMessageFriend={(userId) => openOrCreateChat(userId)} />}
                        {activeTab === 'voice' && <VoiceChannelsTab className="h-full" onOpenChat={openOrCreateChat} />}
                    </div>
                    {activeTab !== 'voice' && <NewChatFAB onChatCreated={handleChatCreated} />}
                </div>
                <VoiceChannelOverlay />
            </aside>

            {/* Resize Handle */}
            <div
                className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors shrink-0"
                onMouseDown={handleResizeStart}
            />

            {/* Main Chat Area or Voice Channel Panel */}
            <main className="flex-1 flex flex-col bg-tg-bg dark:bg-tg-bg-dark min-w-0 transition-colors duration-150">
                {viewingChannel ? (
                    <VoiceChannelPanel onBack={handleVoicePanelBack} />
                ) : (
                    <ChatWindow onBack={() => setActiveChat(null)} />
                )}
            </main>
        </div>
    );
}
