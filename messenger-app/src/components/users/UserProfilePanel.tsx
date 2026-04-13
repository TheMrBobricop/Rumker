import { useEffect, useState, useCallback, useRef } from 'react';
import { getUserById } from '@/lib/api/users';
import { getChatMedia, deleteMessage as apiDeleteMessage, createChat } from '@/lib/api/chats';
import { MediaViewer } from '@/components/media/MediaViewer';
import type { MediaItem } from '@/components/media/MediaViewer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetTitle,
} from '@/components/ui/sheet';
import { MessageSquare, Phone, AtSign, User, X, ImageIcon, FileText, LinkIcon, Play, ExternalLink, Search as SearchIcon, Trash2, Download, UserPlus, Pencil } from 'lucide-react';
import type { UserProfile, Message } from '@/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { addChatMembers } from '@/lib/api/chats';

interface UserProfilePanelProps {
    userId: string | null;
    chatId: string | null;
    sourceChatType?: 'private' | 'group' | 'channel';
    open: boolean;
    onClose: () => void;
    onSendMessage?: (userId: string) => void;
    onScrollToMessage?: (messageId: string) => void;
    inline?: boolean;
}

interface MediaContextMenuState {
    message: Message;
    x: number;
    y: number;
}

/** Extract all URLs from message text */
function extractUrls(text: string): string[] {
    const regex = /https?:\/\/[^\s<>"')\]]+/g;
    return text.match(regex) || [];
}

export function UserProfilePanel({ userId, chatId, sourceChatType, open, onClose, onSendMessage, onScrollToMessage, inline }: UserProfilePanelProps) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeSection, setActiveSection] = useState<'media' | 'files' | 'links'>('media');

    // Shared content
    const [mediaMessages, setMediaMessages] = useState<Message[]>([]);
    const [fileMessages, setFileMessages] = useState<Message[]>([]);
    const [linkMessages, setLinkMessages] = useState<{ url: string; content: string; timestamp: Date }[]>([]);
    const [mediaLoading, setMediaLoading] = useState(false);

    // Add to group
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [addingToGroup, setAddingToGroup] = useState(false);
    const chats = useChatStore((s) => s.chats);

    // Local profile override (nickname visible only to current user)
    const [showLocalEdit, setShowLocalEdit] = useState(false);
    const [localNickname, setLocalNickname] = useState('');
    const localOverride = useSettingsStore((s) => s.localProfileOverrides[userId || '']);
    const setLocalOverride = useSettingsStore((s) => s.setLocalProfileOverride);
    const removeLocalOverride = useSettingsStore((s) => s.removeLocalProfileOverride);

    // Media viewer state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);

    // Media context menu
    const [mediaCtx, setMediaCtx] = useState<MediaContextMenuState | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentUserId = useAuthStore((s) => s.user?.id);

    const handleMediaContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
        e.preventDefault();
        e.stopPropagation();
        setMediaCtx({ message: msg, x: e.clientX, y: e.clientY });
    }, []);

    const handleMediaLongPress = useCallback((msg: Message, e: React.TouchEvent) => {
        longPressTimerRef.current = setTimeout(() => {
            const touch = e.touches[0];
            setMediaCtx({ message: msg, x: touch.clientX, y: touch.clientY });
        }, 500);
    }, []);

    const handleMediaTouchEnd = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const handleMediaShowInChat = useCallback(() => {
        if (!mediaCtx) return;
        onScrollToMessage?.(mediaCtx.message.id);
        onClose();
        setMediaCtx(null);
    }, [mediaCtx, onScrollToMessage, onClose]);

    const handleMediaDelete = useCallback(async () => {
        if (!mediaCtx || !mediaCtx.message.chatId) return;
        try {
            await apiDeleteMessage(mediaCtx.message.chatId, mediaCtx.message.id);
            setMediaMessages(prev => prev.filter(m => m.id !== mediaCtx.message.id));
            toast.success('Удалено');
        } catch {
            toast.error('Не удалось удалить');
        }
        setMediaCtx(null);
    }, [mediaCtx]);

    const handleMediaDownload = useCallback(() => {
        if (!mediaCtx?.message.mediaUrl) return;
        const a = document.createElement('a');
        a.href = mediaCtx.message.mediaUrl;
        a.download = '';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setMediaCtx(null);
    }, [mediaCtx]);

    const handleAddToGroup = useCallback(async (targetChatId: string) => {
        if (!userId) return;
        setAddingToGroup(true);
        try {
            const result = await addChatMembers(targetChatId, [userId]);
            if (result.added > 0) {
                toast.success('Участник добавлен');
            } else {
                toast.info('Уже в группе');
            }
            setShowGroupPicker(false);
        } catch {
            toast.error('Не удалось добавить');
        } finally {
            setAddingToGroup(false);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId || !open) return;
        setLoading(true);
        setActiveSection('media');
        setMediaMessages([]);
        setFileMessages([]);
        setLinkMessages([]);
        getUserById(userId)
            .then(setUser)
            .catch((err) => console.error('Failed to load user profile:', err))
            .finally(() => setLoading(false));
    }, [userId, open]);

    // Load shared content when switching tabs
    useEffect(() => {
        if (!open || !chatId) return;

        // Determine effective chatId from the store
        const effectiveChatId = chatId || findChatIdForUser(userId);
        if (!effectiveChatId) return;

        if (activeSection === 'media') {
            setMediaLoading(true);
            Promise.all([
                getChatMedia(effectiveChatId, 'image'),
                getChatMedia(effectiveChatId, 'video'),
            ])
                .then(([images, videos]) => setMediaMessages([...images, ...videos]))
                .catch(() => setMediaMessages([]))
                .finally(() => setMediaLoading(false));
        }

        if (activeSection === 'files') {
            setMediaLoading(true);
            getChatMedia(effectiveChatId, 'file')
                .then(setFileMessages)
                .catch(() => setFileMessages([]))
                .finally(() => setMediaLoading(false));
        }

        if (activeSection === 'links') {
            const chatMessages = useChatStore.getState().messages[effectiveChatId] || [];
            const links: { url: string; content: string; timestamp: Date }[] = [];
            for (const msg of chatMessages) {
                if (msg.content) {
                    const urls = extractUrls(msg.content);
                    for (const url of urls) {
                        links.push({ url, content: msg.content, timestamp: msg.timestamp });
                    }
                }
            }
            setLinkMessages(links);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection, open, chatId]);

    function findChatIdForUser(uid: string | null): string | null {
        if (!uid) return null;
        const chats = useChatStore.getState().chats;
        const chat = chats.find(c => c.type === 'private' && c.participants.some(p => p.userId === uid));
        return chat?.id || null;
    }

    async function findOrCreatePrivateChat(uid: string): Promise<string | null> {
        // Ищем существующий приватный чат
        const existingChatId = findChatIdForUser(uid);
        if (existingChatId) {
            return existingChatId;
        }
        
        // Если чата нет, создаем новый
        try {
            const newChat = await createChat({
                type: 'private',
                participantIds: [uid]
            });
            
            // Добавляем новый чат в store
            const chatStore = useChatStore.getState();
            chatStore.setChats([...chatStore.chats, newChat]);
            
            return newChat.id;
        } catch (error) {
            console.error('Failed to create private chat:', error);
            toast.error('Не удалось создать чат');
            return null;
        }
    }

    const getInitials = (u: UserProfile) => {
        const first = u.firstName?.[0] || '';
        const last = u.lastName?.[0] || '';
        return (first + last).toUpperCase() || u.username.slice(0, 2).toUpperCase();
    };

    const formatLastSeen = (date?: Date | string) => {
        if (!date) return 'Неизвестно';
        return format(new Date(date), 'dd.MM.yyyy HH:mm');
    };

    const sections = [
        { key: 'media' as const, label: 'Медиа' },
        { key: 'files' as const, label: 'Файлы' },
        { key: 'links' as const, label: 'Ссылки' },
    ];

    const mediaViewerItems: MediaItem[] = mediaMessages
        .filter(m => m.type === 'image' || m.type === 'video')
        .map(m => ({
            id: m.id,
            src: m.mediaUrl!,
            type: m.type as 'image' | 'video',
            senderName: m.sender ? (m.sender.firstName || m.sender.username) : undefined,
            timestamp: m.timestamp,
        }));

    const content = (
        <>
                {loading && (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-primary" />
                    </div>
                )}

                {!loading && user && (
                    <div className="flex flex-col h-full overflow-y-auto">
                        {/* Header area — Telegram style */}
                        <div className="relative bg-card pt-3 pb-4 flex flex-col items-center animate-profile-header-in">
                            {/* Close button — top left */}
                            <button
                                onClick={onClose}
                                className="absolute top-3 left-3 h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-tg-text-secondary hover:text-tg-text transition-all z-10"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            {/* Edit pencil — top right */}
                            {userId !== currentUserId && (
                                <button
                                    onClick={() => {
                                        setLocalNickname(localOverride?.nickname || '');
                                        setShowLocalEdit(!showLocalEdit);
                                    }}
                                    className="absolute top-3 right-3 h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-tg-text-secondary hover:text-tg-text transition-all z-10"
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                            )}

                            {/* Avatar */}
                            <div className="relative animate-fade-scale-in mt-6" style={{ animationDelay: '80ms' }}>
                                <Avatar className="h-24 w-24 shadow-md">
                                    <AvatarImage src={user.avatar} />
                                    <AvatarFallback className="bg-tg-primary/15 text-tg-primary text-2xl font-medium">
                                        {getInitials(user)}
                                    </AvatarFallback>
                                </Avatar>
                                {user.isOnline && (
                                    <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-tg-online border-2 border-card animate-online-pulse" />
                                )}
                            </div>

                            {/* Name */}
                            <h2 className="text-foreground text-lg font-semibold mt-3 px-4 text-center animate-fade-slide-in" style={{ animationDelay: '100ms' }}>
                                {localOverride?.nickname || `${user.firstName} ${user.lastName || ''}`.trim()}
                            </h2>
                            {localOverride?.nickname && (
                                <p className="text-muted-foreground text-xs mt-0.5 animate-fade-slide-in" style={{ animationDelay: '120ms' }}>
                                    {user.firstName} {user.lastName || ''} · локальное имя
                                </p>
                            )}
                            {/* Online status */}
                            <p className="text-sm mt-0.5 animate-fade-slide-in" style={{ animationDelay: '140ms' }}>
                                {user.isOnline ? (
                                    <span className="text-tg-online">в сети</span>
                                ) : (
                                    <span className="text-muted-foreground">был(а) {formatLastSeen(user.lastSeen)}</span>
                                )}
                            </p>
                        </div>

                        {/* Local nickname edit form */}
                        {showLocalEdit && userId && (
                            <div className="px-4 py-3 bg-card border-b border-tg-divider animate-fade-slide-in">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Локальное имя (видно только вам)
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={localNickname}
                                        onChange={e => setLocalNickname(e.target.value)}
                                        maxLength={50}
                                        placeholder="Введите имя..."
                                        className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-muted/50 border border-border focus:border-tg-primary outline-none transition-colors"
                                    />
                                    <Button
                                        size="sm"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => {
                                            if (localNickname.trim()) {
                                                setLocalOverride(userId, { nickname: localNickname.trim() });
                                                toast.success('Локальное имя сохранено');
                                            } else {
                                                removeLocalOverride(userId);
                                                toast.success('Локальное имя удалено');
                                            }
                                            setShowLocalEdit(false);
                                        }}
                                    >
                                        Сохранить
                                    </Button>
                                </div>
                                {localOverride?.nickname && (
                                    <button
                                        className="text-xs text-red-500 mt-1.5 hover:underline"
                                        onClick={() => {
                                            removeLocalOverride(userId);
                                            setLocalNickname('');
                                            setShowLocalEdit(false);
                                            toast.success('Локальное имя удалено');
                                        }}
                                    >
                                        Удалить локальное имя
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Info list items — Telegram style */}
                        <div className="bg-card border-t border-tg-divider">
                            {user.phone && (
                                <button
                                    onClick={() => { navigator.clipboard.writeText(user.phone!); toast.success('Телефон скопирован'); }}
                                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-tg-hover transition-colors text-left animate-profile-item-in"
                                    style={{ animationDelay: '160ms' }}
                                >
                                    <Phone className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                        <div className="text-xs text-tg-text-secondary">Телефон</div>
                                        <div className="text-sm text-tg-primary">{user.phone}</div>
                                    </div>
                                </button>
                            )}

                            <button
                                onClick={() => { navigator.clipboard.writeText(`@${user.username}`); toast.success('Юзернейм скопирован'); }}
                                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-tg-hover transition-colors text-left animate-profile-item-in"
                                style={{ animationDelay: '200ms' }}
                            >
                                <AtSign className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-xs text-tg-text-secondary">Имя пользователя</div>
                                    <div className="text-sm text-tg-primary">@{user.username}</div>
                                </div>
                            </button>

                            {user.bio && (
                                <div className="flex items-start gap-3 px-4 py-3 animate-profile-item-in" style={{ animationDelay: '240ms' }}>
                                    <User className="h-5 w-5 text-tg-text-secondary mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                        <div className="text-xs text-tg-text-secondary">О себе</div>
                                        <div className="text-sm text-tg-text break-words">{user.bio}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action list items */}
                        <div className="bg-card border-t border-tg-divider mt-2">
                            {(onSendMessage || sourceChatType === 'group' || sourceChatType === 'channel') && (
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-tg-hover transition-colors text-left animate-profile-item-in"
                                    style={{ animationDelay: '280ms' }}
                                    onClick={async () => {
                                        if (onSendMessage) {
                                            onSendMessage(user.id);
                                        } else {
                                            const privateChatId = await findOrCreatePrivateChat(user.id);
                                            if (privateChatId) {
                                                const chat = useChatStore.getState().chats.find(c => c.id === privateChatId);
                                                if (chat) {
                                                    useChatStore.getState().setActiveChat(chat);
                                                }
                                            }
                                        }
                                        onClose();
                                    }}
                                >
                                    <MessageSquare className="h-5 w-5 text-tg-primary shrink-0" />
                                    <span className="text-sm text-tg-primary font-medium">Написать</span>
                                </button>
                            )}
                            <button
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-tg-hover transition-colors text-left animate-profile-item-in"
                                style={{ animationDelay: '320ms' }}
                                onClick={() => setShowGroupPicker(true)}
                            >
                                <UserPlus className="h-5 w-5 text-tg-text-secondary shrink-0" />
                                <span className="text-sm text-tg-text">Добавить в группу</span>
                            </button>
                        </div>

                        {/* Tabs for shared content */}
                        <div className="flex border-t border-tg-divider bg-card mt-2">
                            {sections.map((s) => (
                                <button
                                    key={s.key}
                                    onClick={() => setActiveSection(s.key)}
                                    className={cn(
                                        'flex-1 py-2.5 text-xs font-medium transition-colors relative',
                                        activeSection === s.key
                                            ? 'text-tg-primary'
                                            : 'text-tg-text-secondary hover:text-tg-text'
                                    )}
                                >
                                    {s.label}
                                    {activeSection === s.key && (
                                        <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full animate-tab-indicator" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Shared content */}
                        <div className="flex-1 bg-card">
                            {activeSection === 'media' && (
                                <div className="animate-profile-section-in min-h-[200px]">
                                    {mediaLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-tg-primary" />
                                        </div>
                                    ) : mediaMessages.length === 0 ? (
                                        <div className="p-6 flex flex-col items-center justify-center text-tg-text-secondary text-sm">
                                            <ImageIcon className="h-10 w-10 mb-2 opacity-30" />
                                            Нет медиафайлов
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-0.5 p-0.5">
                                            {mediaMessages.filter(m => m.type === 'image' || m.type === 'video').map((msg, idx) => (
                                                <div
                                                    key={msg.id}
                                                    className="relative aspect-square overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity active:opacity-70"
                                                    onClick={() => { setViewerIndex(idx); setViewerOpen(true); }}
                                                    onContextMenu={(e) => handleMediaContextMenu(e, msg)}
                                                    onTouchStart={(e) => handleMediaLongPress(msg, e)}
                                                    onTouchEnd={handleMediaTouchEnd}
                                                    onTouchMove={handleMediaTouchEnd}
                                                >
                                                    {msg.type === 'image' ? (
                                                        <img
                                                            src={msg.mediaUrl}
                                                            alt=""
                                                            className="h-full w-full object-cover"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="relative h-full w-full bg-black">
                                                            <video src={msg.mediaUrl} className="h-full w-full object-cover" muted preload="metadata" />
                                                            <div className="absolute inset-0 flex items-center justify-center">
                                                                <Play className="h-8 w-8 text-white/80" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeSection === 'files' && (
                                <div className="animate-profile-section-in min-h-[200px]">
                                    {mediaLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-tg-primary" />
                                        </div>
                                    ) : fileMessages.length === 0 ? (
                                        <div className="p-6 flex flex-col items-center justify-center text-tg-text-secondary text-sm">
                                            <FileText className="h-10 w-10 mb-2 opacity-30" />
                                            Нет файлов
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-tg-divider">
                                            {fileMessages.map((msg) => (
                                                <a
                                                    key={msg.id}
                                                    href={msg.mediaUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-3 px-4 py-3 hover:bg-tg-hover transition-colors"
                                                >
                                                    <FileText className="h-8 w-8 text-tg-primary shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-tg-text truncate">{msg.content || 'Файл'}</div>
                                                        <div className="text-xs text-tg-text-secondary">
                                                            {format(new Date(msg.timestamp), 'dd.MM.yyyy')}
                                                        </div>
                                                    </div>
                                                    <Download className="h-4 w-4 text-tg-text-secondary shrink-0" />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeSection === 'links' && (
                                <div className="animate-profile-section-in min-h-[200px]">
                                    {linkMessages.length === 0 ? (
                                        <div className="p-6 flex flex-col items-center justify-center text-tg-text-secondary text-sm">
                                            <LinkIcon className="h-10 w-10 mb-2 opacity-30" />
                                            Нет ссылок
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-tg-divider">
                                            {linkMessages.map((link, i) => (
                                                <a
                                                    key={`${link.url}-${i}`}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-3 px-4 py-3 hover:bg-tg-hover transition-colors"
                                                >
                                                    <ExternalLink className="h-5 w-5 text-tg-primary shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-tg-primary truncate">{link.url}</div>
                                                        <div className="text-xs text-tg-text-secondary truncate mt-0.5">{link.content}</div>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!loading && !user && userId && (
                    <div className="flex items-center justify-center h-full text-tg-text-secondary">
                        Пользователь не найден
                    </div>
                )}

                {/* Group Picker Modal */}
                {showGroupPicker && userId && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-backdrop-in" onClick={() => setShowGroupPicker(false)}>
                        <div className="bg-card rounded-xl mx-4 max-w-sm w-full shadow-xl animate-fade-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-tg-divider">
                                <h3 className="text-lg font-semibold text-tg-text">Добавить в группу</h3>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {(() => {
                                    const groupChats = chats.filter(c =>
                                        (c.type === 'group' || c.type === 'channel') &&
                                        !c.participants.some(p => p.userId === userId)
                                    );
                                    if (groupChats.length === 0) {
                                        return <div className="p-6 text-center text-sm text-tg-text-secondary">Нет доступных групп</div>;
                                    }
                                    return groupChats.map(chat => (
                                        <button
                                            key={chat.id}
                                            onClick={() => handleAddToGroup(chat.id)}
                                            disabled={addingToGroup}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-tg-hover transition-colors text-left disabled:opacity-50"
                                        >
                                            <Avatar className="h-9 w-9 shrink-0">
                                                <AvatarImage src={chat.avatar} />
                                                <AvatarFallback className="bg-tg-primary/20 text-tg-primary text-xs">
                                                    {(chat.title || 'G').slice(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm text-tg-text truncate block">{chat.title || 'Группа'}</span>
                                                <span className="text-xs text-tg-text-secondary">{chat.participants.length} участников</span>
                                            </div>
                                        </button>
                                    ));
                                })()}
                            </div>
                            <div className="p-3 border-t border-tg-divider">
                                <button onClick={() => setShowGroupPicker(false)} className="w-full py-2 text-sm text-tg-text-secondary hover:text-tg-text transition-colors">
                                    Отмена
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Media Context Menu */}
                {mediaCtx && (
                    <>
                        <div className="fixed inset-0 z-[100]" onClick={() => setMediaCtx(null)} />
                        <div
                            className="fixed z-[101] bg-card rounded-xl shadow-xl border border-tg-divider min-w-[180px] py-1 animate-ctx-menu-in"
                            style={{
                                left: Math.min(mediaCtx.x, window.innerWidth - 200),
                                top: Math.min(mediaCtx.y, window.innerHeight - 220),
                            }}
                        >
                            {onScrollToMessage && (
                                <button
                                    onClick={handleMediaShowInChat}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-tg-text hover:bg-tg-hover transition-colors"
                                >
                                    <SearchIcon className="h-4 w-4 text-tg-text-secondary" />
                                    Найти в чате
                                </button>
                            )}
                            <button
                                onClick={handleMediaDownload}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-tg-text hover:bg-tg-hover transition-colors"
                            >
                                <Download className="h-4 w-4 text-tg-text-secondary" />
                                Скачать
                            </button>
                            {mediaCtx.message.senderId === currentUserId && (
                                <button
                                    onClick={handleMediaDelete}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-tg-hover transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Удалить
                                </button>
                            )}
                        </div>
                    </>
                )}
        </>
    );

    // MediaViewer lives outside content/Sheet to avoid z-index issues with portals
    const viewer = (
        <MediaViewer
            isOpen={viewerOpen}
            onClose={() => setViewerOpen(false)}
            type="image"
            mediaItems={mediaViewerItems}
            currentIndex={viewerIndex}
        />
    );

    // Inline mode: render content directly (parent provides the container)
    if (inline) {
        if (!open) return null;
        return (
            <>
                {viewer}
                <div className="flex flex-col h-full overflow-hidden">{content}</div>
            </>
        );
    }

    // Sheet mode (mobile / fallback)
    return (
        <>
            {viewer}
            <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
                <SheetContent side="right" className="w-full sm:w-[360px] sm:max-w-[400px] p-0 overflow-hidden flex flex-col" aria-describedby={undefined}>
                    <SheetTitle className="sr-only">Профиль пользователя</SheetTitle>
                    {content}
                </SheetContent>
            </Sheet>
        </>
    );
}
