// Chat API functions
import { api } from './client';
import type { Chat, Message, ReadReceipt } from '@/types';

export interface CreateChatData {
    type: 'private' | 'group' | 'channel';
    name?: string;
    description?: string;
    avatar?: string;
    participantIds?: string[];
}

export interface SendMessageData {
    chatId: string;
    content: string;
    type?: 'text' | 'image' | 'video' | 'voice' | 'file' | 'poll' | 'location' | 'contact';
    fileUrl?: string;
    replyToId?: string;
    forwardedFromId?: string;
    forwardedFromName?: string;
    metadata?: Record<string, unknown>;
}

export interface UploadResult {
    url: string;
    fileName: string;
    mimeType: string;
    size: number;
}

// Get all chats for current user
export async function getChats(): Promise<Chat[]> {
    return api.get<Chat[]>('/chats');
}

// Get messages for a specific chat
export async function getMessages(chatId: string, limit?: number, offset?: number): Promise<Message[]> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    
    const query = params.toString();
    return api.get<Message[]>(`/chats/${chatId}/messages${query ? `?${query}` : ''}`);
}

// Create new chat
export async function createChat(data: CreateChatData): Promise<Chat> {
    return api.post<Chat>('/chats', data);
}

// Find or create a private chat with a specific user
export async function findOrCreatePrivateChat(userId: string): Promise<Chat> {
    return api.post<Chat>('/chats/private', { userId });
}

// Send message to chat
export async function sendMessage(data: SendMessageData): Promise<Message> {
    return api.post<Message>(`/chats/${data.chatId}/messages`, data);
}

// Sync Telegram dialogs
export async function syncTelegramDialogs(): Promise<{ success: boolean; dialogs: unknown[]; message: string }> {
    return api.get('/chats/sync/telegram');
}

// Edit a message
export async function editMessage(chatId: string, messageId: string, content: string): Promise<Message> {
    return api.patch<Message>(`/chats/${chatId}/messages/${messageId}`, { content });
}

// Delete a message (soft delete)
export async function deleteMessage(chatId: string, messageId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/chats/${chatId}/messages/${messageId}`);
}

// Upload a file for chat media
export async function uploadChatFile(file: File): Promise<UploadResult> {
    return api.uploadFile('/upload', file) as Promise<UploadResult>;
}

// Get read receipts for a chat
export async function getReadReceipts(chatId: string): Promise<ReadReceipt[]> {
    return api.get<ReadReceipt[]>(`/chats/${chatId}/read-receipts`);
}

// Mark messages as read
export async function markMessagesRead(chatId: string, messageId: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(`/chats/${chatId}/read`, { messageId });
}

// Pin a message
export async function pinMessage(chatId: string, messageId: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(`/chats/${chatId}/messages/${messageId}/pin`, {});
}

// Unpin a message
export async function unpinMessage(chatId: string, messageId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/chats/${chatId}/messages/${messageId}/pin`);
}

// Get pinned messages for a chat
export async function getPinnedMessages(chatId: string): Promise<Message[]> {
    return api.get<Message[]>(`/chats/${chatId}/pinned`);
}

// Unpin all messages in a chat
export async function unpinAllMessages(chatId: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(`/chats/${chatId}/unpin-all`, {});
}

// Search messages in a chat
export async function searchMessages(chatId: string, query: string): Promise<Message[]> {
    return api.get<Message[]>(`/chats/${chatId}/messages/search?q=${encodeURIComponent(query)}`);
}

// Get messages around a specific message (for search jump-to-message)
export async function getMessagesAround(chatId: string, messageId: string, count = 25): Promise<Message[]> {
    return api.get<Message[]>(`/chats/${chatId}/messages/${messageId}/around?count=${count}`);
}

// Get shared media for a chat
export async function getChatMedia(chatId: string, type: 'image' | 'video' | 'file' | 'voice' = 'image'): Promise<Message[]> {
    return api.get<Message[]>(`/chats/${chatId}/media?type=${type}`);
}

// Delete a chat (leave + delete if empty)
export async function deleteChat(chatId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/chats/${chatId}`);
}

// Pin a chat
export async function pinChat(chatId: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(`/chats/${chatId}/pin`, {});
}

// Unpin a chat
export async function unpinChat(chatId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/chats/${chatId}/pin`);
}

// Mute a chat
export async function muteChat(chatId: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(`/chats/${chatId}/mute`, {});
}

// Unmute a chat
export async function unmuteChat(chatId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/chats/${chatId}/mute`);
}

// Clear all messages in a chat
export async function clearChat(chatId: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(`/chats/${chatId}/clear`, {});
}

// Get chat participants (for group/channel info)
export interface ChatParticipantsResponse {
    chatId: string;
    name: string | null;
    type: string;
    description?: string | null;
    avatar?: string | null;
    createdAt: string;
    participants: Array<{
        userId: string;
        chatId: string;
        role: string;
        joinedAt: string;
        user: {
            id: string;
            username: string;
            firstName: string;
            lastName?: string;
            avatar?: string;
            isOnline?: boolean;
            lastSeen?: string;
        } | null;
    }>;
}

export async function getChatParticipants(chatId: string): Promise<ChatParticipantsResponse> {
    return api.get<ChatParticipantsResponse>(`/chats/${chatId}/participants`);
}

// Update chat info (name, description, avatar) пїЅ requires can_change_info permission
export interface UpdateChatData {
    name?: string;
    description?: string | null;
    avatar?: string | null;
}

export async function updateChat(chatId: string, data: UpdateChatData): Promise<{ id: string; name: string; description: string | null; avatar: string | null }> {
    return api.patch<{ id: string; name: string; description: string | null; avatar: string | null }>(`/chats/${chatId}`, data);
}

// Toggle reaction on a message
export async function toggleReaction(chatId: string, messageId: string, emoji: string): Promise<{ success: boolean; action: 'add' | 'remove' }> {
    return api.post<{ success: boolean; action: 'add' | 'remove' }>(`/chats/${chatId}/messages/${messageId}/reactions`, { emoji });
}

// Add members to a group/channel
export async function addChatMembers(chatId: string, userIds: string[]): Promise<{ success: boolean; added: number }> {
    return api.post<{ success: boolean; added: number }>(`/chats/${chatId}/members`, { userIds });
}

// ---- Admin Rights ----

import type { AdminRights } from '@/types';

export async function updateMemberRole(
    chatId: string,
    userId: string,
    role: 'admin' | 'member',
    title?: string | null,
    adminRights?: AdminRights
): Promise<{ success: boolean }> {
    return api.put<{ success: boolean }>(`/chats/${chatId}/members/${userId}/role`, { role, title, adminRights });
}

export async function updateMemberTitle(
    chatId: string,
    userId: string,
    title: string | null
): Promise<{ success: boolean }> {
    return api.put<{ success: boolean }>(`/chats/${chatId}/members/${userId}/title`, { title });
}

export async function kickMember(
    chatId: string,
    userId: string,
    ban: boolean = false
): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/chats/${chatId}/members/${userId}${ban ? '?ban=true' : ''}`);
}


