import { api } from './client';

export interface Friend {
    id: string;
    friend: {
        id: string;
        username: string;
        firstName: string;
        lastName?: string;
        avatar?: string;
        isOnline?: boolean;
        lastSeen?: string;
    };
    since: string;
}

export interface FriendRequest {
    id: string;
    senderId: string;
    receiverId: string;
    status: 'pending' | 'accepted' | 'rejected';
    message?: string;
    createdAt: string;
    sender?: {
        id: string;
        username: string;
        firstName: string;
        lastName?: string;
        avatar?: string;
        isOnline?: boolean;
        lastSeen?: string;
    };
    receiver?: {
        id: string;
        username: string;
        firstName: string;
        lastName?: string;
        avatar?: string;
        isOnline?: boolean;
        lastSeen?: string;
    };
}

export async function getFriends(): Promise<Friend[]> {
    const response = await api.get<{ friends: Friend[] }>('/friends');
    return response.friends;
}

export async function getFriendRequests(): Promise<FriendRequest[]> {
    const response = await api.get<{ requests: FriendRequest[] }>('/friends/requests');
    return response.requests;
}

export async function getSentFriendRequests(): Promise<FriendRequest[]> {
    const response = await api.get<{ requests: FriendRequest[] }>('/friends/sent-requests');
    return response.requests;
}

export async function sendFriendRequest(username: string, message?: string): Promise<{ message: string; request: FriendRequest }> {
    return api.post<{ message: string; request: FriendRequest }>('/friends/request', {
        username,
        message,
    });
}

export async function acceptFriendRequest(requestId: string): Promise<{ message: string }> {
    return api.post<{ message: string }>(`/friends/accept/${requestId}`, {});
}

export async function rejectFriendRequest(requestId: string): Promise<{ message: string }> {
    return api.post<{ message: string }>(`/friends/reject/${requestId}`, {});
}

export async function removeFriend(friendId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/friends/${friendId}`);
}

export async function cancelFriendRequest(requestId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/friends/request/${requestId}`);
}
