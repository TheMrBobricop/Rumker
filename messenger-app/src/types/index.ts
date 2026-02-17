
// ========================================
// Core Types for Messenger App
// ========================================

// ---- User Types ----
export interface UserProfile {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    bio?: string;
    avatar?: string;
    email?: string;
    phone?: string;
    createdAt: Date;
    lastSeen?: Date;
    isOnline: boolean;
}

export type User = UserProfile;

// ---- Chat Types ----
export type ChatType = 'private' | 'group' | 'channel';

export interface Chat {
    id: string;
    type: ChatType;
    title?: string;
    avatar?: string;
    createdAt: Date;
    lastMessage?: Message;
    unreadCount: number;
    participants: ChatParticipant[];
    isPinned: boolean;
    isMuted: boolean;
}

export interface ChatParticipant {
    userId: string;
    chatId: string;
    role: 'admin' | 'member' | 'owner';
    joinedAt: Date;
    user: UserProfile;
}

// ---- Message Types ----
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

export interface MediaMetadata {
    duration?: number;
    size: number;
    mimeType: string;
    thumbnail?: string;
    width?: number;
    height?: number;
    fileName?: string;
}

export interface MessageReaction {
    emoji: string;
    userIds: string[];
}

export interface Message {
    id: string;
    chatId: string;
    senderId: string;
    type: MessageType;
    content: string;
    mediaUrl?: string;
    mediaMetadata?: MediaMetadata;
    replyTo?: string;
    replyToMessage?: Message;
    forwardedFrom?: string;
    timestamp: Date;
    status: MessageStatus;
    isEdited: boolean;
    reactions?: MessageReaction[];
    sender?: {
        id: string;
        username: string;
        firstName?: string;
        lastName?: string;
        avatar?: string;
    };
}

// ---- Settings Types ----
export interface ChatBackground {
    type: 'color' | 'image' | 'gradient';
    value: string;
    opacity: number;
    blur?: number; // 0-20px
}

export interface MessageBubbleSettings {
    borderRadius: number; // 0-20px
    fontSize: number; // 12-20px
    outgoingColor: string;
    incomingColor: string;
    outgoingTextColor: string;
    incomingTextColor: string;
}

export interface ChatAppearanceSettings {
    chatBackground: ChatBackground;
    messageBubbles: MessageBubbleSettings;
    theme: 'light' | 'dark' | 'auto';
    themePreset?: string;
    compactMode: boolean;
    showAvatars: boolean;
    showTimeStamps: boolean;
    showTails?: boolean;
}

export interface CacheSettings {
    maxSize: number; // в MB
    autoClean: boolean;
    cacheVideos: boolean;
    cacheImages: boolean;
    expirationDays: number;
    clearCacheOnExit: boolean;
}

export interface NotificationSettings {
    enabled: boolean;
    sound: boolean;
    preview: boolean;
    vibrate: boolean;
}

export interface PrivacySettings {
    lastSeen: 'everyone' | 'contacts' | 'nobody';
    profilePhoto: 'everyone' | 'contacts' | 'nobody';
    phoneNumber: 'everyone' | 'contacts' | 'nobody';
}

// ---- Sticker Types ----
export interface StickerPack {
    id: string;
    name: string;
    author: string;
    stickers: Sticker[];
    thumbnail: string;
}

export interface Sticker {
    id: string;
    emoji: string;
    imageUrl: string;
    packId: string;
}

// ---- Socket Events ----
export interface SocketEvents {
    'message:new': (message: Message) => void;
    'message:read': (data: { messageId: string; chatId: string }) => void;
    'message:edit': (message: Message) => void;
    'message:delete': (data: { messageId: string; chatId: string }) => void;
    'typing:start': (data: { userId: string; chatId: string }) => void;
    'typing:stop': (data: { userId: string; chatId: string }) => void;
    'user:online': (data: { userId: string; isOnline: boolean }) => void;
    'chat:update': (chat: Chat) => void;
}

// ---- API Response Types ----
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

// ---- Platform Adapter Types ----
export interface MessengerAdapter {
    sendMessage(chatId: string, text: string): Promise<void>;
    sendMedia(chatId: string, media: File): Promise<void>;
    getUpdates(): Promise<Message[]>;
}

export interface UnifiedMessage extends Message {
    platform: 'web' | 'telegram';
    platformMessageId?: number;
}
