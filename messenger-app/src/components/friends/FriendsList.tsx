import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getFriends, getFriendRequests, acceptFriendRequest, rejectFriendRequest, removeFriend, type Friend, type FriendRequest } from '@/lib/api/friends';
import { UserPlus, Check, X, UserMinus, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { UserSearch } from './UserSearch';

interface FriendsListProps {
    className?: string;
    onMessageFriend?: (userId: string) => void;
}

export function FriendsList({ className, onMessageFriend }: FriendsListProps) {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const loadData = async () => {
        try {
            const [friendsData, requestsData] = await Promise.all([
                getFriends(),
                getFriendRequests(),
            ]);
            setFriends(friendsData);
            setRequests(requestsData);
        } catch (error) {
            console.error('Failed to load friends:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddFriend = () => {
        loadData();
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleAccept = async (requestId: string) => {
        setProcessingId(requestId);
        try {
            await acceptFriendRequest(requestId);
            toast.success('Заявка принята');
            loadData();
        } catch {
            toast.error('Не удалось принять заявку');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (requestId: string) => {
        setProcessingId(requestId);
        try {
            await rejectFriendRequest(requestId);
            toast.success('Заявка отклонена');
            loadData();
        } catch {
            toast.error('Не удалось отклонить заявку');
        } finally {
            setProcessingId(null);
        }
    };

    const handleRemove = async (friendId: string) => {
        setProcessingId(friendId);
        try {
            await removeFriend(friendId);
            toast.success('Друг удалён');
            loadData();
        } catch {
            toast.error('Не удалось удалить друга');
        } finally {
            setProcessingId(null);
        }
    };

    const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

    if (isLoading) {
        return (
            <div className={cn('flex items-center justify-center py-8', className)}>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className={cn('flex flex-col h-full', className)}>
            {/* Search Bar */}
            <div className="px-3 py-2 border-b border-border shrink-0">
                <UserSearch onAddFriend={handleAddFriend} />
            </div>

            <Tabs defaultValue="friends" className="flex flex-col flex-1 min-h-0">
                <TabsList className="w-full grid grid-cols-2 shrink-0 rounded-none border-b border-border bg-transparent h-auto p-0">
                    <TabsTrigger
                        value="friends"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-tg-primary data-[state=active]:bg-transparent data-[state=active]:text-tg-primary py-2 text-sm"
                    >
                        Друзья ({friends.length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="requests"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-tg-primary data-[state=active]:bg-transparent data-[state=active]:text-tg-primary py-2 text-sm"
                    >
                        Заявки ({requests.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="friends" className="mt-0 flex-1 overflow-y-auto">
                    {friends.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-muted-foreground">
                            <UserPlus className="h-10 w-10 mb-3 text-muted-foreground/40" />
                            <p className="text-sm">Нет друзей</p>
                            <p className="text-xs mt-1 text-muted-foreground/70">Найдите пользователей через поиск выше</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {friends.map((friend) => (
                                <div
                                    key={friend.id}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors"
                                >
                                    <Avatar className="h-10 w-10 shrink-0">
                                        <AvatarImage src={friend.friend.avatar} />
                                        <AvatarFallback className="bg-tg-primary/10 text-tg-primary text-sm">
                                            {getInitials(friend.friend.firstName || friend.friend.username)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">
                                            {friend.friend.firstName} {friend.friend.lastName}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            @{friend.friend.username}
                                            {friend.friend.isOnline && (
                                                <span className="ml-2 text-green-500">online</span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        {onMessageFriend && (
                                            <button
                                                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-tg-primary/10 transition-colors"
                                                onClick={() => onMessageFriend(friend.friend.id)}
                                                title="Написать"
                                            >
                                                <MessageSquare className="h-4 w-4 text-tg-primary" />
                                            </button>
                                        )}
                                        <button
                                            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                            onClick={() => handleRemove(friend.friend.id)}
                                            disabled={processingId === friend.friend.id}
                                        >
                                            {processingId === friend.friend.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <UserMinus className="h-4 w-4 text-red-500" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="requests" className="mt-0 flex-1 overflow-y-auto">
                    {requests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-muted-foreground">
                            <p className="text-sm">Нет заявок</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {requests.map((request) => (
                                <div
                                    key={request.id}
                                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors"
                                >
                                    <Avatar className="h-10 w-10 shrink-0">
                                        <AvatarImage src={request.sender?.avatar} />
                                        <AvatarFallback className="bg-tg-primary/10 text-tg-primary text-sm">
                                            {getInitials(request.sender?.firstName || request.sender?.username || '?')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">
                                            {request.sender?.firstName} {request.sender?.lastName}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            @{request.sender?.username}
                                        </p>
                                        {request.message && (
                                            <p className="text-xs text-muted-foreground mt-0.5 italic truncate">
                                                &quot;{request.message}&quot;
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <button
                                            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
                                            onClick={() => handleAccept(request.id)}
                                            disabled={processingId === request.id}
                                        >
                                            {processingId === request.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Check className="h-4 w-4 text-green-600" />
                                            )}
                                        </button>
                                        <button
                                            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                            onClick={() => handleReject(request.id)}
                                            disabled={processingId === request.id}
                                        >
                                            <X className="h-4 w-4 text-red-600" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
