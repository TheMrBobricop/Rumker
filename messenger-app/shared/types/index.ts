// ========================================
// Shared Types (used by both client and server)
// ========================================

// Re-export from main types for shared usage
// These types are platform-agnostic and used across the stack

export type ChatType = 'private' | 'group' | 'channel';

export type MessageType =
    | 'text'
    | 'image'
    | 'video'
    | 'voice'
    | 'sticker'
    | 'file'
    | 'reply'
    | 'forward';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';

export interface SharedUser {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    avatar?: string;
    isOnline: boolean;
}

export interface SharedMessage {
    id: string;
    chatId: string;
    senderId: string;
    type: MessageType;
    content: string;
    mediaUrl?: string;
    replyTo?: string;
    timestamp: string; // ISO string for serialization
    status: MessageStatus;
    isEdited: boolean;
}

export interface SharedChat {
    id: string;
    type: ChatType;
    title?: string;
    avatar?: string;
    participantIds: string[];
}

// Socket event payloads
export interface SocketEventPayloads {
    'message:new': SharedMessage;
    'message:read': { messageId: string; chatId: string; userId: string };
    'message:edit': SharedMessage;
    'message:delete': { messageId: string; chatId: string };
    'typing:start': { userId: string; chatId: string };
    'typing:stop': { userId: string; chatId: string };
    'user:online': { userId: string; isOnline: boolean; lastSeen?: string };
}
