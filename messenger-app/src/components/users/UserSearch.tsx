import { useState, useCallback, useEffect, useRef } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Loader2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { sendFriendRequest } from '@/lib/api/friends';
import { useAuthStore } from '@/stores/authStore';

interface User {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    avatar?: string;
    bio?: string;
    isOnline?: boolean;
}

interface UserSearchProps {
    onSelectUser?: (user: User) => void;
    onAddFriend?: (user: User) => void;
    className?: string;
}

export function UserSearch({ onSelectUser, onAddFriend, className }: UserSearchProps) {
    const token = useAuthStore((s) => s.token);
    const [query, setQuery] = useState('');
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [sendingRequest, setSendingRequest] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const debouncedQuery = useDebounce(query, 300);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const searchUsers = useCallback(async (searchQuery: string) => {
        if (!searchQuery || searchQuery.length < 2) {
            setUsers([]);
            return;
        }

        setIsLoading(true);
        try {
            if (!token) {
                throw new Error('No authentication token');
            }
            
            const res = await fetch(`/api/users/search?query=${encodeURIComponent(searchQuery)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!res.ok) throw new Error('Search failed');
            
            const data = await res.json();
            setUsers(data.users || []);
        } catch (error) {
            console.error('Search error:', error);
            toast.error('Failed to search users');
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        searchUsers(debouncedQuery);
    }, [debouncedQuery, searchUsers]);

    const getInitials = (user: User) => {
        const name = user.firstName || user.username;
        return name.slice(0, 2).toUpperCase();
    };

    const handleSelect = (user: User) => {
        onSelectUser?.(user);
        setQuery('');
        setUsers([]);
        setShowResults(false);
    };

    const handleAddFriend = async (user: User, e: React.MouseEvent) => {
        e.stopPropagation();
        setSendingRequest(user.id);
        try {
            await sendFriendRequest(user.username);
            toast.success(`Friend request sent to @${user.username}`);
            onAddFriend?.(user);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to send request';
            toast.error(message);
        } finally {
            setSendingRequest(null);
        }
    };

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setShowResults(true);
                    }}
                    onFocus={() => setShowResults(true)}
                    placeholder="Поиск по имени..."
                    className="pl-9 h-9 sm:h-10 text-sm"
                />
            </div>

            {/* Results dropdown */}
            {showResults && (query.length >= 2 || users.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-[300px] overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-muted-foreground">
                            {query.length >= 2 ? 'Пользователи не найдены' : 'Введите минимум 2 символа'}
                        </div>
                    ) : (
                        <div className="py-1">
                            {users.map((user) => (
                                <div
                                    key={user.id}
                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors text-left cursor-pointer"
                                    onClick={() => handleSelect(user)}
                                >
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback className="bg-tg-primary/10 text-tg-primary text-sm">
                                            {getInitials(user)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">
                                            {user.firstName} {user.lastName}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            @{user.username}
                                        </p>
                                    </div>
                                    {user.isOnline && (
                                        <span className="h-2 w-2 rounded-full bg-tg-online" />
                                    )}
                                    <button
                                        onClick={(e) => handleAddFriend(user, e)}
                                        disabled={sendingRequest === user.id}
                                        className="p-1 hover:bg-tg-primary/10 rounded-full transition-colors"
                                        title="Добавить в друзья"
                                    >
                                        {sendingRequest === user.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <UserPlus className="h-4 w-4 text-tg-primary" />
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
