import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Volume2, Lock, ChevronDown, ChevronRight, Plus,
    Trash2, MicOff, Headphones, Hash, Send,
    Settings, Search, Star, MessageSquare,
    ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { socketService } from '@/lib/socket';
import { ParticipantContextMenu } from './ParticipantContextMenu';
import { UserProfilePanel } from '@/components/users/UserProfilePanel';
import { voiceChannelPeerManager } from '@/lib/webrtc/VoiceChannelPeerManager';
import type { VoiceChannelParticipant } from '@/types';

// Favorites stored in localStorage — stores chatIds (not voice channel ids)
const VOICE_FAVS_KEY = 'rumker-voice-favorites';
function getFavGroups(): string[] {
    try { return JSON.parse(localStorage.getItem(VOICE_FAVS_KEY) || '[]'); } catch { return []; }
}
function toggleFavGroup(id: string) {
    const favs = getFavGroups();
    const idx = favs.indexOf(id);
    if (idx >= 0) favs.splice(idx, 1); else favs.push(id);
    localStorage.setItem(VOICE_FAVS_KEY, JSON.stringify(favs));
    return favs;
}

// Voice join/leave sound
function playVoiceSound(type: 'join' | 'leave') {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        if (type === 'join') {
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } else {
            osc.frequency.setValueAtTime(700, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.18);
        }
        setTimeout(() => ctx.close(), 500);
    } catch { /* ignore audio errors */ }
}

interface ChannelData {
    id: string;
    chatId: string;
    name: string;
    description?: string;
    position: number;
    category: string;
    maxParticipants?: number;
    isLocked: boolean;
    createdBy: string;
    createdAt: string;
    participants: VoiceChannelParticipant[];
}

interface ChatWithChannels {
    chatId: string;
    chatName: string;
    chatAvatar?: string;
    channels: ChannelData[];
}

type SubTab = 'groups' | 'favorites';

interface VoiceChannelsTabProps {
    className?: string;
    onOpenChat?: (userId: string) => void;
}

