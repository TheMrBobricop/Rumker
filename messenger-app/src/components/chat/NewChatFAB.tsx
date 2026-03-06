import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Users, Megaphone, Lock, X, ArrowLeft, Search, Check, Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/authStore';
import { getFriends, type Friend } from '@/lib/api/friends';
import { createChat, findOrCreatePrivateChat, uploadChatFile } from '@/lib/api/chats';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Chat } from '@/types';

interface NewChatFABProps {
    onChatCreated: (chat: Chat) => void;
}

interface SearchUser {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    avatar?: string;
    isOnline?: boolean;
}

type FlowStep = 'closed' | 'menu' | 'pick-contact' | 'group-members' | 'group-settings' | 'channel-settings' | 'channel-members';

export function NewChatFAB({ onChatCreated }: NewChatFABProps) {
    const token = useAuthStore((s) => s.token);
    const [step, setStep] = useState<FlowStep>('closed');
    const [friends, setFriends] = useState<Friend[]>([]);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState<Map<string, SearchUser>>(new Map());

    // Group settings
    const [groupName, setGroupName] = useState('');
    const [groupDesc, setGroupDesc] = useState('');
    const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
    const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(null);

    // Channel settings
    const [channelName, setChannelName] = useState('');
    const [channelDesc, setChannelDesc] = useState('');
    const [channelPublic, setChannelPublic] = useState(true);
    const [channelAvatarUrl, setChannelAvatarUrl] = useState<string | null>(null);
    const [channelAvatarPreview, setChannelAvatarPreview] = useState<string | null>(null);

    const [creating, setCreating] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fabRef = useRef<HTMLButtonElement>(null);
    const groupAvatarInputRef = useRef<HTMLInputElement>(null);
    const channelAvatarInputRef = useRef<HTMLInputElement>(null);
    const [fabRect, setFabRect] = useState<DOMRect | null>(null);

    const isOpen = step !== 'closed';

    const loadFriends = useCallback(async () => {
        setFriendsLoading(true);
        try {
            const data = await getFriends();
            setFriends(data);
        } catch {
            setFriends([]);
        } finally {
            setFriendsLoading(false);
        }
    }, []);

    // Search users via API
    const searchUsersAPI = useCallback(async (query: string) => {
        if (!query || query.length < 2) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }
        setSearchLoading(true);
        try {
            const res = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            setSearchResults(data.users || []);
        } catch {
            setSearchResults([]);
        } finally {
            setSearchLoading(false);
        }
    }, [token]);

    // Debounced search
    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (!searchQuery || searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }
        searchTimerRef.current = setTimeout(() => {
            searchUsersAPI(searchQuery);
        }, 300);
        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        };
    }, [searchQuery, searchUsersAPI]);

    const reset = useCallback(() => {
        setStep('closed');
        setSelectedUsers(new Map());
        setGroupName('');
        setGroupDesc('');
        setGroupAvatarUrl(null);
        setGroupAvatarPreview(null);
        setChannelName('');
        setChannelDesc('');
        setChannelPublic(true);
        setChannelAvatarUrl(null);
        setChannelAvatarPreview(null);
        setSearchQuery('');
        setSearchResults([]);
    }, []);

    const handleFABClick = () => {
        if (isOpen) {
            reset();
        } else {
            // Capture FAB position for speed dial placement
            if (fabRef.current) {
                setFabRect(fabRef.current.getBoundingClientRect());
            }
            setStep('menu');
        }
    };

    // --- Avatar upload handler ---
    const handleAvatarUpload = async (file: File, target: 'group' | 'channel') => {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Выберите изображение');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error('Файл слишком большой (макс. 10 МБ)');
            return;
        }

        // Show preview immediately
        const previewUrl = URL.createObjectURL(file);
        if (target === 'group') {
            setGroupAvatarPreview(previewUrl);
        } else {
            setChannelAvatarPreview(previewUrl);
        }

        // Upload
        setUploadingAvatar(true);
        try {
            const result = await uploadChatFile(file);
            if (target === 'group') {
                setGroupAvatarUrl(result.url);
            } else {
                setChannelAvatarUrl(result.url);
            }
        } catch {
            toast.error('Не удалось загрузить фото');
            if (target === 'group') {
                setGroupAvatarPreview(null);
            } else {
                setChannelAvatarPreview(null);
            }
        } finally {
            setUploadingAvatar(false);
        }
    };

    // --- Menu item handlers ---
    const handleNewPrivate = () => {
        setStep('pick-contact');
        loadFriends();
    };

    const handleNewGroup = () => {
        setStep('group-members');
        setSelectedUsers(new Map());
        loadFriends();
    };

    const handleNewChannel = () => {
        setStep('channel-settings');
    };

    // --- Contact selection ---
    const toggleUser = (user: SearchUser) => {
        setSelectedUsers(prev => {
            const next = new Map(prev);
            if (next.has(user.id)) {
                next.delete(user.id);
            } else {
                next.set(user.id, user);
            }
            return next;
        });
    };

    // --- Create handlers ---
    const handlePickContact = async (userId: string) => {
        setCreating(true);
        try {
            const chat = await findOrCreatePrivateChat(userId);
            onChatCreated(chat);
            reset();
        } catch {
            toast.error('Не удалось создать чат');
        } finally {
            setCreating(false);
        }
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim()) {
            toast.error('Введите название группы');
            return;
        }
        if (selectedUsers.size === 0) {
            toast.error('Добавьте участников');
            return;
        }
        setCreating(true);
        try {
            const chat = await createChat({
                type: 'group',
                name: groupName.trim(),
                description: groupDesc.trim() || undefined,
                avatar: groupAvatarUrl || undefined,
                participantIds: [...selectedUsers.keys()],
            });
            onChatCreated(chat);
            toast.success('Группа создана');
            reset();
        } catch {
            toast.error('Не удалось создать группу');
        } finally {
            setCreating(false);
        }
    };

    const handleCreateChannel = async () => {
        if (!channelName.trim()) {
            toast.error('Введите название канала');
            return;
        }
        setCreating(true);
        try {
            const chat = await createChat({
                type: 'channel',
                name: channelName.trim(),
                description: channelDesc.trim() || undefined,
                avatar: channelAvatarUrl || undefined,
                participantIds: [...selectedUsers.keys()],
            });
            onChatCreated(chat);
            toast.success('Канал создан');
            reset();
        } catch {
            toast.error('Не удалось создать канал');
        } finally {
            setCreating(false);
        }
    };

    // Auto-focus search
    useEffect(() => {
        if (step === 'pick-contact' || step === 'group-members' || step === 'channel-members') {
            setTimeout(() => searchInputRef.current?.focus(), 200);
        }
    }, [step]);

    // Combined list: search results (when typing) or friends (default)
    const getContactList = (): SearchUser[] => {
        if (searchQuery.length >= 2) {
            return searchResults;
        }
        return friends.map(f => ({
            id: f.friend.id,
            username: f.friend.username,
            firstName: f.friend.firstName,
            lastName: f.friend.lastName,
            avatar: f.friend.avatar,
            isOnline: f.friend.isOnline,
        }));
    };

    const contactList = getContactList();
    const isSearching = searchQuery.length >= 2;
    const isLoadingContacts = isSearching ? searchLoading : friendsLoading;

    const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

    // --- Speed dial menu items ---
    const menuItems = [
        { icon: Users, label: 'Новая группа', desc: 'До 200 участников', onClick: handleNewGroup },
        { icon: Megaphone, label: 'Новый канал', desc: 'Неограниченная аудитория', onClick: handleNewChannel },
        { icon: Lock, label: 'Секретный чат', desc: 'С шифрованием', onClick: handleNewPrivate },
    ];

    // --- Avatar picker component ---
    const renderAvatarPicker = (target: 'group' | 'channel') => {
        const preview = target === 'group' ? groupAvatarPreview : channelAvatarPreview;
        const inputRef = target === 'group' ? groupAvatarInputRef : channelAvatarInputRef;

        return (
            <div className="relative">
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarUpload(file, target);
                        e.target.value = '';
                    }}
                />
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden hover:bg-primary/20 transition-colors relative group"
                >
                    {preview ? (
                        <>
                            <img src={preview} alt="" className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Camera className="h-5 w-5 text-white" />
                            </div>
                        </>
                    ) : uploadingAvatar ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                    ) : (
                        <Camera className="h-5 w-5 text-primary" />
                    )}
                </button>
            </div>
        );
    };

    // --- Contact list renderer ---
    const renderContactList = (mode: 'single' | 'multi') => (
        <div className="flex flex-col h-full max-h-[60vh]">
            {/* Search */}
            <div className="px-4 py-3 border-b border-border">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Поиск пользователей..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg bg-muted/50 border border-border text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground transition-colors"
                    />
                </div>
            </div>

            {/* Selected chips (multi mode) */}
            {mode === 'multi' && selectedUsers.size > 0 && (
                <div className="px-4 py-2.5 border-b border-border flex flex-wrap gap-1.5">
                    {[...selectedUsers.values()].map(u => (
                        <button
                            key={u.id}
                            onClick={() => toggleUser(u)}
                            className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                        >
                            <Avatar className="h-5 w-5">
                                <AvatarImage src={u.avatar} />
                                <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                                    {getInitials(u.firstName || u.username)}
                                </AvatarFallback>
                            </Avatar>
                            <span>{u.firstName || u.username}</span>
                            <X className="h-3 w-3" />
                        </button>
                    ))}
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto min-h-0">
                {isLoadingContacts ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                ) : contactList.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        {isSearching ? 'Пользователи не найдены' : 'Нет контактов. Начните вводить имя для поиска.'}
                    </div>
                ) : (
                    contactList.map((user) => {
                        const isSelected = selectedUsers.has(user.id);
                        return (
                            <button
                                key={user.id}
                                onClick={() => mode === 'single' ? handlePickContact(user.id) : toggleUser(user)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-2.5 transition-all text-left",
                                    "hover:bg-muted/60 active:scale-[0.98] active:bg-primary/5",
                                    isSelected && "bg-primary/5"
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
                                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-foreground truncate">
                                        {user.firstName} {user.lastName || ''}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                        @{user.username}
                                    </div>
                                </div>
                                {mode === 'multi' && (
                                    <div className={cn(
                                        "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all duration-150 shrink-0",
                                        isSelected
                                            ? "bg-primary border-primary scale-110"
                                            : "border-muted-foreground/30 scale-100"
                                    )}>
                                        {isSelected && <Check className="h-3 w-3 text-white animate-fade-scale-in" strokeWidth={3} />}
                                    </div>
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );

    // --- Modal dialog (centered, not full-screen) ---
    const renderDialog = () => {
        if (step === 'closed' || step === 'menu') return null;

        let title = '';
        let onBack: (() => void) | null = null;
        let rightAction: React.ReactNode = null;
        let content: React.ReactNode = null;

        switch (step) {
            case 'pick-contact':
                title = 'Новый чат';
                onBack = reset;
                content = renderContactList('single');
                break;

            case 'group-members':
                title = `Новая группа${selectedUsers.size > 0 ? ` (${selectedUsers.size})` : ''}`;
                onBack = reset;
                rightAction = selectedUsers.size > 0 ? (
                    <button
                        onClick={() => setStep('group-settings')}
                        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                        Далее
                    </button>
                ) : null;
                content = renderContactList('multi');
                break;

            case 'group-settings':
                title = 'Настройки группы';
                onBack = () => setStep('group-members');
                rightAction = (
                    <button
                        onClick={handleCreateGroup}
                        disabled={creating || !groupName.trim()}
                        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                    >
                        {creating ? 'Создание...' : 'Создать'}
                    </button>
                );
                content = (
                    <div className="p-5 space-y-5">
                        {/* Avatar + Name */}
                        <div className="flex items-center gap-4">
                            {renderAvatarPicker('group')}
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Название группы"
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    className="w-full text-sm font-medium text-foreground bg-transparent outline-none border-b-2 border-primary pb-1 placeholder:text-muted-foreground"
                                    autoFocus
                                    maxLength={64}
                                />
                                <div className="text-xs text-muted-foreground mt-1.5">
                                    Можно указать любое название
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <textarea
                                placeholder="Описание (необязательно)"
                                value={groupDesc}
                                onChange={(e) => setGroupDesc(e.target.value)}
                                className="w-full text-sm text-foreground bg-muted/50 border border-border rounded-lg p-3 outline-none resize-none focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground min-h-[60px] transition-colors"
                                maxLength={255}
                            />
                        </div>

                        {/* Members preview */}
                        <div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                Участники ({selectedUsers.size})
                            </div>
                            <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                                {[...selectedUsers.values()].map(u => (
                                    <div key={u.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={u.avatar} />
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                                {getInitials(u.firstName || u.username)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm text-foreground">{u.firstName} {u.lastName || ''}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
                break;

            case 'channel-settings':
                title = 'Новый канал';
                onBack = reset;
                rightAction = (
                    <button
                        onClick={() => {
                            if (!channelName.trim()) {
                                toast.error('Введите название канала');
                                return;
                            }
                            setStep('channel-members');
                            loadFriends();
                        }}
                        disabled={!channelName.trim()}
                        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                    >
                        Далее
                    </button>
                );
                content = (
                    <div className="p-5 space-y-4">
                        <div className="flex items-center gap-4">
                            {renderAvatarPicker('channel')}
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Название канала"
                                    value={channelName}
                                    onChange={(e) => setChannelName(e.target.value)}
                                    className="w-full text-sm font-medium text-foreground bg-transparent outline-none border-b-2 border-primary pb-1 placeholder:text-muted-foreground"
                                    autoFocus
                                    maxLength={64}
                                />
                            </div>
                        </div>

                        <div>
                            <textarea
                                placeholder="Описание (необязательно)"
                                value={channelDesc}
                                onChange={(e) => setChannelDesc(e.target.value)}
                                className="w-full text-sm text-foreground bg-muted/50 border border-border rounded-lg p-3 outline-none resize-none focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground min-h-[80px] transition-colors"
                                maxLength={255}
                            />
                        </div>

                        <div className="text-xs text-muted-foreground leading-relaxed">
                            Каналы — инструмент для трансляции сообщений неограниченной аудитории.
                        </div>

                        {/* Channel type */}
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Тип канала
                            </div>
                            <button
                                onClick={() => setChannelPublic(true)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors border",
                                    channelPublic ? "bg-primary/5 border-primary/30" : "border-transparent hover:bg-muted/60"
                                )}
                            >
                                <div className={cn(
                                    "h-5 w-5 rounded-full border-2 flex items-center justify-center",
                                    channelPublic ? "bg-primary border-primary" : "border-muted-foreground/30"
                                )}>
                                    {channelPublic && <div className="h-2 w-2 rounded-full bg-white" />}
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-medium text-foreground">Публичный</div>
                                    <div className="text-xs text-muted-foreground">Любой может найти и подписаться</div>
                                </div>
                            </button>
                            <button
                                onClick={() => setChannelPublic(false)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors border",
                                    !channelPublic ? "bg-primary/5 border-primary/30" : "border-transparent hover:bg-muted/60"
                                )}
                            >
                                <div className={cn(
                                    "h-5 w-5 rounded-full border-2 flex items-center justify-center",
                                    !channelPublic ? "bg-primary border-primary" : "border-muted-foreground/30"
                                )}>
                                    {!channelPublic && <div className="h-2 w-2 rounded-full bg-white" />}
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-medium text-foreground">Приватный</div>
                                    <div className="text-xs text-muted-foreground">Только по ссылке-приглашению</div>
                                </div>
                            </button>
                        </div>
                    </div>
                );
                break;

            case 'channel-members':
                title = `Добавить участников${selectedUsers.size > 0 ? ` (${selectedUsers.size})` : ''}`;
                onBack = () => setStep('channel-settings');
                rightAction = (
                    <button
                        onClick={handleCreateChannel}
                        disabled={creating}
                        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                    >
                        {creating ? 'Создание...' : selectedUsers.size > 0 ? 'Создать' : 'Пропустить'}
                    </button>
                );
                content = renderContactList('multi');
                break;
        }

        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/40 animate-backdrop-in" onClick={reset} />

                {/* Modal card */}
                <div className="relative w-full max-w-md bg-card rounded-xl shadow-2xl overflow-hidden animate-fade-scale-in flex flex-col max-h-[85vh]">
                    {/* Header */}
                    <header className="flex h-12 items-center gap-2 border-b border-border px-3 shrink-0">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-foreground"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                        )}
                        <span className="flex-1 font-semibold text-sm text-foreground truncate">{title}</span>
                        {rightAction}
                        <button
                            onClick={reset}
                            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground ml-1"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </header>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden min-h-0">
                        {content}
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <>
            {/* FAB Button */}
            <button
                ref={fabRef}
                onClick={handleFABClick}
                className={cn(
                    "absolute bottom-5 right-5 z-20 h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 active:scale-90",
                    isOpen
                        ? "bg-red-500 hover:bg-red-600 rotate-45"
                        : "bg-primary hover:brightness-110"
                )}
            >
                {isOpen ? (
                    <X className="h-6 w-6 text-white -rotate-45" />
                ) : (
                    <Pencil className="h-6 w-6 text-white" />
                )}
            </button>

            {/* Speed dial menu - positioned relative to FAB */}
            {step === 'menu' && fabRect && createPortal(
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40 bg-black/30 animate-backdrop-in"
                        onClick={reset}
                    />
                    {/* Menu items — positioned directly above the FAB button */}
                    <div
                        className="fixed z-50 flex flex-col gap-2 items-end"
                        style={{
                            bottom: `${window.innerHeight - fabRect.top + 8}px`,
                            right: `${window.innerWidth - fabRect.right}px`,
                        }}
                    >
                        {menuItems.map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.label}
                                    onClick={item.onClick}
                                    className="flex items-center gap-3 animate-fade-scale-in"
                                    style={{ animationDelay: `${i * 50}ms` }}
                                >
                                    <div className="bg-card px-3 py-1.5 rounded-lg shadow-md text-right">
                                        <div className="text-sm font-medium text-foreground">{item.label}</div>
                                        <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                                    </div>
                                    <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center shadow-md">
                                        <Icon className="h-5 w-5 text-white" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </>,
                document.body
            )}

            {/* Centered modal dialog */}
            {renderDialog()}
        </>
    );
}
