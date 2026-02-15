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
    replyToId?: string;
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

// Send message to chat
export async function sendMessage(data: SendMessageData): Promise<Message> {
    return api.post<Message>(`/chats/${data.chatId}/messages`, data);
}

// Sync Telegram dialogs
export async function syncTelegramDialogs(): Promise<{ success: boolean; dialogs: unknown[]; message: string }> {
    return api.get('/chats/sync/telegram');
}
