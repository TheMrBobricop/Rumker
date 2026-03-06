import { useState, useEffect } from 'react';
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

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const [mobileShowContent, setMobileShowContent] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const handleSelectTab = (tab: SettingsTab) => {
        setActiveTab(tab);
        if (isMobile) setMobileShowContent(true);
    };

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

    // Mobile: slide between menu and content
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
                    {/* Panel 1: Menu */}
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

                    {/* Panel 2: Content */}
                    <div className="w-screen h-full flex flex-col bg-background">
                        <header className="flex h-14 items-center gap-3 border-b border-border px-3 shrink-0 bg-card">
                            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleBack}>
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <h1 className="font-semibold text-base">
                                {SETTINGS_MENU.find(m => m.id === activeTab)?.label}
                            </h1>
                        </header>
                        <div className="flex-1 overflow-y-auto">
                            <div key={activeTab} className="p-4 animate-fade-slide-in">
                                {renderContent()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Desktop layout
    return (
        <div className="flex h-screen w-full bg-background">
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
                                    onClick={() => setActiveTab(item.id)}
                                    className={cn(
                                        'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                                        isActive
                                            ? 'bg-tg-primary/10 text-tg-primary'
                                            : 'hover:bg-muted text-foreground'
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    <div className="flex-1">
                                        <p className={cn('font-medium', isActive && 'text-tg-primary')}>
                                            {item.label}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{item.description}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </ScrollArea>
            </aside>

            <main className="flex-1 overflow-y-auto">
                <div key={activeTab} className="max-w-2xl mx-auto p-6 animate-fade-slide-in">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
}
