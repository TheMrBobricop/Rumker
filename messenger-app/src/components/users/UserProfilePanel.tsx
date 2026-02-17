import { useEffect, useState } from 'react';
import { getUserById } from '@/lib/api/users';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { MessageSquare, Phone, AtSign, User, Clock } from 'lucide-react';
import type { UserProfile } from '@/types';
import { format } from 'date-fns';

interface UserProfilePanelProps {
    userId: string | null;
    open: boolean;
    onClose: () => void;
    onSendMessage?: (userId: string) => void;
}

export function UserProfilePanel({ userId, open, onClose, onSendMessage }: UserProfilePanelProps) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!userId || !open) return;
        setLoading(true);
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

    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent side="right" className="w-80 sm:max-w-sm p-0 overflow-y-auto" aria-describedby={undefined}>
                <SheetTitle className="sr-only">Профиль пользователя</SheetTitle>
                {loading && (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-primary" />
                    </div>
                )}

                {!loading && user && (
                    <div className="flex flex-col">
                        {/* Header with avatar */}
                        <div className="bg-tg-header p-6 flex flex-col items-center text-white">
                            <Avatar className="h-20 w-20 mb-3 border-2 border-white/20">
                                <AvatarImage src={user.avatar} />
                                <AvatarFallback className="bg-tg-primary text-white text-xl">
                                    {getInitials(user)}
                                </AvatarFallback>
                            </Avatar>
                            <SheetHeader className="items-center p-0">
                                <p className="text-white text-lg font-semibold">
                                    {user.firstName} {user.lastName || ''}
                                </p>
                                <p className="text-white/70 text-sm">
                                    {user.isOnline ? (
                                        <span className="text-green-400">в сети</span>
                                    ) : (
                                        `был(а) ${formatLastSeen(user.lastSeen)}`
                                    )}
                                </p>
                            </SheetHeader>
                        </div>

                        {/* Info section */}
                        <div className="p-4 space-y-4">
                            {user.bio && (
                                <div className="flex items-start gap-3">
                                    <User className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                    <div>
                                        <div className="text-xs text-tg-text-secondary">О себе</div>
                                        <div className="text-sm text-tg-text">{user.bio}</div>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-start gap-3">
                                <AtSign className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-xs text-tg-text-secondary">Имя пользователя</div>
                                    <div className="text-sm text-tg-primary">@{user.username}</div>
                                </div>
                            </div>

                            {user.phone && (
                                <div className="flex items-start gap-3">
                                    <Phone className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                    <div>
                                        <div className="text-xs text-tg-text-secondary">Телефон</div>
                                        <div className="text-sm text-tg-text">{user.phone}</div>
                                    </div>
                                </div>
                            )}

                            {!user.isOnline && user.lastSeen && (
                                <div className="flex items-start gap-3">
                                    <Clock className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                    <div>
                                        <div className="text-xs text-tg-text-secondary">Последний раз в сети</div>
                                        <div className="text-sm text-tg-text">{formatLastSeen(user.lastSeen)}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        {onSendMessage && (
                            <div className="p-4 border-t border-tg-divider">
                                <Button
                                    className="w-full bg-tg-primary hover:bg-tg-secondary text-white"
                                    onClick={() => onSendMessage(user.id)}
                                >
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    Написать сообщение
                                </Button>
                            </div>
                        )}
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
