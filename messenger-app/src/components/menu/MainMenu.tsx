import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Settings, Moon, Sun, Users, HelpCircle, Menu, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MainMenu() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const { appearance, setTheme } = useSettingsStore();
    const [open, setOpen] = useState(false);

    const menuItems = [
        { icon: Users, label: 'Contacts', onClick: () => { /* TODO */ } },
        { icon: Settings, label: 'Settings', onClick: () => { navigate('/settings'); setOpen(false); } },
    ];

    const toggleTheme = () => {
        const newTheme = appearance.theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    };

    const getInitials = () => {
        const name = user?.username || user?.firstName || 'U';
        return name.slice(0, 2).toUpperCase();
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[300px] p-0" aria-describedby={undefined}>
                <SheetTitle className="sr-only">Меню</SheetTitle>
                <div className="flex flex-col h-full">
                    {/* User Header */}
                    <div className="bg-tg-header p-4 text-white">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-11 w-11 border-2 border-white/20">
                                <AvatarImage src={user?.avatar} />
                                <AvatarFallback className="bg-white/20 text-white text-sm">
                                    {getInitials()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-sm">
                                    {user?.firstName || user?.username || 'User'}
                                </p>
                                <p className="text-xs text-white/60 truncate">
                                    {user?.phone || user?.email || ''}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Menu Items */}
                    <nav className="flex-1 py-2">
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.label}
                                    onClick={item.onClick}
                                    className={cn(
                                        'w-full flex items-center gap-4 px-4 py-3 text-left',
                                        'hover:bg-muted transition-colors'
                                    )}
                                >
                                    <Icon className="h-5 w-5 text-tg-text-secondary" />
                                    <span className="text-sm">{item.label}</span>
                                </button>
                            );
                        })}

                        <div className="my-2 border-t border-border" />

                        {/* Theme Toggle */}
                        <button
                            onClick={toggleTheme}
                            className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted transition-colors"
                        >
                            {appearance.theme === 'dark' ? (
                                <Sun className="h-5 w-5 text-tg-text-secondary" />
                            ) : (
                                <Moon className="h-5 w-5 text-tg-text-secondary" />
                            )}
                            <span className="text-sm">
                                {appearance.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                            </span>
                        </button>

                        <button className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted transition-colors">
                            <HelpCircle className="h-5 w-5 text-tg-text-secondary" />
                            <span className="text-sm">Help</span>
                        </button>
                    </nav>

                    {/* Footer */}
                    <div className="border-t border-border p-4">
                        <Button 
                            variant="ghost" 
                            className="w-full justify-start gap-4 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => useAuthStore.getState().logout()}
                        >
                            <LogOut className="h-5 w-5" />
                            <span>Logout</span>
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
