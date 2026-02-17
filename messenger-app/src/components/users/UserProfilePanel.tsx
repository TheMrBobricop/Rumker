import { useEffect, useState } from 'react';
import { getUserById } from '@/lib/api/users';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetTitle,
} from '@/components/ui/sheet';
import { MessageSquare, Phone, AtSign, User, Clock, X, ImageIcon, FileText, LinkIcon } from 'lucide-react';
import type { UserProfile } from '@/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface UserProfilePanelProps {
    userId: string | null;
    open: boolean;
    onClose: () => void;
    onSendMessage?: (userId: string) => void;
}

export function UserProfilePanel({ userId, open, onClose, onSendMessage }: UserProfilePanelProps) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeSection, setActiveSection] = useState<'info' | 'media' | 'files' | 'links'>('info');

    useEffect(() => {
        if (!userId || !open) return;
        setLoading(true);
        setActiveSection('info');
        getUserById(userId)
            .then(setUser)
            .catch((err) => console.error('Failed to load user profile:', err))
            .finally(() => setLoading(false));
    }, [userId, open]);

    const getInitials = (u: UserProfile) => {
        const first = u.firstName?.[0] || '';
        const last = u.lastName?.[0] || '';
        return (first + last).toUpperCase() || u.username.slice(0, 2).toUpperCase();
    };

    const formatLastSeen = (date?: Date | string) => {
        if (!date) return 'Неизвестно';
        return format(new Date(date), 'dd.MM.yyyy HH:mm');
    };

    const sections = [
        { key: 'info' as const, label: 'Инфо' },
        { key: 'media' as const, label: 'Медиа', icon: ImageIcon },
        { key: 'files' as const, label: 'Файлы', icon: FileText },
        { key: 'links' as const, label: 'Ссылки', icon: LinkIcon },
    ];

    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent side="right" className="w-[360px] sm:max-w-[400px] p-0 overflow-hidden flex flex-col" aria-describedby={undefined}>
                <SheetTitle className="sr-only">Профиль пользователя</SheetTitle>

                {loading && (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-primary" />
                    </div>
                )}

                {!loading && user && (
                    <div className="flex flex-col h-full">
                        {/* Cover + Avatar area */}
                        <div className="relative bg-gradient-to-br from-tg-header to-tg-primary min-h-[200px] flex flex-col items-center justify-end pb-5">
                            {/* Close button */}
                            <button
                                onClick={onClose}
                                className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/30 transition-all z-10"
                            >
                                <X className="h-4 w-4" />
                            </button>

                            {/* Online indicator dot */}
                            <div className="relative">
                                <Avatar className="h-24 w-24 border-3 border-white/20 shadow-lg">
                                    <AvatarImage src={user.avatar} />
                                    <AvatarFallback className="bg-white/20 text-white text-2xl font-medium">
                                        {getInitials(user)}
                                    </AvatarFallback>
                                </Avatar>
                                {user.isOnline && (
                                    <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-tg-online border-2 border-white/30" />
                                )}
                            </div>

                            <h2 className="text-white text-lg font-semibold mt-3 px-4 text-center">
                                {user.firstName} {user.lastName || ''}
                            </h2>
                            <p className="text-white/60 text-sm">
                                {user.isOnline ? (
                                    <span className="text-green-300">в сети</span>
                                ) : (
                                    `был(а) ${formatLastSeen(user.lastSeen)}`
                                )}
                            </p>
                        </div>

                        {/* Action buttons row */}
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-tg-divider bg-card">
                            {onSendMessage && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="flex-1 h-9 text-tg-primary hover:bg-tg-primary/10"
                                    onClick={() => {
                                        onSendMessage(user.id);
                                        onClose();
                                    }}
                                >
                                    <MessageSquare className="h-4 w-4 mr-1.5" />
                                    Сообщение
                                </Button>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="flex-1 h-9 text-tg-primary hover:bg-tg-primary/10"
                            >
                                <Phone className="h-4 w-4 mr-1.5" />
                                Позвонить
                            </Button>
                        </div>

                        {/* Tabs for sections */}
                        <div className="flex border-b border-tg-divider bg-card">
                            {sections.map((s) => (
                                <button
                                    key={s.key}
                                    onClick={() => setActiveSection(s.key)}
                                    className={cn(
                                        'flex-1 py-2 text-xs font-medium transition-colors relative',
                                        activeSection === s.key
                                            ? 'text-tg-primary'
                                            : 'text-tg-text-secondary hover:text-tg-text'
                                    )}
                                >
                                    {s.label}
                                    {activeSection === s.key && (
                                        <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto bg-card">
                            {activeSection === 'info' && (
                                <div className="p-4 space-y-1 animate-fade-slide-in">
                                    {user.bio && (
                                        <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-tg-hover transition-colors">
                                            <User className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="text-xs text-tg-text-secondary">О себе</div>
                                                <div className="text-sm text-tg-text break-words">{user.bio}</div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-tg-hover transition-colors">
                                        <AtSign className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                        <div>
                                            <div className="text-xs text-tg-text-secondary">Имя пользователя</div>
                                            <div className="text-sm text-tg-primary">@{user.username}</div>
                                        </div>
                                    </div>

                                    {user.phone && (
                                        <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-tg-hover transition-colors">
                                            <Phone className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                            <div>
                                                <div className="text-xs text-tg-text-secondary">Телефон</div>
                                                <div className="text-sm text-tg-text">{user.phone}</div>
                                            </div>
                                        </div>
                                    )}

                                    {!user.isOnline && user.lastSeen && (
                                        <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-tg-hover transition-colors">
                                            <Clock className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                            <div>
                                                <div className="text-xs text-tg-text-secondary">Последний раз</div>
                                                <div className="text-sm text-tg-text">{formatLastSeen(user.lastSeen)}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeSection === 'media' && (
                                <div className="p-6 flex flex-col items-center justify-center text-tg-text-secondary text-sm animate-fade-slide-in min-h-[200px]">
                                    <ImageIcon className="h-10 w-10 mb-2 opacity-30" />
                                    Нет медиафайлов
                                </div>
                            )}

                            {activeSection === 'files' && (
                                <div className="p-6 flex flex-col items-center justify-center text-tg-text-secondary text-sm animate-fade-slide-in min-h-[200px]">
                                    <FileText className="h-10 w-10 mb-2 opacity-30" />
                                    Нет файлов
                                </div>
                            )}

                            {activeSection === 'links' && (
                                <div className="p-6 flex flex-col items-center justify-center text-tg-text-secondary text-sm animate-fade-slide-in min-h-[200px]">
                                    <LinkIcon className="h-10 w-10 mb-2 opacity-30" />
                                    Нет ссылок
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!loading && !user && userId && (
                    <div className="flex items-center justify-center h-full text-tg-text-secondary">
                        Пользователь не найден
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
