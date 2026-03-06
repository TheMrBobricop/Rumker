
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

export interface AdminRights {
    can_change_info: boolean;
    can_delete_messages: boolean;
    can_ban_users: boolean;
    can_invite_users: boolean;
    can_pin_messages: boolean;
    can_promote_members: boolean;
    can_manage_voice_channels: boolean;
}

export const DEFAULT_ADMIN_RIGHTS: AdminRights = {
    can_change_info: false,
    can_delete_messages: false,
    can_ban_users: false,
    can_invite_users: false,
    can_pin_messages: false,
    can_promote_members: false,
    can_manage_voice_channels: false,
};

export interface Chat {
    id: string;
    type: ChatType;
    title?: string;
    description?: string;
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
    title?: string;
    adminRights?: AdminRights;
    isBanned?: boolean;
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
    | 'forward'
    | 'poll'
    | 'location'
    | 'contact';

// ---- Poll Types ----
export interface PollOption {
    id: string;
    text: string;
    voterCount: number;
    voters?: string[]; // userIds who voted
}

export interface PollData {
    id: string;
    question: string;
    options: PollOption[];
    totalVotes: number;
    isAnonymous: boolean;
    isMultipleChoice: boolean;
    isClosed: boolean;
    createdBy: string;
    votedOptionIds?: string[]; // current user's votes
}

// ---- Location Types ----
export interface LocationData {
    latitude: number;
    longitude: number;
    address?: string;
}

// ---- Shared Contact Types ----
export interface SharedContact {
    userId: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
}

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
    forwardedFrom?: {
        id?: string;
        name: string;
        avatar?: string;
    };
    timestamp: Date;
    status: MessageStatus;
    isEdited: boolean;
    isPinned?: boolean;
    pinnedAt?: Date;
    pinnedBy?: string;
    reactions?: MessageReaction[];
    metadata?: Record<string, unknown>;
    pollData?: PollData;
    locationData?: LocationData;
    contactData?: SharedContact;
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

// ---- Call Types ----
export type CallStatus = 'idle' | 'ringing' | 'connecting' | 'active' | 'ended';
export type CallType = 'private' | 'group';

export interface CallParticipant {
    userId: string;
    username: string;
    firstName?: string;
    avatar?: string;
    isMuted: boolean;
    isDeafened?: boolean;
    volume: number; // 0-200 (percentage)
}

export interface ActiveCall {
    callId: string;
    chatId: string;
    chatTitle: string;
    type: CallType;
    status: CallStatus;
    participants: CallParticipant[];
    startedAt: Date;
    initiatorId: string;
}

export interface IncomingCall {
    callId: string;
    chatId: string;
    chatTitle: string;
    callerId: string;
    callerName: string;
    callerAvatar?: string;
    type: CallType;
}

// ---- Voice Channel Types ----
export interface VoiceChannel {
    id: string;
    name: string;
    description?: string;
    position: number;
    categoryId: string;
    participants: VoiceChannelParticipant[];
    maxParticipants?: number;
    isLocked: boolean;
    createdAt: Date;
    createdBy: string;
}

export interface VoiceChannelParticipant {
    userId: string;
    username: string;
    firstName?: string;
    avatar?: string;
    isMuted: boolean;
    isDeafened: boolean;
    isSpeaking: boolean;
    joinedAt: Date;
}

export interface VoiceChannelCategory {
    id: string;
    name: string;
    position: number;
    channels: VoiceChannel[];
}

export interface AudioDevice {
    deviceId: string;
    label: string;
    kind: 'audioinput' | 'audiooutput';
}

export type VoiceInputMode = 'voiceActivity' | 'pushToTalk';

export type ConnectionQualityLevel = 'excellent' | 'good' | 'fair' | 'poor';

export interface ConnectionStats {
    rtt: number;           // ms
    packetLoss: number;    // 0-100 %
    bitrate: number;       // kbps
    jitter: number;        // ms
}

export interface VoiceSettings {
    inputDeviceId?: string;
    outputDeviceId?: string;
    inputVolume: number; // 0-200
    outputVolume: number; // 0-200
    noiseSuppression: boolean;
    echoCancellation: boolean;
    autoGainControl: boolean;
    // PTT
    inputMode: VoiceInputMode;
    pttKey: string;           // key code, default 'Space'
    pttReleaseDelay: number;  // 0-2000 ms
    // Noise gate
    noiseGateEnabled: boolean;
    noiseGateThreshold: number; // 0-100
    // Screen share quality
    screenShareQuality: 'auto' | '720p' | '1080p' | 'source';
    screenShareFps: 15 | 30 | 60;
    // Attenuation (duck other users when priority speaker talks)
    attenuationEnabled: boolean;
    attenuationAmount: number; // 0-100 (percentage to reduce)
}

export interface SoundboardSound {
    id: string;
    chatId: string;
    name: string;
    category: string;
    fileUrl: string;
    durationMs: number;
    uploadedBy: string;
    isDefault: boolean;
    createdAt: Date;
    isFavorite?: boolean;
}

export interface VoiceAdminAction {
    type: 'server-mute' | 'server-deafen' | 'disconnect' | 'move';
    targetUserId: string;
    channelId: string;
    targetChannelId?: string; // for move
}
