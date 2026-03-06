import { useEffect, useState, useCallback, useRef } from 'react';
import { getChatParticipants, getChatMedia, addChatMembers, updateChat, type ChatParticipantsResponse } from '@/lib/api/chats';
import { api } from '@/lib/api/client';
import { MediaViewer } from '@/components/media/MediaViewer';
import type { MediaItem } from '@/components/media/MediaViewer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { X, Crown, Shield, Search, ImageIcon, FileText, LinkIcon, Play, ExternalLink, Download, UserPlus, Check, Loader2, Plus, MoreVertical, Ban, LogOut, Settings2, Pencil, Camera, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { VoiceChannelList } from '@/components/voice/VoiceChannelList';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Chat, Message, AdminRights } from '@/types';
import { updateMemberRole, kickMember } from '@/lib/api/chats';
import { AdminRightsEditorModal } from './AdminRightsEditor';

interface GroupInfoPanelProps {
    chat: Chat | null;
    open: boolean;
    onClose: () => void;
    onOpenUserProfile?: (userId: string) => void;
    inline?: boolean;
}

/** Extract all URLs from message text */
function extractUrls(text: string): string[] {
    const regex = /https?:\/\/[^\s<>"')\]]+/g;
    return text.match(regex) || [];
}

export function GroupInfoPanel({ chat, open, onClose, onOpenUserProfile, inline }: GroupInfoPanelProps) {
    const [data, setData] = useState<ChatParticipantsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchVisible, setSearchVisible] = useState(false);
    const [activeSection, setActiveSection] = useState<'members' | 'voice' | 'media' | 'files' | 'links'>('members');
    const currentUserId = useAuthStore((s) => s.user?.id);

    // Media viewer
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);

    // Media/files state
    const [mediaMessages, setMediaMessages] = useState<Message[]>([]);
    const [fileMessages, setFileMessages] = useState<Message[]>([]);
    const [linkMessages, setLinkMessages] = useState<{ url: string; content: string; timestamp: Date }[]>([]);
    const [mediaLoading, setMediaLoading] = useState(false);

    // Add member modal
    const [showAddMember, setShowAddMember] = useState(false);
    const [addMemberQuery, setAddMemberQuery] = useState('');
    const [addMemberResults, setAddMemberResults] = useState<{ id: string; username: string; firstName?: string; lastName?: string; avatar?: string; isOnline?: boolean }[]>([]);
    const [addMemberLoading, setAddMemberLoading] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [addingMembers, setAddingMembers] = useState(false);
    const [friendsList, setFriendsList] = useState<{ id: string; username: string; firstName?: string; lastName?: string; avatar?: string; isOnline?: boolean }[]>([]);
    const [friendsLoading, setFriendsLoading] = useState(false);

    // Voice channel create
    const [showVoiceCreate, setShowVoiceCreate] = useState(false);
    const [voiceChannelName, setVoiceChannelName] = useState('');

    // Member action menu
    const [memberAction, setMemberAction] = useState<{ userId: string; role: string; title?: string; adminRights?: any } | null>(null);
    // Admin rights editor
    const [editingMember, setEditingMember] = useState<{ userId: string; username: string; firstName?: string; avatar?: string; role: string; title?: string; adminRights?: AdminRights } | null>(null);

    // Edit mode for group info
    const [editMode, setEditMode] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editAvatar, setEditAvatar] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const editFileInputRef = useRef<HTMLInputElement>(null);

    // Current user's role info
    const myParticipant = data?.participants.find(p => p.userId === currentUserId);
    const myRole = myParticipant?.role || 'member';
    const isOwner = myRole === 'owner';
    const canPromoteMembers = isOwner || (myRole === 'admin' && (myParticipant as any)?.adminRights?.can_promote_members);
    const canBanUsers = isOwner || (myRole === 'admin' && (myParticipant as any)?.adminRights?.can_ban_users);
    const canChangeInfo = isOwner || (myRole === 'admin' && (myParticipant as any)?.adminRights?.can_change_info);

    const handleEnterEdit = useCallback(() => {
        setEditName(chat?.title || data?.name || '');
        setEditDescription(chat?.description || data?.description || '');
        setEditAvatar(chat?.avatar);
        setEditMode(true);
    }, [chat, data]);

    const handleSaveEdit = useCallback(async () => {
        if (!chat) return;
        setSaving(true);
        try {
            await updateChat(chat.id, {
                name: editName,
                description: editDescription || null,
                avatar: editAvatar || null,
            });
            setEditMode(false);
            toast.success('Информация обновлена');
        } catch {
            toast.error('Не удалось сохранить');
        } finally {
            setSaving(false);
        }
    }, [chat, editName, editDescription, editAvatar]);

    const handleEditAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Выберите изображение');
            return;
        }
        try {
            const result = await api.uploadFile('/upload', file) as { url: string };
            setEditAvatar(result.url);
        } catch {
            toast.error('Не удалось загрузить аватар');
        }
    }, []);

    useEffect(() => {
        if (!chat || !open) return;
        setLoading(true);
        setSearchQuery('');
        setSearchVisible(false);
        setViewerOpen(false);
        setActiveSection(chat.type === 'private' ? 'media' : 'members');
        setMediaMessages([]);
        setFileMessages([]);
        setLinkMessages([]);
        getChatParticipants(chat.id)
            .then(setData)
            .catch((err) => {
                console.error('Failed to load group info:', err);
                // Fallback: use participants from the chat object itself
                setData({
                    chatId: chat.id,
                    name: chat.title || null,
                    type: chat.type,
                    createdAt: chat.createdAt as unknown as string,
                    participants: chat.participants.map(p => ({
                        userId: p.userId,
                        chatId: chat.id,
                        role: p.role || 'member',
                        joinedAt: p.joinedAt as unknown as string,
                        user: p.user ? {
                            id: p.user.id,
                            username: p.user.username,
                            firstName: p.user.firstName,
                            lastName: p.user.lastName,
                            avatar: p.user.avatar,
                            isOnline: p.user.isOnline,
                            lastSeen: p.user.lastSeen as unknown as string,
                        } : null,
                    })),
                });
            })
            .finally(() => setLoading(false));
    }, [chat, open]);

    // Load shared content when switching tabs
    useEffect(() => {
        if (!open || !chat) return;

        if (activeSection === 'media') {
            setMediaLoading(true);
            Promise.all([
                getChatMedia(chat.id, 'image'),
                getChatMedia(chat.id, 'video'),
            ])
                .then(([images, videos]) => setMediaMessages([...images, ...videos]))
                .catch(() => setMediaMessages([]))
                .finally(() => setMediaLoading(false));
        }

        if (activeSection === 'files') {
            setMediaLoading(true);
            getChatMedia(chat.id, 'file')
                .then(setFileMessages)
                .catch(() => setFileMessages([]))
                .finally(() => setMediaLoading(false));
        }

        if (activeSection === 'links') {
            const chatMsgs = useChatStore.getState().messages[chat.id] || [];
            const links: { url: string; content: string; timestamp: Date }[] = [];
            for (const msg of chatMsgs) {
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
    }, [activeSection, open, chat?.id]);

    const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

    const handleUserClick = useCallback((userId: string) => {
        if (userId === currentUserId) return;
        onOpenUserProfile?.(userId);
    }, [currentUserId, onOpenUserProfile]);

    // Load friends list when add member modal opens
    useEffect(() => {
        if (!showAddMember) return;
        setFriendsLoading(true);
        api.get<{ friends: { id: string; friend: { id: string; username: string; firstName?: string; lastName?: string; avatar?: string; isOnline?: boolean } }[] }>('/friends')
            .then((body) => {
                const existingIds = new Set((data?.participants || []).map(p => p.userId));
                const friends = (body.friends || [])
                    .map(f => f.friend)
                    .filter(f => !existingIds.has(f.id));
                setFriendsList(friends);
            })
            .catch(() => setFriendsList([]))
            .finally(() => setFriendsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showAddMember]);

    // Search users for adding (global search)
    useEffect(() => {
        if (!showAddMember || !addMemberQuery.trim()) {
            setAddMemberResults([]);
            return;
        }
        const timeout = setTimeout(async () => {
            setAddMemberLoading(true);
            try {
                const body = await api.get<{ users: any[] } | any[]>(`/users/search?query=${encodeURIComponent(addMemberQuery)}`);
                const users = Array.isArray(body) ? body : (body.users || []);
                const existingIds = new Set((data?.participants || []).map(p => p.userId));
                setAddMemberResults(users.filter((u: any) => !existingIds.has(u.id)));
            } catch (err) {
                console.error('[GroupInfo] User search failed:', err);
            }
            setAddMemberLoading(false);
        }, 300);
        return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addMemberQuery, showAddMember]);

    const handleToggleSelect = useCallback((userId: string) => {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    }, []);

    const handleAddMembers = useCallback(async () => {
        if (!chat || selectedUserIds.size === 0) return;
        setAddingMembers(true);
        try {
            const result = await addChatMembers(chat.id, [...selectedUserIds]);
            if (result.added > 0) {
                toast.success(`Добавлено участников: ${result.added}`);
                // Reload participant data
                getChatParticipants(chat.id).then(setData).catch(() => {});
                // Reload chats to update participant list
                useChatStore.getState().loadChats();
            }
            setShowAddMember(false);
            setAddMemberQuery('');
            setSelectedUserIds(new Set());
            setAddMemberResults([]);
        } catch (err) {
            console.error('[GroupInfo] Add members failed:', err);
            toast.error('Не удалось добавить участников');
        }
        setAddingMembers(false);
    }, [chat, selectedUserIds]);

    const filteredParticipants = (data?.participants || []).filter(p => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const u = p.user;
        if (!u) return false;
        return (
            u.firstName?.toLowerCase().includes(q) ||
            u.lastName?.toLowerCase().includes(q) ||
            u.username?.toLowerCase().includes(q)
        );
    });

    // Sort: owner first, then admins, then members. Within each group: online first, then alphabetical
    const roleOrder: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    const sortedParticipants = [...filteredParticipants].sort((a, b) => {
        const aRole = roleOrder[a.role] ?? 2;
        const bRole = roleOrder[b.role] ?? 2;
        if (aRole !== bRole) return aRole - bRole;
        const aOnline = a.user?.isOnline ? 1 : 0;
        const bOnline = b.user?.isOnline ? 1 : 0;
        if (aOnline !== bOnline) return bOnline - aOnline;
        return (a.user?.firstName || '').localeCompare(b.user?.firstName || '');
    });

    const chatTitle = chat?.title || data?.name || 'Без названия';
    const isChannel = chat?.type === 'channel';

    const isPrivateChat = chat?.type === 'private';
    const sections = isPrivateChat
        ? [
            { key: 'media' as const, label: 'Медиа' },
            { key: 'files' as const, label: 'Файлы' },
            { key: 'links' as const, label: 'Ссылки' },
        ]
        : [
            { key: 'members' as const, label: 'Участники' },
            { key: 'voice' as const, label: 'Голос' },
            { key: 'media' as const, label: 'Медиа' },
            { key: 'files' as const, label: 'Файлы' },
            { key: 'links' as const, label: 'Ссылки' },
        ];

    const content = (
        <>
                {loading && (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                )}

                {!loading && (
                    <div className="flex flex-col h-full">
                        {/* Hidden file input for avatar upload */}
                        <input ref={editFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleEditAvatarChange} />

                        {/* Header — Telegram style */}
                        <div className="relative bg-card pt-3 pb-4 flex flex-col items-center animate-profile-header-in">
                            {/* Close — top left */}
                            <button
                                onClick={() => { if (editMode) setEditMode(false); else onClose(); }}
                                className="absolute top-3 left-3 h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-tg-text-secondary hover:text-tg-text transition-all z-10"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            {/* Edit pencil — top right */}
                            {canChangeInfo && !editMode && (
                                <button
                                    onClick={handleEnterEdit}
                                    className="absolute top-3 right-3 h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-tg-text-secondary hover:text-tg-text transition-all z-10"
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                            )}

                            <div className="animate-fade-scale-in relative mt-6">
                                <Avatar
                                    className={cn("h-20 w-20 shadow-md", editMode && "cursor-pointer")}
                                    onClick={editMode ? () => editFileInputRef.current?.click() : undefined}
                                >
                                    <AvatarImage src={editMode ? editAvatar : chat?.avatar} />
                                    <AvatarFallback className="bg-tg-primary/15 text-tg-primary text-xl font-medium">
                                        {getInitials(editMode ? editName : chatTitle)}
                                    </AvatarFallback>
                                </Avatar>
                                {editMode && (
                                    <button
                                        onClick={() => editFileInputRef.current?.click()}
                                        className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-tg-primary border-2 border-card flex items-center justify-center"
                                    >
                                        <Camera className="h-3.5 w-3.5 text-white" />
                                    </button>
                                )}
                            </div>

                            {editMode ? (
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    maxLength={100}
                                    className="mt-3 mx-4 text-foreground text-lg font-semibold text-center bg-muted/50 rounded-lg px-3 py-1 outline-none focus:bg-muted transition-colors border border-border"
                                    placeholder="Название"
                                />
                            ) : (
                                <h2 className="text-foreground text-lg font-semibold mt-3 px-4 text-center">
                                    {chatTitle}
                                </h2>
                            )}
                            {!isPrivateChat && (
                                <p className="text-muted-foreground text-sm">
                                    {isChannel ? 'Канал' : 'Группа'} · {sortedParticipants.length} {(() => {
                                        const n = sortedParticipants.length;
                                        if (n % 10 === 1 && n % 100 !== 11) return 'участник';
                                        if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'участника';
                                        return 'участников';
                                    })()}
                                </p>
                            )}
                        </div>

                        {/* Description (editable or read-only) */}
                        {editMode ? (
                            <div className="px-4 py-3 bg-card border-b border-border">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Описание
                                </div>
                                <textarea
                                    value={editDescription}
                                    onChange={e => setEditDescription(e.target.value)}
                                    maxLength={500}
                                    rows={3}
                                    className="w-full text-sm text-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border focus:border-tg-primary outline-none transition-colors resize-none"
                                    placeholder="Добавьте описание..."
                                />
                                <div className="flex gap-2 mt-2">
                                    <button
                                        disabled={saving}
                                        onClick={handleSaveEdit}
                                        className="flex-1 py-2 rounded-lg bg-tg-primary text-white text-sm font-medium hover:bg-tg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                                    >
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        Сохранить
                                    </button>
                                    <button
                                        disabled={saving}
                                        onClick={() => setEditMode(false)}
                                        className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted/60 transition-colors"
                                    >
                                        Отмена
                                    </button>
                                </div>
                            </div>
                        ) : (chat?.description || data?.description) ? (
                            <div className="px-4 py-3 bg-card border-b border-border">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Описание
                                </div>
                                <p className="text-sm text-foreground whitespace-pre-wrap">
                                    {chat?.description || data?.description}
                                </p>
                            </div>
                        ) : null}

                        {/* Tabs */}
                        <div className="flex border-b border-border bg-card">
                            {sections.map((s) => (
                                <button
                                    key={s.key}
                                    onClick={() => setActiveSection(s.key)}
                                    className={cn(
                                        'flex-1 py-2 text-xs font-medium transition-colors relative',
                                        activeSection === s.key
                                            ? 'text-tg-primary'
                                            : 'text-tg-text-secondary hover:text-tg-text'
                                    )}
                                >
                                    {s.label}
                                    {activeSection === s.key && (
                                        <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto bg-card">
                            {/* Members */}
                            {activeSection === 'members' && (
                                <div className="flex flex-col h-full">
                                    {/* Toolbar: Add Member + Search */}
                                    <div className="flex items-center border-b border-border/50">
                                        {(chat?.type === 'group' || chat?.type === 'channel') && (
                                            <button
                                                onClick={() => setShowAddMember(true)}
                                                className="flex items-center gap-3 px-4 py-2.5 text-tg-primary hover:bg-muted/60 transition-colors flex-1"
                                            >
                                                <div className="h-9 w-9 rounded-full bg-tg-primary/10 flex items-center justify-center shrink-0">
                                                    <UserPlus className="h-4 w-4 text-tg-primary" />
                                                </div>
                                                <span className="text-sm font-medium">Добавить участника</span>
                                            </button>
                                        )}
                                        {sortedParticipants.length > 0 && (
                                            <button
                                                onClick={() => setSearchVisible(v => !v)}
                                                className={cn(
                                                    "h-10 w-10 mr-2 rounded-full flex items-center justify-center transition-colors shrink-0",
                                                    searchVisible ? "text-tg-primary bg-tg-primary/10" : "text-muted-foreground hover:bg-muted/60"
                                                )}
                                                title="Поиск участников"
                                            >
                                                <Search className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Search — shown only when toggled */}
                                    {searchVisible && (
                                        <div className="px-4 pt-2 pb-2 flex items-center gap-2">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    placeholder="Поиск участников..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-muted/50 border border-border text-foreground outline-none focus:border-primary placeholder:text-muted-foreground transition-colors"
                                                />
                                            </div>
                                            <button
                                                onClick={() => { setSearchVisible(false); setSearchQuery(''); }}
                                                className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors shrink-0"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Participant list */}
                                    <div className="flex-1 overflow-y-auto">
                                        {sortedParticipants.map((p) => {
                                            const u = p.user;
                                            if (!u) return null;
                                            const isMe = u.id === currentUserId;
                                            const pIsOwner = p.role === 'owner';
                                            const pIsAdmin = p.role === 'admin';
                                            const canManage = !isMe && (canPromoteMembers || canBanUsers) && !pIsOwner;

                                            return (
                                                <div
                                                    key={u.id}
                                                    className={cn(
                                                        "flex items-center gap-3 px-4 py-2.5 transition-colors relative group",
                                                        !isMe && "cursor-pointer hover:bg-muted/60"
                                                    )}
                                                    onClick={() => {
                                                        if (canManage) {
                                                            setMemberAction({ userId: u.id, role: p.role, title: (p as any).title, adminRights: (p as any).adminRights });
                                                        } else {
                                                            handleUserClick(u.id);
                                                        }
                                                    }}
                                                >
                                                    <div className="relative">
                                                        <Avatar className="h-10 w-10">
                                                            <AvatarImage src={u.avatar} />
                                                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                                                {getInitials(u.firstName || u.username)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        {u.isOnline && (
                                                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-card" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-sm font-medium text-foreground truncate">
                                                                {u.firstName} {u.lastName || ''}
                                                            </span>
                                                            {isMe && (
                                                                <span className="text-[10px] text-muted-foreground">вы</span>
                                                            )}
                                                            {pIsOwner && (
                                                                <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                                                            )}
                                                            {pIsAdmin && !pIsOwner && (
                                                                <Shield className="h-3 w-3 text-blue-500 shrink-0" />
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {(p as any).title ? (
                                                                <span className="text-tg-primary">{(p as any).title}</span>
                                                            ) : u.isOnline ? (
                                                                <span className="text-green-500">в сети</span>
                                                            ) : (
                                                                `@${u.username}`
                                                            )}
                                                        </div>
                                                    </div>
                                                    {canManage && (
                                                        <MoreVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {sortedParticipants.length === 0 && searchQuery && (
                                            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                                                Участники не найдены
                                            </div>
                                        )}
                                    </div>

                                    {/* Member action menu */}
                                    {memberAction && (() => {
                                        const targetUser = data?.participants.find(p => p.userId === memberAction.userId);
                                        if (!targetUser?.user) return null;
                                        const u = targetUser.user;
                                        return (
                                            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setMemberAction(null)}>
                                                <div className="bg-card rounded-t-xl sm:rounded-xl w-full max-w-sm mx-4 mb-0 sm:mb-0 shadow-xl animate-fade-scale-in" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center gap-3 p-4 border-b border-border">
                                                        <Avatar className="h-10 w-10">
                                                            <AvatarImage src={u.avatar} />
                                                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                                                {getInitials(u.firstName || u.username)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <div className="text-sm font-medium">{u.firstName} {u.lastName || ''}</div>
                                                            <div className="text-xs text-muted-foreground">@{u.username}</div>
                                                        </div>
                                                    </div>
                                                    <div className="py-1">
                                                        <button className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60 transition-colors"
                                                            onClick={() => { setMemberAction(null); onOpenUserProfile?.(memberAction.userId); }}>
                                                            <Search className="h-4 w-4 text-muted-foreground" />
                                                            Открыть профиль
                                                        </button>
                                                        {canPromoteMembers && memberAction.role === 'member' && (
                                                            <button className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60 transition-colors"
                                                                onClick={() => {
                                                                    setEditingMember({
                                                                        userId: memberAction.userId,
                                                                        username: u.username,
                                                                        firstName: u.firstName,
                                                                        avatar: u.avatar,
                                                                        role: 'member',
                                                                        title: memberAction.title,
                                                                        adminRights: memberAction.adminRights,
                                                                    });
                                                                    setMemberAction(null);
                                                                }}>
                                                                <Shield className="h-4 w-4 text-blue-500" />
                                                                Назначить администратором
                                                            </button>
                                                        )}
                                                        {canPromoteMembers && memberAction.role === 'admin' && (
                                                            <>
                                                                <button className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60 transition-colors"
                                                                    onClick={() => {
                                                                        setEditingMember({
                                                                            userId: memberAction.userId,
                                                                            username: u.username,
                                                                            firstName: u.firstName,
                                                                            avatar: u.avatar,
                                                                            role: 'admin',
                                                                            title: memberAction.title,
                                                                            adminRights: memberAction.adminRights,
                                                                        });
                                                                        setMemberAction(null);
                                                                    }}>
                                                                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                                                                    Редактировать права
                                                                </button>
                                                                <button className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60 transition-colors text-amber-600"
                                                                    onClick={async () => {
                                                                        try {
                                                                            await updateMemberRole(chat!.id, memberAction.userId, 'member');
                                                                            toast.success('Пользователь понижен до участника');
                                                                            setMemberAction(null);
                                                                        } catch { toast.error('Не удалось понизить'); }
                                                                    }}>
                                                                    <Crown className="h-4 w-4" />
                                                                    Понизить до участника
                                                                </button>
                                                            </>
                                                        )}
                                                        {canBanUsers && (
                                                            <>
                                                                <button className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60 transition-colors text-red-500"
                                                                    onClick={async () => {
                                                                        try {
                                                                            await kickMember(chat!.id, memberAction.userId);
                                                                            toast.success('Пользователь исключён');
                                                                            setMemberAction(null);
                                                                        } catch { toast.error('Не удалось исключить'); }
                                                                    }}>
                                                                    <LogOut className="h-4 w-4" />
                                                                    Исключить
                                                                </button>
                                                                <button className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60 transition-colors text-red-500"
                                                                    onClick={async () => {
                                                                        try {
                                                                            await kickMember(chat!.id, memberAction.userId, true);
                                                                            toast.success('Пользователь заблокирован');
                                                                            setMemberAction(null);
                                                                        } catch { toast.error('Не удалось заблокировать'); }
                                                                    }}>
                                                                    <Ban className="h-4 w-4" />
                                                                    Заблокировать
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                    <button
                                                        className="w-full py-3 text-sm text-muted-foreground hover:bg-muted/60 transition-colors border-t border-border"
                                                        onClick={() => setMemberAction(null)}>
                                                        Отмена
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Admin Rights Editor */}
                                    {editingMember && chat && (
                                        <AdminRightsEditorModal
                                            chatId={chat.id}
                                            target={editingMember}
                                            onClose={() => setEditingMember(null)}
                                            onSaved={() => {
                                                setEditingMember(null);
                                                // Refresh participants
                                                getChatParticipants(chat.id).then(setData).catch(() => {});
                                            }}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Voice Channels */}
                            {activeSection === 'voice' && chat && (
                                <div className="min-h-[200px]">
                                    <div className="flex items-center justify-between px-3 py-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Голосовые каналы
                                        </span>
                                        <button
                                            onClick={() => setShowVoiceCreate(v => !v)}
                                            className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                            title="Создать канал"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </div>
                                    {showVoiceCreate && (
                                        <div className="px-3 pb-2 flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Название канала..."
                                                value={voiceChannelName}
                                                onChange={(e) => setVoiceChannelName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && voiceChannelName.trim()) {
                                                        useVoiceChannelStore.getState().createChannel(chat.id, voiceChannelName.trim());
                                                        setVoiceChannelName('');
                                                        setShowVoiceCreate(false);
                                                    }
                                                    if (e.key === 'Escape') {
                                                        setShowVoiceCreate(false);
                                                        setVoiceChannelName('');
                                                    }
                                                }}
                                                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-muted/50 border border-border text-foreground outline-none focus:border-primary placeholder:text-muted-foreground transition-colors"
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => {
                                                    if (voiceChannelName.trim()) {
                                                        useVoiceChannelStore.getState().createChannel(chat.id, voiceChannelName.trim());
                                                        setVoiceChannelName('');
                                                        setShowVoiceCreate(false);
                                                    }
                                                }}
                                                disabled={!voiceChannelName.trim()}
                                                className="px-3 py-1.5 text-xs rounded-lg bg-tg-primary text-white hover:bg-tg-primary/90 disabled:opacity-50 transition-colors"
                                            >
                                                Создать
                                            </button>
                                        </div>
                                    )}
                                    <VoiceChannelList chatId={chat.id} className="h-full" onChannelJoined={() => onClose()} />
                                </div>
                            )}

                            {/* Media */}
                            {activeSection === 'media' && (
                                <div className="min-h-[200px]">
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

                            {/* Files */}
                            {activeSection === 'files' && (
                                <div className="min-h-[200px]">
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

                            {/* Links */}
                            {activeSection === 'links' && (
                                <div className="min-h-[200px]">
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

            {/* Add Member Modal */}
            {showAddMember && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-backdrop-in" onClick={() => { setShowAddMember(false); setAddMemberQuery(''); setSelectedUserIds(new Set()); setAddMemberResults([]); }}>
                    <div className="bg-card rounded-xl mx-4 max-w-md w-full shadow-xl animate-fade-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-foreground">Добавить участников</h3>
                                {selectedUserIds.size > 0 && (
                                    <span className="text-xs text-tg-primary font-medium">Выбрано: {selectedUserIds.size}</span>
                                )}
                            </div>
                            <button onClick={() => { setShowAddMember(false); setAddMemberQuery(''); setSelectedUserIds(new Set()); setAddMemberResults([]); }} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Search input */}
                        <div className="px-4 py-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Поиск по друзьям или имени пользователя..."
                                    value={addMemberQuery}
                                    onChange={(e) => setAddMemberQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-muted/50 border border-border text-foreground outline-none focus:border-tg-primary placeholder:text-muted-foreground transition-colors"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* User list */}
                        <div className="max-h-[350px] overflow-y-auto scrollbar-thin">
                            {(friendsLoading || addMemberLoading) && (
                                <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-5 w-5 animate-spin text-tg-primary" />
                                </div>
                            )}

                            {/* Friends section (shown when no search query) */}
                            {!friendsLoading && !addMemberQuery.trim() && (
                                <>
                                    {friendsList.length > 0 && (
                                        <div className="px-4 pt-1 pb-1.5">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Друзья</span>
                                        </div>
                                    )}
                                    {friendsList.map((user) => {
                                        const isSelected = selectedUserIds.has(user.id);
                                        return (
                                            <div
                                                key={user.id}
                                                onClick={() => handleToggleSelect(user.id)}
                                                className={cn(
                                                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                                    isSelected ? "bg-tg-primary/10" : "hover:bg-muted/60"
                                                )}
                                            >
                                                <div className="relative">
                                                    <Avatar className="h-10 w-10">
                                                        <AvatarImage src={user.avatar} />
                                                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                                            {getInitials(user.firstName || user.username)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    {user.isOnline && (
                                                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-card" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-foreground truncate">
                                                        {user.firstName} {user.lastName || ''}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        {user.isOnline ? <span className="text-green-500">в сети</span> : `@${user.username}`}
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "h-6 w-6 rounded-full flex items-center justify-center transition-all shrink-0",
                                                    isSelected ? "bg-tg-primary" : "border-2 border-muted-foreground/30"
                                                )}>
                                                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {friendsList.length === 0 && !friendsLoading && (
                                        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                                            Нет друзей для добавления
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Search results (shown when search query is entered) */}
                            {!addMemberLoading && addMemberQuery.trim() && (
                                <>
                                    {/* Filtered friends that match search */}
                                    {(() => {
                                        const q = addMemberQuery.toLowerCase();
                                        const matchingFriends = friendsList.filter(f =>
                                            f.firstName?.toLowerCase().includes(q) ||
                                            f.lastName?.toLowerCase().includes(q) ||
                                            f.username?.toLowerCase().includes(q)
                                        );
                                        const searchOnlyResults = addMemberResults.filter(
                                            r => !friendsList.some(f => f.id === r.id)
                                        );

                                        return (
                                            <>
                                                {matchingFriends.length > 0 && (
                                                    <>
                                                        <div className="px-4 pt-1 pb-1.5">
                                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Друзья</span>
                                                        </div>
                                                        {matchingFriends.map((user) => {
                                                            const isSelected = selectedUserIds.has(user.id);
                                                            return (
                                                                <div
                                                                    key={user.id}
                                                                    onClick={() => handleToggleSelect(user.id)}
                                                                    className={cn(
                                                                        "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                                                        isSelected ? "bg-tg-primary/10" : "hover:bg-muted/60"
                                                                    )}
                                                                >
                                                                    <div className="relative">
                                                                        <Avatar className="h-10 w-10">
                                                                            <AvatarImage src={user.avatar} />
                                                                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                                                                {getInitials(user.firstName || user.username)}
                                                                            </AvatarFallback>
                                                                        </Avatar>
                                                                        {user.isOnline && (
                                                                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-card" />
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-sm font-medium text-foreground truncate">
                                                                            {user.firstName} {user.lastName || ''}
                                                                        </div>
                                                                        <div className="text-xs text-muted-foreground truncate">@{user.username}</div>
                                                                    </div>
                                                                    <div className={cn(
                                                                        "h-6 w-6 rounded-full flex items-center justify-center transition-all shrink-0",
                                                                        isSelected ? "bg-tg-primary" : "border-2 border-muted-foreground/30"
                                                                    )}>
                                                                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </>
                                                )}

                                                {searchOnlyResults.length > 0 && (
                                                    <>
                                                        <div className="px-4 pt-2 pb-1.5">
                                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Глобальный поиск</span>
                                                        </div>
                                                        {searchOnlyResults.map((user) => {
                                                            const isSelected = selectedUserIds.has(user.id);
                                                            return (
                                                                <div
                                                                    key={user.id}
                                                                    onClick={() => handleToggleSelect(user.id)}
                                                                    className={cn(
                                                                        "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                                                        isSelected ? "bg-tg-primary/10" : "hover:bg-muted/60"
                                                                    )}
                                                                >
                                                                    <Avatar className="h-10 w-10">
                                                                        <AvatarImage src={user.avatar} />
                                                                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                                                            {getInitials(user.firstName || user.username)}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-sm font-medium text-foreground truncate">
                                                                            {user.firstName} {user.lastName || ''}
                                                                        </div>
                                                                        <div className="text-xs text-muted-foreground truncate">@{user.username}</div>
                                                                    </div>
                                                                    <div className={cn(
                                                                        "h-6 w-6 rounded-full flex items-center justify-center transition-all shrink-0",
                                                                        isSelected ? "bg-tg-primary" : "border-2 border-muted-foreground/30"
                                                                    )}>
                                                                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </>
                                                )}

                                                {matchingFriends.length === 0 && searchOnlyResults.length === 0 && (
                                                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                                                        Пользователи не найдены
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </>
                            )}
                        </div>

                        {/* Add button */}
                        <div className="px-4 py-3 border-t border-border">
                            <button
                                onClick={handleAddMembers}
                                disabled={selectedUserIds.size === 0 || addingMembers}
                                className={cn(
                                    "w-full py-2.5 rounded-lg text-sm font-medium transition-colors",
                                    selectedUserIds.size > 0
                                        ? "bg-tg-primary text-white hover:bg-tg-primary/90"
                                        : "bg-muted text-muted-foreground cursor-not-allowed"
                                )}
                            >
                                {addingMembers ? (
                                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                ) : (
                                    `Добавить${selectedUserIds.size > 0 ? ` (${selectedUserIds.size})` : ''}`
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    const mediaViewerItems: MediaItem[] = mediaMessages
        .filter(m => m.type === 'image' || m.type === 'video')
        .map(m => ({
            id: m.id,
            src: m.mediaUrl!,
            type: m.type as 'image' | 'video',
            senderName: m.sender ? (m.sender.firstName || m.sender.username) : undefined,
            timestamp: m.timestamp,
        }));

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
                    <SheetTitle className="sr-only">Информация о {isChannel ? 'канале' : 'группе'}</SheetTitle>
                    {content}
                </SheetContent>
            </Sheet>
        </>
    );
}
