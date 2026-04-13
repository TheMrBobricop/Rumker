import { useState, useEffect } from 'react';
import { X, Search, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { api } from '@/lib/api/client';
import { useAnimatedMount, ANIM_MODAL, ANIM_BACKDROP } from '@/lib/hooks/useAnimatedMount';

interface Friend {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    isOnline?: boolean;
}

interface ContactPickerProps {
    open: boolean;
    onClose: () => void;
    onSelectContact: (contact: {
        userId: string;
        username: string;
        firstName?: string;
        lastName?: string;
        avatar?: string;
    }) => void;
}

export function ContactPicker({ open, onClose, onSelectContact }: ContactPickerProps) {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const { mounted: backdropMounted, className: backdropClass } = useAnimatedMount(open, ANIM_BACKDROP);
    const { mounted: modalMounted, className: modalClass } = useAnimatedMount(open, ANIM_MODAL);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        api.get<{ friends: { id: string; friend: Friend; since: string }[] }>('/friends')
            .then((data) => {
                const list = (data?.friends || []).map(item => item.friend).filter(Boolean);
                setFriends(list);
            })
            .catch(() => setFriends([]))
            .finally(() => setLoading(false));
    }, [open]);

    if (!backdropMounted && !modalMounted) return null;

    const filtered = friends.filter(f => {
        if (!filter) return true;
        const name = `${f.firstName || ''} ${f.lastName || ''} ${f.username}`.toLowerCase();
        return name.includes(filter.toLowerCase());
    });

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${backdropClass}`} onClick={onClose}>
            <div
                className={`bg-card rounded-xl mx-4 max-w-sm w-full shadow-xl ${modalClass} overflow-hidden`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-border">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-foreground">Поделиться контактом</h3>
                        <button
                            onClick={onClose}
                            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Поиск друга..."
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-muted text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="max-h-[300px] overflow-y-auto">
                    {loading ? (
                        <div className="p-6 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                            {friends.length === 0 ? 'Нет друзей' : 'Никого не найдено'}
                        </div>
                    ) : (
                        filtered.map((friend) => (
                            <button
                                key={friend.id}
                                onClick={() => {
                                    onSelectContact({
                                        userId: friend.id,
                                        username: friend.username,
                                        firstName: friend.firstName,
                                        lastName: friend.lastName,
                                        avatar: friend.avatar,
                                    });
                                    onClose();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors text-left"
                            >
                                <Avatar className="h-10 w-10 shrink-0">
                                    <AvatarImage src={friend.avatar} />
                                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                                        {(friend.firstName || friend.username || 'U').slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-foreground truncate">
                                        {friend.firstName || friend.username}
                                        {friend.lastName && ` ${friend.lastName}`}
                                    </div>
                                    <div className="text-xs text-muted-foreground">@{friend.username}</div>
                                </div>
                                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                            </button>
                        ))
                    )}
                </div>

                <div className="p-3 border-t border-border">
                    <button
                        onClick={onClose}
                        className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    );
}
