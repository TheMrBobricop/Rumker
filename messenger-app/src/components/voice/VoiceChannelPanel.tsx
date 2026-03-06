import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { useAuthStore } from '@/stores/authStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Mic, MicOff, Headphones, HeadphoneOff,
    PhoneOff, Monitor, MonitorOff, Video, VideoOff,
    Volume2, Users, MessageSquare, X, Hash, Send,
    ArrowLeft, ChevronDown,
    Eye, LogOut, Radio,
    LayoutGrid, Focus, Music2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { socketService } from '@/lib/socket';
import { voiceChannelPeerManager } from '@/lib/webrtc/VoiceChannelPeerManager';
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { ParticipantContextMenu } from './ParticipantContextMenu';
import { UserProfilePanel } from '@/components/users/UserProfilePanel';
import { ConnectionQualityIndicator } from './ConnectionQualityIndicator';
import { findOrCreatePrivateChat } from '@/lib/api/chats';
import { useChatStore } from '@/stores/chatStore';
import { usePushToTalk } from '@/lib/hooks/usePushToTalk';
import { toast } from 'sonner';

const SoundboardPanel = lazy(() => import('./SoundboardPanel').then(m => ({ default: m.SoundboardPanel })));

// Discord palette
const DC = {
    bg: '#313338', bgSec: '#2b2d31', bgTer: '#1e1f22', panel: '#232428',
    green: '#23a559', red: '#ed4245', blurple: '#5865f2', white: '#ffffff',
    textNorm: '#dbdee1', textMuted: '#949ba4', textFaint: '#6d6f78',
    btnBg: '#2b2d31', btnHov: '#383a40', btnAct: '#43444b',
    inputBg: '#1e1f22',
} as const;

interface VoiceChannelPanelProps { onBack?: () => void; }

