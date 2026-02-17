import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileSettings, AppearanceSettings, CacheSettings, NotificationSettings, PrivacySettings } from '@/components/settings';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, User, Palette, Database, Bell, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

type SettingsTab = 'profile' | 'appearance' | 'cache' | 'notifications' | 'privacy';

const SETTINGS_MENU = [
    { id: 'profile' as SettingsTab, label: 'Profile', icon: User, description: 'Your personal information' },
    { id: 'appearance' as SettingsTab, label: 'Appearance', icon: Palette, description: 'Theme and colors' },
    { id: 'cache' as SettingsTab, label: 'Data & Storage', icon: Database, description: 'Cache and storage settings' },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: Bell, description: 'Notification preferences' },
    { id: 'privacy' as SettingsTab, label: 'Privacy & Security', icon: Shield, description: 'Privacy settings' },
];

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const navigate = useNavigate();

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
            default:
                return null;
        }
    };

    return (
        <div className="flex h-screen w-full bg-background">
            {/* Sidebar */}
            <aside className="w-[320px] border-r border-border bg-card flex flex-col">
                <header className="flex h-14 items-center gap-4 border-b border-border px-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="font-semibold text-lg">Settings</h1>
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
                                        <p className={cn(
                                            'font-medium',
                                            isActive && 'text-tg-primary'
                                        )}>
                                            {item.label}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.description}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </ScrollArea>
            </aside>

            {/* Content */}
            <main className="flex-1 overflow-y-auto">
                <div key={activeTab} className="max-w-2xl mx-auto p-6 animate-fade-slide-in">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
}
