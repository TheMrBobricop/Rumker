import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getFriends, getFriendRequests, acceptFriendRequest, rejectFriendRequest, removeFriend, type Friend, type FriendRequest } from '@/lib/api/friends';
import { UserPlus, Check, X, UserMinus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { UserSearch } from './UserSearch';

interface FriendsListProps {
    className?: string;
}

export function FriendsList({ className }: FriendsListProps) {
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
            toast.success('Friend request accepted');
            loadData();
        } catch {
            toast.error('Failed to accept request');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (requestId: string) => {
        setProcessingId(requestId);
        try {
            await rejectFriendRequest(requestId);
            toast.success('Friend request rejected');
            loadData();
        } catch {
            toast.error('Failed to reject request');
        } finally {
            setProcessingId(null);
        }
    };

    const handleRemove = async (friendId: string) => {
        setProcessingId(friendId);
        try {
            await removeFriend(friendId);
            toast.success('Friend removed');
            loadData();
        } catch {
            toast.error('Failed to remove friend');
        } finally {
            setProcessingId(null);
        }
    };

    const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

    if (isLoading) {
        return (
            <Card className={cn('w-full', className)}>
                <CardContent className="p-4">
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('w-full', className)}>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Friends
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {/* Search Bar */}
                <div className="p-4 border-b">
                    <UserSearch onAddFriend={handleAddFriend} />
                </div>
                
                <Tabs defaultValue="friends" className="w-full">
                    <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="friends">
                            Friends ({friends.length})
                        </TabsTrigger>
                        <TabsTrigger value="requests">
                            Requests ({requests.length})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="friends" className="mt-0">
                        {friends.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No friends yet. Search for users to add them!
                            </div>
                        ) : (
                            <div className="divide-y">
                                {friends.map((friend) => (
                                    <div
                                        key={friend.id}
                                        className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                                    >
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={friend.friend.avatar} />
                                            <AvatarFallback className="bg-tg-primary/10 text-tg-primary">
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
                                                    <span className="ml-2 text-tg-online">online</span>
                                                )}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemove(friend.friend.id)}
                                            disabled={processingId === friend.friend.id}
                                        >
                                            {processingId === friend.friend.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <UserMinus className="h-4 w-4 text-red-500" />
                                            )}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="requests" className="mt-0">
                        {requests.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No pending friend requests
                            </div>
                        ) : (
                            <div className="divide-y">
                                {requests.map((request) => (
                                    <div
                                        key={request.id}
                                        className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                                    >
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={request.sender?.avatar} />
                                            <AvatarFallback className="bg-tg-primary/10 text-tg-primary">
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
                                                <p className="text-xs text-muted-foreground mt-1 italic">
                                                    "{request.message}"
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleAccept(request.id)}
                                                disabled={processingId === request.id}
                                                className="hover:bg-green-100"
                                            >
                                                {processingId === request.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Check className="h-4 w-4 text-green-600" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleReject(request.id)}
                                                disabled={processingId === request.id}
                                                className="hover:bg-red-100"
                                            >
                                                <X className="h-4 w-4 text-red-600" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
