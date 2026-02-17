// Chat API functions
import { api } from './client';
import type { Chat, Message } from '@/types';

export interface CreateChatData {
    type: 'private' | 'group' | 'channel';
    name?: string;
    participantIds?: string[];
}

export interface SendMessageData {
    chatId: string;
    content: string;
    type?: 'text' | 'image' | 'video' | 'voice' | 'file';
    fileUrl?: string;
    replyToId?: string;
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

// Mark messages as read
export async function markMessagesRead(chatId: string, messageId: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(`/chats/${chatId}/read`, { messageId });
}