export function VoiceChannelPanel({ onBack }: VoiceChannelPanelProps) {
    const currentChannel = useVoiceChannelStore((s) => s.currentChannel);
    const isMuted = useVoiceChannelStore((s) => s.isMuted);
    const isDeafened = useVoiceChannelStore((s) => s.isDeafened);
    const isConnected = useVoiceChannelStore((s) => s.isConnected);
    const participants = useVoiceChannelStore((s) => s.participants);
    const setMuted = useVoiceChannelStore((s) => s.setMuted);
    const setDeafened = useVoiceChannelStore((s) => s.setDeafened);
    const leaveChannel = useVoiceChannelStore((s) => s.leaveChannel);
    const setViewingChannel = useVoiceChannelStore((s) => s.setViewingChannel);
    const userVolumes = useVoiceChannelStore((s) => s.userVolumes);
    const setUserVolume = useVoiceChannelStore((s) => s.setUserVolume);
    const watchingStreams = useVoiceChannelStore((s) => s.watchingStreams);
    const addWatching = useVoiceChannelStore((s) => s.addWatching);
    const removeWatching = useVoiceChannelStore((s) => s.removeWatching);
    const clearWatching = useVoiceChannelStore((s) => s.clearWatching);
    const leavingParticipants = useVoiceChannelStore((s) => s.leavingParticipants);
    const currentUser = useAuthStore((s) => s.user);

    // ── Local video ──
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);

    // ── Remote video streams from peer manager ──
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream[]>>(new Map());

    // ── Currently viewing stream (full-size in main area) ──
    const [viewingStream, setViewingStream] = useState<{ userId: string; username: string } | null>(null);

    // ── Right sidebar ──
    const [rightPanel, setRightPanel] = useState<'none' | 'members' | 'chat'>('none');

    // ── Chat ──
    const [chatMessages, setChatMessages] = useState<{ id: string; userId: string; username: string; content: string; time: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const chatScrollRef = useRef<HTMLDivElement>(null);

    // ── Participant context menu + profile ──
    const [ctxMenu, setCtxMenu] = useState<{ userId: string; username: string; isMe: boolean; x: number; y: number } | null>(null);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());

    // ── View mode ──
    const [viewMode, setViewMode] = useState<'grid' | 'spotlight'>('grid');
    const [spotlightUserId, setSpotlightUserId] = useState<string | null>(null);
    const spotlightDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Soundboard ──
    const [showSoundboard, setShowSoundboard] = useState(false);
    const soundboardRef = useRef<HTMLDivElement>(null);

    // ── PTT ──
    usePushToTalk();
    const isPTTMode = useVoiceChannelStore((s) => s.voiceSettings.inputMode === 'pushToTalk');
    const isPTTActive = useVoiceChannelStore((s) => s.isPTTActive);

    // ── Disconnect dropdown ──
    const [showDisconnectMenu, setShowDisconnectMenu] = useState(false);
    const disconnectMenuRef = useRef<HTMLDivElement>(null);

    // ═══════ Subscribe to remote video ═══════
    useEffect(() => {
        return voiceChannelPeerManager.onRemoteVideoChange((streams) => {
            setRemoteStreams(new Map(streams));
        });
    }, []);

    // Auto-spotlight active speaker (debounced to avoid jumping)
    useEffect(() => {
        if (viewMode !== 'spotlight') return;
        const speaker = participants.find(p => p.isSpeaking && p.userId !== currentUser?.id);
        if (speaker) {
            if (spotlightDebounce.current) clearTimeout(spotlightDebounce.current);
            spotlightDebounce.current = setTimeout(() => {
                setSpotlightUserId(speaker.userId);
            }, 800);
        }
        return () => {
            if (spotlightDebounce.current) clearTimeout(spotlightDebounce.current);
        };
    }, [viewMode, participants, currentUser?.id]);

    // Close disconnect menu on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (disconnectMenuRef.current && !disconnectMenuRef.current.contains(e.target as Node)) {
                setShowDisconnectMenu(false);
            }
        };
        if (showDisconnectMenu) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showDisconnectMenu]);

    // ═══════ Audio controls ═══════
    const handleBack = () => { setViewingChannel(null); onBack?.(); };

    const handleParticipantContextMenu = useCallback((e: React.MouseEvent, p: { userId: string; username: string; firstName?: string }) => {
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

    const handleVolumeChange = useCallback((userId: string, volume: number) => {
        setUserVolume(userId, volume);
        voiceChannelPeerManager.setRemoteVolume(userId, volume);
    }, [setUserVolume]);

    const handleOpenChat = useCallback(async (userId: string) => {
        try {
            const chat = await findOrCreatePrivateChat(userId);
            useChatStore.getState().setActiveChat(chat);
            useChatStore.getState().loadChats();
            setViewingChannel(null);
            onBack?.();
        } catch {
            toast.error('Не удалось открыть чат');
        }
    }, [setViewingChannel, onBack]);

    const toggleMute = () => {
        if (!currentChannel) return;
        const n = !isMuted; setMuted(n);
        voiceChannelPeerManager.setMuted(n);
        socketService.voiceMute(currentChannel.id, n);
    };
    const toggleDeafen = () => {
        if (!currentChannel) return;
        const n = !isDeafened; setDeafened(n);
        if (!isDeafened) { setMuted(true); voiceChannelPeerManager.setMuted(true); }
        voiceChannelPeerManager.setDeafened(n);
        socketService.voiceDeafen(currentChannel.id, n);
    };

    // ═══════ Screen share (independent from camera) with quality settings ═══════
    const toggleScreenShare = useCallback(async () => {
        if (isScreenSharing) {
            screenStreamRef.current?.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
            voiceChannelPeerManager.removeScreenTrack();
            setIsScreenSharing(false);
            // Notify others
            socketService.emit('voice:screen:stop', { channelId: currentChannel?.id });
        } else {
            try {
                const settings = useVoiceChannelStore.getState().voiceSettings;
                const qualityMap: Record<string, { width: number; height: number }> = {
                    '720p': { width: 1280, height: 720 },
                    '1080p': { width: 1920, height: 1080 },
                    'source': { width: 3840, height: 2160 },
                };
                const q = qualityMap[settings.screenShareQuality];
                const constraints: DisplayMediaStreamOptions = {
                    video: q
                        ? { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: settings.screenShareFps } }
                        : { frameRate: { ideal: settings.screenShareFps } },
                    audio: false,
                };
                const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
                screenStreamRef.current = stream;
                voiceChannelPeerManager.addScreenTrack(stream);
                stream.getVideoTracks()[0]?.addEventListener('ended', () => {
                    voiceChannelPeerManager.removeScreenTrack();
                    screenStreamRef.current = null;
                    setIsScreenSharing(false);
                    socketService.emit('voice:screen:stop', { channelId: currentChannel?.id });
                });
                setIsScreenSharing(true);
                // Notify others
                socketService.emit('voice:screen:start', { channelId: currentChannel?.id });
            } catch { /* cancelled */ }
        }
    }, [isScreenSharing, currentChannel?.id]);

    // ═══════ Camera (independent from screen share) ═══════
    const toggleCamera = useCallback(async () => {
        if (isCameraOn) {
            cameraStreamRef.current?.getTracks().forEach(t => t.stop());
            cameraStreamRef.current = null;
            voiceChannelPeerManager.removeCameraTrack();
            setIsCameraOn(false);
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
                });
                cameraStreamRef.current = stream;
                voiceChannelPeerManager.addCameraTrack(stream);
                setIsCameraOn(true);
            } catch { /* denied */ }
        }
    }, [isCameraOn]);

    // Cleanup
    useEffect(() => () => {
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    }, []);

    // ═══════ Chat socket ═══════
    useEffect(() => {
        const handler = (data: { channelId: string; userId: string; username: string; content: string }) => {
            if (data.channelId === currentChannel?.id && data.userId !== currentUser?.id) {
                setChatMessages(prev => [...prev, {
                    id: `vc-${Date.now()}-${Math.random()}`, userId: data.userId, username: data.username,
                    content: data.content, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                }]);
                setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
            }
        };
        socketService.onVoiceChatMessage(handler);
        return () => { socketService.offVoiceChatMessage(handler); };
    }, [currentChannel?.id, currentUser?.id]);
    useEffect(() => { setChatMessages([]); }, [currentChannel?.id]);

    const sendChat = () => {
        if (!chatInput.trim() || !currentChannel || !currentUser) return;
        setChatMessages(prev => [...prev, {
            id: `vc-${Date.now()}`, userId: currentUser.id,
            username: currentUser.firstName || currentUser.username || 'You',
            content: chatInput.trim(), time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        }]);
        socketService.voiceChatMessage(currentChannel.id, chatInput.trim());
        setChatInput('');
        setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
    };

    const handleDisconnect = () => {
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        cameraStreamRef.current?.getTracks().forEach(t => t.stop());
        clearWatching();
        leaveChannel();
        setViewingChannel(null);
        onBack?.();
    };

    // ═══════ Watching helpers ═══════
    const startWatching = (userId: string) => {
        const p = participants.find(pp => pp.userId === userId);
        const name = p?.firstName || p?.username || userId.slice(0, 8);
        addWatching(userId, name);
        setViewingStream({ userId, username: name });
    };

    const stopWatching = (userId: string) => {
        removeWatching(userId);
        if (viewingStream?.userId === userId) {
            // Switch to next watching stream or close
            const remaining = watchingStreams.filter(w => w.userId !== userId);
            setViewingStream(remaining.length > 0 ? remaining[0] : null);
        }
    };

    // Participants who are sharing their screen (have remote video streams)
    const sharingParticipants = participants.filter(p =>
        p.userId !== currentUser?.id && remoteStreams.has(p.userId)
    );

    // ═══════ Not connected ═══════
    if (!isConnected || !currentChannel) {
        return (
            <div className="flex flex-col h-full" style={{ background: DC.bg }}>
                <div className="flex h-12 items-center gap-3 px-4 shrink-0" style={{ background: DC.bgSec, boxShadow: `0 1px 0 ${DC.bgTer}` }}>
                    <button onClick={handleBack} className="dc-icon-btn"><ArrowLeft className="h-5 w-5" /></button>
                    <Volume2 className="h-5 w-5" style={{ color: DC.textMuted }} />
                    <span className="text-[15px] font-semibold" style={{ color: DC.textNorm }}>Voice Channel</span>
                </div>
                <div className="flex flex-col items-center justify-center flex-1 gap-3" style={{ color: DC.textMuted }}>
                    <Volume2 className="h-16 w-16 opacity-15" />
                    <p className="text-base font-medium">No Voice Channel</p>
                </div>
            </div>
        );
    }

    const isWatchingAnything = watchingStreams.length > 0;
    const showRight = rightPanel !== 'none';

    // Get the MediaStream for the currently viewed stream
    const viewingMediaStream = viewingStream
        ? (remoteStreams.get(viewingStream.userId) || [])[0] || null
        : null;

    return (
        <div className="flex h-full overflow-hidden" style={{ background: DC.bg }}>
            <div className="flex flex-col flex-1 min-w-0">

                {/* ── Header ── */}
                <div className="flex h-12 items-center gap-2 px-4 shrink-0 select-none" style={{ background: DC.bgSec, boxShadow: `0 1px 0 ${DC.bgTer}` }}>
                    <button onClick={handleBack} className="dc-icon-btn md:hidden"><ArrowLeft className="h-5 w-5" /></button>
                    <Volume2 className="h-5 w-5 shrink-0" style={{ color: DC.textMuted }} />
                    <h1 className="text-[15px] font-semibold truncate" style={{ color: DC.textNorm }}>{currentChannel.name}</h1>
                    <ConnectionQualityIndicator size={18} />
                    <div className="flex-1" />
                    <button
                        onClick={() => setViewMode(v => v === 'grid' ? 'spotlight' : 'grid')}
                        className="dc-icon-btn"
                        title={viewMode === 'grid' ? 'Spotlight View' : 'Grid View'}
                    >
                        {viewMode === 'grid' ? <Focus className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
                    </button>
                    <button onClick={() => setRightPanel(p => p === 'members' ? 'none' : 'members')} className="dc-icon-btn" data-active={rightPanel === 'members'}><Users className="h-5 w-5" /></button>
                    <button onClick={() => setRightPanel(p => p === 'chat' ? 'none' : 'chat')} className="dc-icon-btn" data-active={rightPanel === 'chat'}><MessageSquare className="h-5 w-5" /></button>
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto dc-voice-content">

                    {/* ▸ Stream notifications — users who are sharing but you haven't joined ▸ */}
                    {sharingParticipants.filter(p => !watchingStreams.some(w => w.userId === p.userId)).length > 0 && (
                        <div className="p-3 space-y-2">
                            {sharingParticipants
                                .filter(p => !watchingStreams.some(w => w.userId === p.userId))
                                .map(p => (
                                    <div key={p.userId} className="dc-stream-notify" style={{ background: DC.bgSec }}>
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <Radio className="h-4 w-4 shrink-0 animate-pulse" style={{ color: DC.red }} />
                                            <span className="text-[13px] font-medium truncate" style={{ color: DC.textNorm }}>
                                                {p.firstName || p.username}
                                            </span>
                                            <span className="text-[12px]" style={{ color: DC.textMuted }}>is sharing their screen</span>
                                        </div>
                                        <button
                                            onClick={() => startWatching(p.userId)}
                                            className="dc-watch-btn"
                                        >
                                            <Eye className="h-3.5 w-3.5" />
                                            Watch Stream
                                        </button>
                                    </div>
                                ))
                            }
                        </div>
                    )}

                    {/* ▸ Full stream view (when watching someone) ▸ */}
                    {viewingStream && viewingMediaStream && (
                        <div className="p-3 sm:p-4">
                            <div className="relative rounded-lg overflow-hidden" style={{ background: DC.bgTer }}>
                                <RemoteVideo stream={viewingMediaStream} className="w-full max-h-[55vh] object-contain" />
                                {/* Name badge */}
                                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium" style={{ background: 'rgba(0,0,0,.7)', color: '#fff', backdropFilter: 'blur(4px)' }}>
                                    <Monitor className="h-3.5 w-3.5" />
                                    {viewingStream.username}'s screen
                                </div>
                                {/* Close view */}
                                <button
                                    onClick={() => { setViewingStream(null); stopWatching(viewingStream.userId); }}
                                    className="absolute top-3 right-3 dc-icon-btn-sm"
                                    style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}
                                >
                                    <X className="h-4 w-4" style={{ color: '#fff' }} />
                                </button>
                            </div>

                            {/* Tabs for multiple watched streams */}
                            {watchingStreams.length > 1 && (
                                <div className="flex gap-1.5 mt-2 overflow-x-auto">
                                    {watchingStreams.map(w => (
                                        <button
                                            key={w.userId}
                                            onClick={() => setViewingStream(w)}
                                            className={cn("dc-stream-tab", viewingStream?.userId === w.userId && "dc-stream-tab-active")}
                                        >
                                            <Monitor className="h-3 w-3" />
                                            {w.username}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ▸ Local video preview (your screen share / camera) ▸ */}
                    {(isScreenSharing || isCameraOn) && (
                        <div className="px-3 sm:px-4 pb-2">
                            <div className="flex gap-3 max-w-3xl mx-auto">
                                {isScreenSharing && screenStreamRef.current && (
                                    <div className="relative rounded-lg overflow-hidden flex-1" style={{ background: DC.bgTer }}>
                                        <RemoteVideo stream={screenStreamRef.current} className="w-full aspect-video object-contain" />
                                        <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium" style={{ background: 'rgba(0,0,0,.7)', color: '#fff' }}>
                                            <Monitor className="h-3 w-3" /> Your screen
                                        </div>
                                    </div>
                                )}
                                {isCameraOn && cameraStreamRef.current && (
                                    <div className="relative rounded-lg overflow-hidden" style={{ background: DC.bgTer, width: isScreenSharing ? 180 : '100%', maxWidth: isScreenSharing ? 180 : '100%' }}>
                                        <RemoteVideo stream={cameraStreamRef.current} mirror className={cn("object-cover", isScreenSharing ? "aspect-[4/3]" : "w-full aspect-video")} />
                                        <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium" style={{ background: 'rgba(0,0,0,.7)', color: '#fff' }}>
                                            <Video className="h-3 w-3" /> Camera
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ▸ Participant tiles ▸ */}
                    {(() => {
                        const allP = [...participants.map(p => ({ ...p, _leaving: false })), ...leavingParticipants.map(p => ({ ...p, _leaving: true }))];
                        const empty = participants.length === 0 && leavingParticipants.length === 0;

                        if (empty) {
                            return (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-3 py-12" style={{ color: DC.textMuted }}>
                                        <Volume2 className="h-14 w-14 opacity-15" />
                                        <p className="text-sm font-medium">Waiting for others...</p>
                                    </div>
                                </div>
                            );
                        }

                        // Resolve spotlight target
                        const spotUser = spotlightUserId && participants.find(p => p.userId === spotlightUserId)
                            ? spotlightUserId
                            : participants[0]?.userId || null;

                        if (viewMode === 'spotlight' && participants.length > 1) {
                            const mainP = allP.find(p => p.userId === spotUser && !(p as any)._leaving);
                            const otherP = allP.filter(p => p.userId !== spotUser);

                            return (
                                <div className="flex-1 flex flex-col min-h-0" style={{ transition: 'all 0.2s ease' }}>
                                    {/* Spotlight main */}
                                    {mainP && (
                                        <div className="dc-spotlight-main" onContextMenu={(e) => handleParticipantContextMenu(e, mainP)}>
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="relative">
                                                    <div className={cn("dc-avatar-outer", mainP.isSpeaking && "dc-speaking")} style={{ borderWidth: 4 }}>
                                                        <Avatar className="h-[120px] w-[120px] sm:h-[160px] sm:w-[160px]">
                                                            <AvatarImage src={mainP.avatar} />
                                                            <AvatarFallback className="text-4xl font-semibold" style={{ background: DC.blurple, color: '#fff' }}>
                                                                {(mainP.firstName || mainP.username || '?').slice(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                    </div>
                                                    {(mainP.isMuted || mainP.isDeafened) && (
                                                        <div className="dc-status-badge" style={{ width: 24, height: 24 }}>
                                                            {mainP.isDeafened ? <HeadphoneOff className="h-4 w-4 text-white" /> : <MicOff className="h-4 w-4 text-white" />}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-lg font-semibold" style={{ color: mainP.isSpeaking ? DC.green : DC.textNorm }}>
                                                    {mainP.firstName || mainP.username}
                                                    {mainP.userId === currentUser?.id && <span style={{ color: DC.textMuted }}> (You)</span>}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Spotlight strip */}
                                    <div className="dc-spotlight-strip" style={{ borderTop: `1px solid ${DC.bgTer}` }}>
                                        {otherP.map(p => {
                                            const isMe = p.userId === currentUser?.id;
                                            return (
                                                <div
                                                    key={p.userId}
                                                    className={cn(
                                                        "dc-spotlight-mini",
                                                        p.userId === spotUser && "dc-spotlight-active",
                                                        (p as any)._leaving ? "dc-anim-leave" : "dc-anim-join"
                                                    )}
                                                    onClick={() => setSpotlightUserId(p.userId)}
                                                    onContextMenu={(e) => handleParticipantContextMenu(e, p)}
                                                >
                                                    <div className="relative">
                                                        <Avatar className={cn("h-10 w-10", p.isSpeaking && "dc-speaking-ring")}>
                                                            <AvatarImage src={p.avatar} />
                                                            <AvatarFallback className="text-sm font-semibold" style={{ background: DC.blurple, color: '#fff' }}>
                                                                {(p.firstName || p.username || '?').slice(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                    </div>
                                                    <span className="text-[10px] mt-1 truncate w-full text-center px-1" style={{ color: p.isSpeaking ? DC.green : DC.textMuted }}>
                                                        {isMe ? 'You' : (p.firstName || p.username)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }

                        // Grid mode (default)
                        return (
                            <div className="flex-1 flex flex-wrap justify-center items-start gap-3 sm:gap-4 p-4 sm:p-6 content-center">
                                {allP.map((p, i) => {
                                    const isMe = p.userId === currentUser?.id;
                                    const isSharing = remoteStreams.has(p.userId) || (isMe && isScreenSharing);
                                    const isWatched = watchingStreams.some(w => w.userId === p.userId);

                                    return (
                                        <div
                                            key={p.userId}
                                            className={cn("dc-ptile", (p as any)._leaving ? "dc-anim-leave" : "dc-anim-join")}
                                            style={{ animationDelay: (p as any)._leaving ? undefined : `${i * 50}ms` }}
                                            onContextMenu={(e) => handleParticipantContextMenu(e, p)}
                                        >
                                            {isSharing && (
                                                <div className="dc-live-badge">
                                                    <div className="dc-live-dot" />
                                                    LIVE
                                                </div>
                                            )}
                                            <div className="relative">
                                                <div className={cn("dc-avatar-outer", p.isSpeaking && "dc-speaking")}>
                                                    <Avatar className="h-[60px] w-[60px] sm:h-[80px] sm:w-[80px]">
                                                        <AvatarImage src={p.avatar} />
                                                        <AvatarFallback className="text-2xl font-semibold" style={{ background: DC.blurple, color: '#fff' }}>
                                                            {(p.firstName || p.username || '?').slice(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                </div>
                                                {(p.isMuted || p.isDeafened) && (
                                                    <div className="dc-status-badge">
                                                        {p.isDeafened ? <HeadphoneOff className="h-3 w-3 text-white" /> : <MicOff className="h-3 w-3 text-white" />}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="dc-ptile-name" style={{ color: p.isSpeaking ? DC.green : DC.textNorm }}>
                                                {p.firstName || p.username}
                                                {isMe && <span style={{ color: DC.textMuted }}> (You)</span>}
                                            </span>
                                            {!isMe && remoteStreams.has(p.userId) && !isWatched && (
                                                <button onClick={() => startWatching(p.userId)} className="dc-tile-watch-btn">
                                                    <Eye className="h-3 w-3" /> Watch
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>

                {/* ═══════ BOTTOM CONTROL BAR ═══════ */}
                <div className="shrink-0 select-none" style={{ background: DC.panel, boxShadow: `0 -1px 0 ${DC.bgTer}` }}>
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 max-w-xl mx-auto">
                        <CtrlBtn onClick={toggleScreenShare} active={isScreenSharing} icon={isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />} label="Screen" tooltip={isScreenSharing ? 'Stop Screen' : 'Share Screen'} />
                        <CtrlBtn onClick={toggleCamera} active={isCameraOn} icon={isCameraOn ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />} label="Video" tooltip={isCameraOn ? 'Stop Video' : 'Start Video'} />
                        <CtrlBtn onClick={toggleMute} icon={isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />} label={isPTTMode ? (isPTTActive ? 'PTT On' : 'PTT') : (isMuted ? 'Unmute' : 'Mute')} tooltip={isPTTMode ? `Push to Talk (${useVoiceChannelStore.getState().voiceSettings.pttKey})` : (isMuted ? 'Unmute' : 'Mute')} danger={isMuted && !isPTTMode} />
                        <CtrlBtn onClick={toggleDeafen} icon={isDeafened ? <HeadphoneOff className="h-5 w-5" /> : <Headphones className="h-5 w-5" />} label={isDeafened ? 'Undeafen' : 'Deafen'} tooltip={isDeafened ? 'Undeafen' : 'Deafen'} danger={isDeafened} />

                        {/* Soundboard */}
                        <div className="relative" ref={soundboardRef}>
                            <CtrlBtn
                                onClick={() => setShowSoundboard(!showSoundboard)}
                                active={showSoundboard}
                                icon={<Music2 className="h-5 w-5" />}
                                label="Sounds"
                                tooltip="Soundboard"
                            />
                            {showSoundboard && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                                    <Suspense fallback={<div className="w-[340px] h-[200px] rounded-xl animate-pulse" style={{ background: DC.bgSec }} />}>
                                        <SoundboardPanel onClose={() => setShowSoundboard(false)} />
                                    </Suspense>
                                </div>
                            )}
                        </div>

                        <div className="w-3 sm:w-6" />

                        {/* ── Disconnect / Exit stream button with dropdown ── */}
                        <div className="relative" ref={disconnectMenuRef}>
                            <div className="flex items-stretch">
                                {/* Main button */}
                                <button
                                    onClick={isWatchingAnything ? () => stopWatching(watchingStreams[watchingStreams.length - 1].userId) : handleDisconnect}
                                    className="dc-ctrl-btn"
                                    style={{
                                        background: DC.red, color: '#fff',
                                        borderTopRightRadius: isWatchingAnything ? 0 : 8,
                                        borderBottomRightRadius: isWatchingAnything ? 0 : 8,
                                    }}
                                >
                                    {isWatchingAnything ? <LogOut className="h-5 w-5" /> : <PhoneOff className="h-5 w-5" />}
                                    <span className="dc-ctrl-label" style={{ color: 'rgba(255,255,255,.8)' }}>
                                        {isWatchingAnything ? 'Exit Stream' : 'Leave'}
                                    </span>
                                </button>

                                {/* Dropdown arrow (only when watching) */}
                                {isWatchingAnything && (
                                    <button
                                        onClick={() => setShowDisconnectMenu(!showDisconnectMenu)}
                                        className="flex items-center justify-center px-1.5 transition-colors"
                                        style={{
                                            background: showDisconnectMenu ? '#d63031' : DC.red,
                                            borderTopRightRadius: 8,
                                            borderBottomRightRadius: 8,
                                            borderLeft: '1px solid rgba(255,255,255,.15)',
                                        }}
                                    >
                                        <ChevronDown className="h-4 w-4 text-white" style={{ transform: showDisconnectMenu ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                                    </button>
                                )}
                            </div>

                            {/* ── Dropdown menu ── */}
                            {showDisconnectMenu && (
                                <div className="dc-disconnect-menu" style={{ background: DC.bgTer }}>
                                    {watchingStreams.map(w => (
                                        <button
                                            key={w.userId}
                                            onClick={() => { stopWatching(w.userId); setShowDisconnectMenu(false); }}
                                            className="dc-disconnect-item"
                                        >
                                            <Monitor className="h-4 w-4 shrink-0" style={{ color: DC.textMuted }} />
                                            <span className="flex-1 truncate text-left">Leave {w.username}'s stream</span>
                                        </button>
                                    ))}
                                    <div className="mx-2 my-1" style={{ height: 1, background: DC.btnHov }} />
                                    <button onClick={() => { handleDisconnect(); setShowDisconnectMenu(false); }} className="dc-disconnect-item dc-disconnect-danger">
                                        <PhoneOff className="h-4 w-4 shrink-0" />
                                        <span className="flex-1 text-left">Disconnect from Voice</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════ RIGHT SIDEBAR ═══════ */}
            {showRight && (
                <div className="dc-right-sidebar hidden sm:flex" style={{ background: DC.bgSec, borderLeft: `1px solid ${DC.bgTer}` }}>
                    {rightPanel === 'members' && (
                        <>
                            <div className="dc-sidebar-header" style={{ boxShadow: `0 1px 0 ${DC.bgTer}` }}>
                                <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4" style={{ color: DC.textMuted }} />
                                    <span className="text-xs font-bold tracking-wide uppercase" style={{ color: DC.textMuted }}>Members — {participants.length}</span>
                                </div>
                                <button onClick={() => setRightPanel('none')} className="dc-icon-btn-sm"><X className="h-4 w-4" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-0.5">
                                {participants.map(p => <MemberRow key={p.userId} p={p} isMe={p.userId === currentUser?.id} isSharing={remoteStreams.has(p.userId) || (p.userId === currentUser?.id && isScreenSharing)} onContextMenu={(e) => handleParticipantContextMenu(e, p)} />)}
                            </div>
                        </>
                    )}
                    {rightPanel === 'chat' && (
                        <>
                            <div className="dc-sidebar-header" style={{ boxShadow: `0 1px 0 ${DC.bgTer}` }}>
                                <div className="flex items-center gap-2">
                                    <Hash className="h-4 w-4" style={{ color: DC.textMuted }} />
                                    <span className="text-sm font-semibold" style={{ color: DC.textNorm }}>{currentChannel.name}</span>
                                </div>
                                <button onClick={() => setRightPanel('none')} className="dc-icon-btn-sm"><X className="h-4 w-4" /></button>
                            </div>
                            <div ref={chatScrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
                                {chatMessages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: DC.textFaint }}>
                                        <Hash className="h-8 w-8 opacity-20" /><p className="text-xs">Voice channel chat</p>
                                    </div>
                                ) : chatMessages.map(msg => (
                                    <div key={msg.id} className="dc-chat-msg">
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-[13px] font-medium cursor-pointer hover:underline" style={{ color: msg.userId === currentUser?.id ? DC.blurple : DC.green }}>{msg.username}</span>
                                            <span className="text-[10px]" style={{ color: DC.textFaint }}>{msg.time}</span>
                                        </div>
                                        <p className="text-[13px] leading-snug mt-0.5" style={{ color: DC.textNorm }}>{msg.content}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="px-3 pb-3 shrink-0">
                                <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: DC.inputBg }}>
                                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }} placeholder={`Message #${currentChannel.name}`} className="flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-40" style={{ color: DC.textNorm }} />
                                    <button onClick={sendChat} disabled={!chatInput.trim()} className="dc-icon-btn-sm disabled:opacity-30"><Send className="h-4 w-4" /></button>
                                </div>
                            </div>
                        </>
                    )}
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
                    onChat={handleOpenChat}
                    onMuteUser={handleMuteUser}
                    isUserMuted={mutedUsers.has(ctxMenu.userId)}
                    userVolume={userVolumes[ctxMenu.userId] ?? 100}
                    onVolumeChange={handleVolumeChange}
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

// ═══════ Sub-components ═══════

function RemoteVideo({ stream, mirror, className }: { stream: MediaStream; mirror?: boolean; className?: string }) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
    return <video ref={ref} autoPlay playsInline muted className={className} style={mirror ? { transform: 'scaleX(-1)' } : undefined} />;
}

function CtrlBtn({ onClick, active, icon, label, tooltip, danger, disconnect }: {
    onClick: () => void; active?: boolean; icon: React.ReactNode; label: string; tooltip: string; danger?: boolean; disconnect?: boolean;
}) {
    const [hov, setHov] = useState(false);
    const bg = disconnect ? DC.red : active ? '#fff' : hov ? DC.btnHov : DC.btnBg;
    const fg = disconnect ? '#fff' : active ? '#000' : danger ? DC.red : hov ? DC.textNorm : DC.textMuted;
    return (
        <div className="relative">
            <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} className="dc-ctrl-btn" style={{ background: bg, color: fg }}>
                {icon}
                <span className="dc-ctrl-label" style={{ color: disconnect ? 'rgba(255,255,255,.8)' : danger ? DC.red : undefined }}>{label}</span>
            </button>
            {hov && <div className="dc-tt">{tooltip}<div className="dc-tt-arrow" /></div>}
        </div>
    );
}

function MemberRow({ p, isMe, isSharing, onContextMenu }: { p: { userId: string; username: string; firstName?: string; avatar?: string; isMuted: boolean; isDeafened: boolean; isSpeaking: boolean }; isMe?: boolean; isSharing?: boolean; onContextMenu?: (e: React.MouseEvent) => void }) {
    const [hov, setHov] = useState(false);
    return (
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors cursor-default" style={{ background: hov ? DC.btnHov : 'transparent' }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onContextMenu={onContextMenu}>
            <div className="relative shrink-0">
                <Avatar className={cn("h-8 w-8", p.isSpeaking && "dc-speaking-ring")}>
                    <AvatarImage src={p.avatar} />
                    <AvatarFallback className="text-[10px] font-semibold text-white" style={{ background: DC.blurple }}>{(p.firstName || p.username || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                {p.isSpeaking && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ background: DC.green, borderColor: DC.bgSec }} />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate" style={{ color: p.isSpeaking ? DC.green : DC.textNorm }}>
                    {p.firstName || p.username}
                    {isMe && <span className="text-[11px] ml-1" style={{ color: DC.textMuted }}>(You)</span>}
                </div>
                {isSharing && <div className="text-[10px] font-medium" style={{ color: DC.red }}>Sharing screen</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {p.isMuted && <MicOff className="h-3.5 w-3.5" style={{ color: DC.red }} />}
                {p.isDeafened && <HeadphoneOff className="h-3.5 w-3.5" style={{ color: DC.red }} />}
            </div>
        </div>
    );
}