export function VoiceChannelsTab({ className, onOpenChat }: VoiceChannelsTabProps) {
    const currentChannel = useVoiceChannelStore((s) => s.currentChannel);
    const isConnected = useVoiceChannelStore((s) => s.isConnected);
    const participants = useVoiceChannelStore((s) => s.participants);
    const joinChannel = useVoiceChannelStore((s) => s.joinChannel);
    const createChannel = useVoiceChannelStore((s) => s.createChannel);
    const deleteChannel = useVoiceChannelStore((s) => s.deleteChannel);
    const loadChannels = useVoiceChannelStore((s) => s.loadChannels);
    const setViewingChannel = useVoiceChannelStore((s) => s.setViewingChannel);
    const currentUser = useAuthStore((s) => s.user);
    const chats = useChatStore((s) => s.chats);
    const navigate = useNavigate();

    const [chatGroups, setChatGroups] = useState<ChatWithChannels[]>([]);
    const [loading, setLoading] = useState(false);
    const [collapsedChats, setCollapsedChats] = useState<Set<string>>(new Set());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForChatId, setCreateForChatId] = useState('');
    const [newChannelName, setNewChannelName] = useState('');
    const [subTab, setSubTab] = useState<SubTab>('groups');
    const [searchQuery, setSearchQuery] = useState('');
    const [favGroupIds, setFavGroupIds] = useState<string[]>(getFavGroups());
    const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

    // Participant context menu + profile
    const [ctxMenu, setCtxMenu] = useState<{ userId: string; username: string; isMe: boolean; x: number; y: number } | null>(null);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());

    const handleParticipantContextMenu = useCallback((e: React.MouseEvent, p: VoiceChannelParticipant) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({
            userId: p.userId,
            username: p.firstName || p.username || 'User',
            isMe: p.userId === currentUser?.id,
            x: e.clientX,
            y: e.clientY,
        });
    }, [currentUser?.id]);

    const handleMuteUser = useCallback((userId: string) => {
        setMutedUsers(prev => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
                voiceChannelPeerManager.setRemoteAudioMuted(userId, false);
            } else {
                next.add(userId);
                voiceChannelPeerManager.setRemoteAudioMuted(userId, true);
            }
            return next;
        });
    }, []);

    // Mini chat state
    const [showMiniChat, setShowMiniChat] = useState(false);
    const [miniChatMessages, setMiniChatMessages] = useState<{ id: string; userId: string; username: string; content: string; time: string }[]>([]);
    const [miniChatInput, setMiniChatInput] = useState('');
    const [miniChatHeight, setMiniChatHeight] = useState(200);
    const miniChatRef = useRef<HTMLDivElement>(null);
    const resizingRef = useRef(false);

    // Track previous isConnected for sound
    const prevConnectedRef = useRef(false);

    // Load all voice channels
    const loadAllChannels = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.get<ChatWithChannels[]>('/voice-channels/all');
            setChatGroups(data);
        } catch {
            const allChats = useChatStore.getState().chats.filter(c => c.type === 'group');
            const results: ChatWithChannels[] = [];
            for (const chat of allChats) {
                try {
                    const channels = await api.get<ChannelData[]>(`/voice-channels?chatId=${chat.id}`);
                    if (channels.length > 0) {
                        results.push({ chatId: chat.id, chatName: chat.title || 'Группа', chatAvatar: chat.avatar, channels });
                    }
                } catch { /* skip */ }
            }
            setChatGroups(results);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAllChannels(); }, [loadAllChannels]);
    useEffect(() => { if (!isConnected) loadAllChannels(); }, [isConnected, loadAllChannels]);

    // Listen for voice join/leave events to update participant lists in real time
    useEffect(() => {
        const handleJoined = (data: { channelId: string; userId: string; username: string; firstName: string; avatar: string }) => {
            setChatGroups(prev => prev.map(g => ({
                ...g,
                channels: g.channels.map(ch => {
                    if (ch.id !== data.channelId) return ch;
                    const already = (ch.participants || []).some((p: any) => p.userId === data.userId);
                    if (already) return ch;
                    return {
                        ...ch,
                        participants: [...(ch.participants || []), {
                            userId: data.userId,
                            username: data.username,
                            firstName: data.firstName,
                            avatar: data.avatar,
                            isMuted: false,
                            isDeafened: false,
                            isSpeaking: false,
                        }],
                    };
                }),
            })));
        };
        const handleLeft = (data: { channelId: string; userId: string }) => {
            setChatGroups(prev => prev.map(g => ({
                ...g,
                channels: g.channels.map(ch => {
                    if (ch.id !== data.channelId) return ch;
                    return {
                        ...ch,
                        participants: (ch.participants || []).filter((p: any) => p.userId !== data.userId),
                    };
                }),
            })));
        };
        const handleSpeaking = (data: { channelId: string; userId: string; isSpeaking: boolean }) => {
            setChatGroups(prev => prev.map(g => ({
                ...g,
                channels: g.channels.map(ch => {
                    if (ch.id !== data.channelId) return ch;
                    return {
                        ...ch,
                        participants: (ch.participants || []).map((p: any) =>
                            p.userId === data.userId ? { ...p, isSpeaking: data.isSpeaking } : p
                        ),
                    };
                }),
            })));
        };

        socketService.on('voice:user:joined', handleJoined);
        socketService.on('voice:user:left', handleLeft);
        socketService.on('voice:user:speaking', handleSpeaking);

        return () => {
            socketService.off('voice:user:joined', handleJoined);
            socketService.off('voice:user:left', handleLeft);
            socketService.off('voice:user:speaking', handleSpeaking);
        };
    }, []);

    // Play sound on connect/disconnect
    useEffect(() => {
        if (isConnected && !prevConnectedRef.current) {
            playVoiceSound('join');
            setShowMiniChat(false);
        } else if (!isConnected && prevConnectedRef.current) {
            playVoiceSound('leave');
        }
        prevConnectedRef.current = isConnected;
    }, [isConnected]);

    const toggleChat = (chatId: string) => {
        setCollapsedChats(prev => {
            const s = new Set(prev);
            if (s.has(chatId)) s.delete(chatId); else s.add(chatId);
            return s;
        });
    };

    // Click channel: join if not connected, show panel in main area
    const handleChannelClick = (channelId: string, chatId: string) => {
        const ch = chatGroups.flatMap(g => g.channels).find(c => c.id === channelId);
        const channelInfo = ch ? { id: channelId, name: ch.name, chatId } : null;

        if (currentChannel?.id === channelId) {
            // Already connected — toggle expanded + show main panel
            setExpandedChannel(prev => prev === channelId ? null : channelId);
            if (channelInfo) setViewingChannel(channelInfo);
        } else {
            // Join and show panel
            loadChannels(chatId).then(() => {
                joinChannel(channelId);
                if (channelInfo) setViewingChannel(channelInfo);
            });
        }
    };

    const handleCreateChannel = async () => {
        if (!newChannelName.trim() || !createForChatId) return;
        try {
            await createChannel(createForChatId, newChannelName.trim());
            setNewChannelName('');
            setShowCreateModal(false);
            loadAllChannels();
        } catch (error) {
            console.error('Failed to create voice channel:', error);
        }
    };

    const handleDeleteChannel = async (channelId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await deleteChannel(channelId);
            loadAllChannels();
        } catch (error) {
            console.error('Failed to delete voice channel:', error);
        }
    };

    const handleToggleFavoriteGroup = (chatId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setFavGroupIds(toggleFavGroup(chatId));
    };

    // Mini chat
    const sendMiniChatMessage = () => {
        if (!miniChatInput.trim() || !currentChannel || !currentUser) return;
        const msg = {
            id: `vc-${Date.now()}`,
            userId: currentUser.id,
            username: currentUser.firstName || currentUser.username || 'Вы',
            content: miniChatInput.trim(),
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        };
        setMiniChatMessages(prev => [...prev, msg]);
        socketService.voiceChatMessage(currentChannel.id, miniChatInput.trim());
        setMiniChatInput('');
        setTimeout(() => { miniChatRef.current?.scrollTo({ top: miniChatRef.current.scrollHeight }); }, 50);
    };

    useEffect(() => {
        const handler = (data: { userId: string; username: string; content: string; channelId: string }) => {
            if (data.channelId === currentChannel?.id && data.userId !== currentUser?.id) {
                setMiniChatMessages(prev => [...prev, {
                    id: `vc-${Date.now()}-${Math.random()}`,
                    userId: data.userId,
                    username: data.username,
                    content: data.content,
                    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                }]);
                setTimeout(() => { miniChatRef.current?.scrollTo({ top: miniChatRef.current.scrollHeight }); }, 50);
            }
        };
        socketService.onVoiceChatMessage(handler);
        return () => { socketService.offVoiceChatMessage(handler); };
    }, [currentChannel?.id, currentUser?.id]);

    useEffect(() => { setMiniChatMessages([]); }, [currentChannel?.id]);

    // Resize mini chat
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        resizingRef.current = true;
        const startY = e.clientY;
        const startH = miniChatHeight;
        const onMove = (ev: MouseEvent) => {
            if (!resizingRef.current) return;
            const delta = startY - ev.clientY;
            setMiniChatHeight(Math.max(120, Math.min(400, startH + delta)));
        };
        const onUp = () => {
            resizingRef.current = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [miniChatHeight]);

    // Filter groups by chat type
    const groupChatIds = new Set(chats.filter(c => c.type === 'group').map(c => c.id));
    const groupChannelGroups = chatGroups.filter(g => groupChatIds.has(g.chatId));

    // Favorites — based on chatIds (groups), not individual voice channels
    const favGroups = chatGroups.filter(g => favGroupIds.includes(g.chatId));

    // Search filtering helper
    const filterGroups = (groups: ChatWithChannels[]) => searchQuery.trim()
        ? groups.map(g => ({
            ...g,
            channels: g.channels.filter(ch =>
                ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                g.chatName.toLowerCase().includes(searchQuery.toLowerCase())
            ),
        })).filter(g => g.channels.length > 0)
        : groups;

    const filteredGroupChannels = filterGroups(groupChannelGroups);
    const groupChats = chats.filter(c => c.type === 'group');

    // Render a channel row
    // Render a voice channel row + Discord-style participant list on expand
    const renderChannel = (channel: ChannelData & { chatName?: string }, chatId: string) => {
        const isActive = currentChannel?.id === channel.id;
        const isExpanded = expandedChannel === channel.id;
        const channelParticipants = isActive ? participants : (channel.participants || []);

        return (
            <div key={channel.id}>
                <div
                    className={cn(
                        "group/ch flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
                        isActive
                            ? "bg-tg-primary/15 text-tg-primary"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                    onClick={() => handleChannelClick(channel.id, chatId)}
                >
                    {channel.isLocked ? (
                        <Lock className="h-4 w-4 shrink-0 opacity-60" />
                    ) : (
                        <Volume2 className="h-4 w-4 shrink-0 opacity-60" />
                    )}
                    <span className="text-sm flex-1 truncate">{channel.name}</span>
                    {channelParticipants.length > 0 && (
                        <span className="text-[11px] text-muted-foreground">{channelParticipants.length}</span>
                    )}
                    <button
                        className="h-5 w-5 flex items-center justify-center text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0"
                        onClick={(e) => handleDeleteChannel(channel.id, e)}
                    >
                        <Trash2 className="h-3 w-3" />
                    </button>
                </div>

                {/* Discord-style participant list (shown if active or expanded via re-click) */}
                {(isActive || isExpanded) && channelParticipants.length > 0 && (
                    <div className="ml-2 mt-1 mb-1 space-y-0.5 animate-fade-slide-in">
                        {channelParticipants.map(p => (
                            <div key={p.userId} className="group/user flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors cursor-pointer" onContextMenu={(e) => handleParticipantContextMenu(e, p)}>
                                {/* Avatar with speaking ring + online dot */}
                                <div className="relative shrink-0">
                                    <Avatar className={cn(
                                        "h-8 w-8 transition-all",
                                        p.isSpeaking && "ring-2 ring-green-500 ring-offset-1 ring-offset-card"
                                    )}>
                                        <AvatarImage src={p.avatar} />
                                        <AvatarFallback className="text-[10px] bg-tg-primary/20 text-tg-primary font-medium">
                                            {(p.firstName || p.username || '?').slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    {/* Speaking pulse indicator */}
                                    {p.isSpeaking && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card animate-pulse" />
                                    )}
                                </div>

                                {/* Name + status */}
                                <div className="flex-1 min-w-0">
                                    <div className={cn(
                                        "text-[13px] font-medium truncate leading-tight",
                                        p.isSpeaking ? "text-green-500" : "text-foreground/80"
                                    )}>
                                        {p.firstName || p.username}
                                    </div>
                                    {/* Status line: muted / deafened / speaking */}
                                    {(p.isMuted || p.isDeafened || p.isSpeaking) && (
                                        <div className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">
                                            {p.isDeafened ? 'Звук отключён' : p.isMuted ? 'Микрофон выкл.' : p.isSpeaking ? 'Говорит' : ''}
                                        </div>
                                    )}
                                </div>

                                {/* Status icons — Discord style */}
                                <div className="flex items-center gap-1 shrink-0">
                                    {p.isMuted && (
                                        <div className="h-5 w-5 flex items-center justify-center rounded bg-muted/50">
                                            <MicOff className="h-3.5 w-3.5 text-red-400" />
                                        </div>
                                    )}
                                    {p.isDeafened && (
                                        <div className="h-5 w-5 flex items-center justify-center rounded bg-muted/50">
                                            <Headphones className="h-3.5 w-3.5 text-red-400" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={cn("flex flex-col h-full bg-card", className)}>
            {/* Search bar */}
            <div className="px-2 pt-2 pb-1">
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Поиск каналов..."
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                            <span className="text-xs">✕</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-border px-1">
                <button
                    onClick={() => setSubTab('groups')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors relative",
                        subTab === 'groups' ? "text-tg-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Volume2 className="h-3.5 w-3.5" />
                    Группы
                    {subTab === 'groups' && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full animate-tab-indicator" />}
                </button>
                <button
                    onClick={() => setSubTab('favorites')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors relative",
                        subTab === 'favorites' ? "text-tg-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Star className="h-3.5 w-3.5" />
                    Избранное
                    {favGroupIds.length > 0 && (
                        <span className="text-[10px] bg-tg-primary/10 text-tg-primary rounded-full px-1.5">{favGroupIds.length}</span>
                    )}
                    {subTab === 'favorites' && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-tg-primary rounded-full animate-tab-indicator" />}
                </button>
            </div>

            {/* Settings button */}
            <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
                    {subTab === 'groups' ? 'Группы' : 'Избранное'}
                </span>
                <button
                    onClick={() => navigate('/settings')}
                    className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Настройки звука"
                >
                    <Settings className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-1">
                {subTab === 'favorites' ? (
                    /* Favorites tab — shows starred groups/channels with their voice channels */
                    favGroups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                            <Star className="h-8 w-8 text-muted-foreground/30 mb-3" />
                            <p className="text-sm text-muted-foreground">Нет избранных</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Нажмите ★ рядом с группой или каналом</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {favGroups.map(group => {
                                const isCollapsed = collapsedChats.has(group.chatId);
                                return (
                                    <div key={group.chatId}>
                                        <div
                                            className="flex items-center gap-1 px-1.5 py-1 cursor-pointer group hover:text-foreground select-none rounded-lg"
                                            onClick={() => toggleChat(group.chatId)}
                                        >
                                            {isCollapsed
                                                ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                                : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                            }
                                            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground group-hover:text-foreground flex-1 truncate">
                                                {group.chatName}
                                            </span>
                                            <button
                                                onClick={(e) => handleToggleFavoriteGroup(group.chatId, e)}
                                                className="h-4 w-4 flex items-center justify-center text-yellow-500 hover:text-yellow-400 transition-opacity shrink-0"
                                                title="Убрать из избранного"
                                            >
                                                <Star className="h-3 w-3 fill-yellow-500" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setCreateForChatId(group.chatId); setShowCreateModal(true); }}
                                                className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        {!isCollapsed && (
                                            <div className="space-y-px pl-1">
                                                {group.channels.map(ch => renderChannel(ch, group.chatId))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    /* Groups tab — show all groups with voice channels */
                    loading && chatGroups.length === 0 ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-tg-primary" />
                        </div>
                    ) : filteredGroupChannels.length === 0 && groupChats.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                            <Volume2 className="h-8 w-8 text-muted-foreground/30 mb-3" />
                            <p className="text-sm text-muted-foreground">Нет групп</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Создайте группу для голосовых каналов</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredGroupChannels.map(group => {
                                const isCollapsed = collapsedChats.has(group.chatId);
                                const isFav = favGroupIds.includes(group.chatId);
                                return (
                                    <div key={group.chatId}>
                                        <div
                                            className="flex items-center gap-1 px-1.5 py-1 cursor-pointer group hover:text-foreground select-none rounded-lg"
                                            onClick={() => toggleChat(group.chatId)}
                                        >
                                            {isCollapsed
                                                ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                                : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                            }
                                            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground group-hover:text-foreground flex-1 truncate">
                                                {group.chatName}
                                            </span>
                                            <button
                                                onClick={(e) => handleToggleFavoriteGroup(group.chatId, e)}
                                                className={cn(
                                                    "h-4 w-4 flex items-center justify-center transition-opacity shrink-0",
                                                    isFav ? "text-yellow-500" : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-500"
                                                )}
                                                title={isFav ? 'Убрать из избранного' : 'В избранное'}
                                            >
                                                <Star className={cn("h-3 w-3", isFav && "fill-yellow-500")} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setCreateForChatId(group.chatId); setShowCreateModal(true); }}
                                                className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        {!isCollapsed && (
                                            <div className="space-y-px pl-1">
                                                {group.channels.map(ch => renderChannel(ch, group.chatId))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Groups without voice channels */}
                            {!searchQuery && groupChats
                                .filter(c => !chatGroups.some(g => g.chatId === c.id))
                                .map(chat => (
                                    <div key={chat.id}>
                                        <div className="flex items-center gap-1 px-1.5 py-1 cursor-pointer group hover:text-foreground select-none rounded-lg">
                                            <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                                            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground/50 flex-1 truncate">
                                                {chat.title || 'Группа'}
                                            </span>
                                            <button
                                                onClick={() => { setCreateForChatId(chat.id); setShowCreateModal(true); }}
                                                className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    )
                )}
            </div>

            {/* Mini text chat — toggle when connected */}
            {isConnected && currentChannel && showMiniChat && (
                <div className="border-t border-border flex flex-col animate-fade-slide-in" style={{ height: miniChatHeight }}>
                    {/* Resize handle */}
                    <div
                        className="h-1 cursor-row-resize hover:bg-tg-primary/30 active:bg-tg-primary/50 transition-colors shrink-0"
                        onMouseDown={handleResizeStart}
                    />
                    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border/50 shrink-0">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground truncate flex-1">{currentChannel.name}</span>
                        <button onClick={() => setShowMiniChat(false)} className="text-muted-foreground hover:text-foreground">
                            <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div ref={miniChatRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-thin">
                        {miniChatMessages.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground/40">Чат голосового канала</div>
                        ) : miniChatMessages.map(msg => (
                            <div key={msg.id} className="flex gap-1.5">
                                <span className={cn("text-xs font-medium shrink-0", msg.userId === currentUser?.id ? "text-tg-primary" : "text-foreground")}>{msg.username}</span>
                                <span className="text-xs text-muted-foreground break-all">{msg.content}</span>
                                <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">{msg.time}</span>
                            </div>
                        ))}
                    </div>
                    <div className="px-2 pb-1.5 shrink-0">
                        <div className="flex items-center gap-1 bg-muted/50 rounded-lg px-3 py-1.5">
                            <input
                                type="text"
                                value={miniChatInput}
                                onChange={(e) => setMiniChatInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMiniChatMessage(); } }}
                                placeholder={`Сообщение в #${currentChannel.name}`}
                                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
                            />
                            <button onClick={sendMiniChatMessage} disabled={!miniChatInput.trim()} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-tg-primary disabled:opacity-30 transition-colors shrink-0">
                                <Send className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Voice chat toggle button when connected */}
            {isConnected && currentChannel && !showMiniChat && (
                <div className="border-t border-border px-2 py-1.5 shrink-0">
                    <button
                        onClick={() => setShowMiniChat(true)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Открыть чат канала
                        <ChevronUp className="h-3 w-3" />
                    </button>
                </div>
            )}

            {/* Create Channel Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-backdrop-in" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-card rounded-xl p-4 w-72 border border-border shadow-xl animate-fade-scale-in" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-foreground font-semibold mb-4">Создать голосовой канал</h3>
                        <div>
                            <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Название канала</label>
                            <input
                                type="text"
                                value={newChannelName}
                                onChange={(e) => setNewChannelName(e.target.value)}
                                placeholder="Новый голосовой канал"
                                className="w-full bg-muted text-foreground rounded-lg p-2.5 border border-border text-sm outline-none focus:ring-2 focus:ring-tg-primary/20"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChannel(); }}
                            />
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button onClick={() => setShowCreateModal(false)} className="flex-1 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                Отмена
                            </button>
                            <button
                                onClick={handleCreateChannel}
                                disabled={!newChannelName.trim()}
                                className="flex-1 py-2 text-sm rounded-lg bg-tg-primary text-white hover:brightness-110 disabled:opacity-40 transition-all"
                            >
                                Создать
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Participant Context Menu */}
            {ctxMenu && (
                <ParticipantContextMenu
                    userId={ctxMenu.userId}
                    username={ctxMenu.username}
                    isMe={ctxMenu.isMe}
                    x={ctxMenu.x}
                    y={ctxMenu.y}
                    onClose={() => setCtxMenu(null)}
                    onProfile={(id) => setProfileUserId(id)}
                    onChat={(id) => onOpenChat?.(id)}
                    onMuteUser={handleMuteUser}
                    isUserMuted={mutedUsers.has(ctxMenu.userId)}
                />
            )}

            {/* Profile Panel (overlay) */}
            {profileUserId && (
                <UserProfilePanel
                    userId={profileUserId}
                    chatId={null}
                    open={!!profileUserId}
                    onClose={() => setProfileUserId(null)}
                />
            )}
        </div>
    );
}
