import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileSettings, AppearanceSettings, CacheSettings, NotificationSettings, PrivacySettings, VoiceSettings, SoundSettings } from '@/components/settings';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, User, Palette, Database, Bell, Shield, Mic, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type SettingsTab = 'profile' | 'appearance' | 'cache' | 'notifications' | 'privacy' | 'voice' | 'sounds';

const SETTINGS_MENU = [
    { id: 'profile' as SettingsTab, label: 'Профиль', icon: User, description: 'Личная информация' },
    { id: 'appearance' as SettingsTab, label: 'Внешний вид', icon: Palette, description: 'Тема и цвета' },
    { id: 'voice' as SettingsTab, label: 'Голос', icon: Mic, description: 'Микрофон и динамики' },
    { id: 'sounds' as SettingsTab, label: 'Звуки', icon: Volume2, description: 'Звуки и эквалайзер' },
    { id: 'cache' as SettingsTab, label: 'Данные', icon: Database, description: 'Кеш и хранилище' },
    { id: 'notifications' as SettingsTab, label: 'Уведомления', icon: Bell, description: 'Настройки оповещений' },
    { id: 'privacy' as SettingsTab, label: 'Приватность', icon: Shield, description: 'Настройки безопасности' },
];

const SETTINGS_ORDER: SettingsTab[] = ['profile', 'appearance', 'voice', 'sounds', 'cache', 'notifications', 'privacy'];

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const [tabAnimDirection, setTabAnimDirection] = useState<'left' | 'right'>('left');
    const [mobileShowContent, setMobileShowContent] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const tabSwipeStartRef = useRef<{ x: number; y: number; pointerType: 'mouse' | 'touch' | 'pen' } | null>(null);
    const wheelSwipeLockRef = useRef(0);
    const navigate = useNavigate();

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const switchTab = useCallback((tab: SettingsTab) => {
        if (tab === activeTab) return;
        const currentIndex = SETTINGS_ORDER.indexOf(activeTab);
        const nextIndex = SETTINGS_ORDER.indexOf(tab);
        setTabAnimDirection(nextIndex > currentIndex ? 'left' : 'right');
        setActiveTab(tab);
    }, [activeTab]);

    const handleSelectTab = useCallback((tab: SettingsTab) => {
        switchTab(tab);
        if (isMobile) setMobileShowContent(true);
    }, [isMobile, switchTab]);

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

        const currentIndex = SETTINGS_ORDER.indexOf(activeTab);
        if (dx < 0 && currentIndex < SETTINGS_ORDER.length - 1) {
            switchTab(SETTINGS_ORDER[currentIndex + 1]);
        } else if (dx > 0 && currentIndex > 0) {
            switchTab(SETTINGS_ORDER[currentIndex - 1]);
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
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (!canStartSwipe(e.target)) return;

        beginSwipe(e.clientX, e.clientY, (e.pointerType as 'mouse' | 'touch' | 'pen') || 'mouse');
        if (e.currentTarget.setPointerCapture) {
            e.currentTarget.setPointerCapture(e.pointerId);
        }
    }, [beginSwipe]);

    const onTabPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        finishSwipe(e.clientX, e.clientY);
        if (e.currentTarget.releasePointerCapture && e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    }, [finishSwipe]);

    const onTabPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        tabSwipeStartRef.current = null;
        if (e.currentTarget.releasePointerCapture && e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    }, []);

    const onTabWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (Math.abs(e.deltaX) < 32 || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.2) return;

        const now = Date.now();
        if (now - wheelSwipeLockRef.current < 260) return;
        wheelSwipeLockRef.current = now;

        const currentIndex = SETTINGS_ORDER.indexOf(activeTab);
        if (e.deltaX > 0 && currentIndex < SETTINGS_ORDER.length - 1) {
            switchTab(SETTINGS_ORDER[currentIndex + 1]);
            e.preventDefault();
        } else if (e.deltaX < 0 && currentIndex > 0) {
            switchTab(SETTINGS_ORDER[currentIndex - 1]);
            e.preventDefault();
        }
    }, [activeTab, switchTab]);

    const handleBack = () => {
        if (isMobile && mobileShowContent) {
            setMobileShowContent(false);
        } else {
            navigate('/');
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'profile':
                return <ProfileSettings />;
            case 'appearance':
                return <AppearanceSettings />;
            case 'cache':
                return <CacheSettings />;
            case 'notifications':
                return <NotificationSettings />;
            case 'privacy':
                return <PrivacySettings />;
            case 'voice':
                return <VoiceSettings />;
            case 'sounds':
                return <SoundSettings />;
            default:
                return null;
        }
    };

    if (isMobile) {
        return (
            <div className="h-dvh w-screen overflow-hidden bg-background">
                <div
                    className="flex h-full w-[200vw]"
                    style={{
                        transform: mobileShowContent ? 'translateX(-100vw)' : 'translateX(0)',
                        transition: 'transform 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                    }}
                >
                    <div className="w-screen h-full flex flex-col bg-card">
                        <header className="flex h-14 items-center gap-3 border-b border-border px-3 shrink-0">
                            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate('/')}>
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <h1 className="font-semibold text-lg">Настройки</h1>
                        </header>
                        <ScrollArea className="flex-1">
                            <div className="p-2">
                                {SETTINGS_MENU.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => handleSelectTab(item.id)}
                                            className={cn(
                                                'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left active:scale-[0.98]',
                                                activeTab === item.id
                                                    ? 'bg-tg-primary/10 text-tg-primary'
                                                    : 'hover:bg-muted text-foreground'
                                            )}
                                        >
                                            <Icon className="h-5 w-5" />
                                            <div className="flex-1 min-w-0">
                                                <p className={cn('font-medium text-sm', activeTab === item.id && 'text-tg-primary')}>
                                                    {item.label}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="w-screen h-full flex flex-col bg-background">
                        <header className="flex h-14 items-center gap-3 border-b border-border px-3 shrink-0 bg-card">
                            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleBack}>
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <h1 className="font-semibold text-base">
                                {SETTINGS_MENU.find((m) => m.id === activeTab)?.label}
                            </h1>
                        </header>
                        <div
                            className="flex-1 overflow-y-auto"
                            onTouchStart={onTabTouchStart}
                            onTouchEnd={onTabTouchEnd}
                            onPointerDown={onTabPointerDown}
                            onPointerUp={onTabPointerUp}
                            onPointerCancel={onTabPointerCancel}
                            onWheel={onTabWheel}
                        >
                            <div key={`${activeTab}-${tabAnimDirection}`} className={cn('p-4', tabAnimDirection === 'left' ? 'animate-tab-swipe-in-left' : 'animate-tab-swipe-in-right')}>
                                {renderContent()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-dvh w-full overflow-hidden bg-background">
            <aside className="w-[320px] border-r border-border bg-card flex flex-col">
                <header className="flex h-14 items-center gap-4 border-b border-border px-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="font-semibold text-lg">Настройки</h1>
                </header>

                <ScrollArea className="flex-1">
                    <div className="p-2">
                        {SETTINGS_MENU.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeTab === item.id;

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => switchTab(item.id)}
                                    className={cn(
                                        'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                                        isActive
                                            ? 'bg-tg-primary/10 text-tg-primary'
                                            : 'hover:bg-muted text-foreground'
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    <div className="flex-1 min-w-0">
                                        <p className={cn('font-medium truncate', isActive && 'text-tg-primary')}>
                                            {item.label}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </ScrollArea>
            </aside>

            <main
                className="flex-1 overflow-y-auto"
                onTouchStart={onTabTouchStart}
                onTouchEnd={onTabTouchEnd}
                onPointerDown={onTabPointerDown}
                onPointerUp={onTabPointerUp}
                onPointerCancel={onTabPointerCancel}
                onWheel={onTabWheel}
            >
                <div key={`${activeTab}-${tabAnimDirection}`} className={cn('w-full max-w-6xl mx-auto px-4 py-5 md:px-6 md:py-6 xl:px-8', tabAnimDirection === 'left' ? 'animate-tab-swipe-in-left' : 'animate-tab-swipe-in-right')}>
                    {renderContent()}
                </div>
            </main>
        </div>
    );
}
