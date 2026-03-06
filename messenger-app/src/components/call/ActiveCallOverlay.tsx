import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCallStore } from '@/stores/callStore';
import { useAuthStore } from '@/stores/authStore';
import { socketService } from '@/lib/socket';
import { peerManager } from '@/lib/webrtc/PeerManager';
import { ringtone } from '@/lib/ringtone';
import { playCallConnectSound, playCallEndSound } from '@/lib/notifications';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    MicOff, HeadphoneOff, Maximize2, Minimize2, GripHorizontal,
    PanelLeft, PanelRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CallControlBar } from './CallControlBar';
import { CallParticipantTile } from './CallParticipantTile';
import { CallParticipantContextMenu } from './CallParticipantContextMenu';
import { ConnectionQualityIcon } from './ConnectionQualityIcon';

type DockPosition = 'float' | 'left' | 'right' | 'top' | 'bottom' | 'fullscreen';

const MIN_W = 320;
const MIN_H = 280;
const DEFAULT_W = 420;
const DEFAULT_H = 520;

export function ActiveCallOverlay() {
    const activeCall = useCallStore((s) => s.activeCall);
    const isCameraOn = useCallStore((s) => s.isCameraOn);
    const isScreenSharing = useCallStore((s) => s.isScreenSharing);
    const cameraStream = useCallStore((s) => s.cameraStream);
    const remoteVideos = useCallStore((s) => s.remoteVideos);
    const speakingUsers = useCallStore((s) => s.speakingUsers);
    const connectionQuality = useCallStore((s) => s.connectionQuality);
    const reset = useCallStore((s) => s.reset);
    const currentUser = useAuthStore((s) => s.user);

    const [elapsed, setElapsed] = useState(0);
    const [contextMenu, setContextMenu] = useState<{ userId: string; username: string; x: number; y: number } | null>(null);

    // Window management
    const [dock, setDock] = useState<DockPosition>('float');
    const [pos, setPos] = useState({ x: window.innerWidth - DEFAULT_W - 16, y: 16 });
    const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [showDockHint, setShowDockHint] = useState<DockPosition | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, edge: '' });
    const overlayRef = useRef<HTMLDivElement>(null);

    // Local video ref
    const localVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (localVideoRef.current && cameraStream) {
            localVideoRef.current.srcObject = cameraStream;
        }
    }, [cameraStream]);

    // Animate in
    useEffect(() => {
        if (activeCall) {
            requestAnimationFrame(() => setIsVisible(true));
        } else {
            setIsVisible(false);
        }
    }, [activeCall]);

    // Timer
    useEffect(() => {
        if (!activeCall || activeCall.status !== 'active') {
            setElapsed(0);
            return;
        }
        const startTime = new Date(activeCall.startedAt).getTime();
        const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [activeCall?.startedAt, activeCall?.status]);

    // Caller-side ringback tone
    const prevStatusRef = useRef<string | null>(null);
    useEffect(() => {
        const status = activeCall?.status;
        const isInit = activeCall?.initiatorId === currentUser?.id;
        if (status === 'ringing' && isInit && !ringtone.isPlaying()) {
            ringtone.startCallerTone();
        }
        if (status === 'active' && prevStatusRef.current && prevStatusRef.current !== 'active') {
            ringtone.stop();
            playCallConnectSound();
        }
        if (prevStatusRef.current === 'ringing' && status !== 'ringing') {
            ringtone.stop();
        }
        prevStatusRef.current = status || null;
    }, [activeCall?.status, activeCall?.initiatorId, currentUser?.id]);

    // Play end sound on unmount
    const activeCallRef = useRef(activeCall);
    activeCallRef.current = activeCall;
    useEffect(() => {
        return () => {
            if (activeCallRef.current) {
                ringtone.stop();
                playCallEndSound();
            }
        };
    }, []);

    // Start stats polling when active
    useEffect(() => {
        if (activeCall?.status === 'active') {
            peerManager.onConnectionQualityChange((quality, stats) => {
                useCallStore.getState().setConnectionQuality(quality);
                useCallStore.getState().setConnectionStats(stats);
            });
            peerManager.startStatsPolling();
        }
        return () => { peerManager.stopStatsPolling(); };
    }, [activeCall?.status]);

    // ═══════════════════════════════════════
    //  Drag logic
    // ═══════════════════════════════════════
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        if (dock !== 'float') return;
        e.preventDefault();
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
    }, [dock, pos]);

    useEffect(() => {
        if (!isDragging) return;
        const handleMove = (e: MouseEvent) => {
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            const newX = Math.max(0, Math.min(window.innerWidth - size.w, dragStart.current.posX + dx));
            const newY = Math.max(0, Math.min(window.innerHeight - size.h, dragStart.current.posY + dy));
            setPos({ x: newX, y: newY });

            // Detect dock zones (edges of viewport)
            const threshold = 24;
            let hint: DockPosition | null = null;
            if (e.clientX < threshold) hint = 'left';
            else if (e.clientX > window.innerWidth - threshold) hint = 'right';
            else if (e.clientY < threshold) hint = 'top';
            else if (e.clientY > window.innerHeight - threshold) hint = 'bottom';
            setShowDockHint(hint);
        };
        const handleUp = (e: MouseEvent) => {
            setIsDragging(false);
            // Dock if dragged to edge
            const threshold = 24;
            if (e.clientX < threshold) setDock('left');
            else if (e.clientX > window.innerWidth - threshold) setDock('right');
            else if (e.clientY < threshold) setDock('top');
            else if (e.clientY > window.innerHeight - threshold) setDock('bottom');
            setShowDockHint(null);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [isDragging, size.w, size.h]);

    // ═══════════════════════════════════════
    //  Resize logic
    // ═══════════════════════════════════════
    const handleResizeStart = useCallback((e: React.MouseEvent, edge: string) => {
        if (dock !== 'float') return;
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h, edge };
    }, [dock, size]);

    useEffect(() => {
        if (!isResizing) return;
        const handleMove = (e: MouseEvent) => {
            const dx = e.clientX - resizeStart.current.x;
            const dy = e.clientY - resizeStart.current.y;
            const { edge } = resizeStart.current;
            let newW = resizeStart.current.w;
            let newH = resizeStart.current.h;
            if (edge.includes('r')) newW += dx;
            if (edge.includes('l')) newW -= dx;
            if (edge.includes('b')) newH += dy;
            if (edge.includes('t')) newH -= dy;
            newW = Math.max(MIN_W, Math.min(newW, window.innerWidth - 40));
            newH = Math.max(MIN_H, Math.min(newH, window.innerHeight - 40));
            setSize({ w: newW, h: newH });
            if (edge.includes('l')) {
                setPos(p => ({ ...p, x: p.x + (resizeStart.current.w - newW) }));
            }
            if (edge.includes('t')) {
                setPos(p => ({ ...p, y: p.y + (resizeStart.current.h - newH) }));
            }
            resizeStart.current.w = newW;
            resizeStart.current.h = newH;
            resizeStart.current.x = e.clientX;
            resizeStart.current.y = e.clientY;
        };
        const handleUp = () => setIsResizing(false);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [isResizing]);

    // ═══════════════════════════════════════
    //  Helpers
    // ═══════════════════════════════════════
    const formatTime = (s: number) => {
        const min = Math.floor(s / 60);
        const sec = s % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    const handleLeave = useCallback(() => {
        if (!activeCall) return;
        ringtone.stop();
        socketService.leaveCall(activeCall.callId);
        peerManager.destroy();
        playCallEndSound();
        reset();
    }, [activeCall, reset]);

    const isUserSpeaking = useCallback((userId: string) => {
        if (userId === currentUser?.id) return speakingUsers['local'] ?? false;
        return speakingUsers[userId] ?? false;
    }, [currentUser?.id, speakingUsers]);

    const handleParticipantContextMenu = useCallback((e: React.MouseEvent, userId: string, username: string) => {
        e.preventDefault();
        if (userId === currentUser?.id) return;
        setContextMenu({ userId, username, x: e.clientX, y: e.clientY });
    }, [currentUser?.id]);

    const toggleFullscreen = useCallback(() => {
        if (dock === 'fullscreen') {
            setDock('float');
        } else {
            setDock('fullscreen');
        }
    }, [dock]);

    const undock = useCallback(() => {
        setDock('float');
        setPos({ x: window.innerWidth - size.w - 16, y: 16 });
    }, [size.w]);

    if (!activeCall) return null;

    const isRinging = activeCall.status === 'ringing' || activeCall.status === 'connecting';
    const statusText = activeCall.status === 'ringing' ? 'Вызов...'
        : activeCall.status === 'connecting' ? 'Подключение...'
        : formatTime(elapsed);

    const isPrivateCall = activeCall.type === 'private' || activeCall.participants.length <= 2;
    const otherPerson = isPrivateCall
        ? activeCall.participants.find(p => p.userId !== currentUser?.id) || activeCall.participants[0]
        : null;
    const otherPersonVideo = otherPerson ? remoteVideos[otherPerson.userId] : null;

    const screenShareUser = Object.entries(remoteVideos).find(([, v]) => v.screen);
    const hasFocusedScreen = !!screenShareUser || isScreenSharing;

    // Compute style based on dock position
    const isFullscreen = dock === 'fullscreen';
    const isDocked = dock !== 'float' && dock !== 'fullscreen';

    const getContainerStyle = (): React.CSSProperties => {
        if (isFullscreen) return { inset: 0, width: '100%', height: '100%' };
        if (dock === 'left') return { top: 0, left: 0, width: '50%', height: '100%' };
        if (dock === 'right') return { top: 0, right: 0, width: '50%', height: '100%' };
        if (dock === 'top') return { top: 0, left: 0, width: '100%', height: '50%' };
        if (dock === 'bottom') return { bottom: 0, left: 0, width: '100%', height: '50%' };
        // Float
        return {
            top: pos.y,
            left: pos.x,
            width: size.w,
            height: size.h,
        };
    };

    const containerStyle = getContainerStyle();
    const isFloat = dock === 'float';

    const content = (
        <div
            ref={overlayRef}
            className={cn(
                'fixed z-[90] flex flex-col bg-[#1e1f22] overflow-hidden select-none',
                'transition-all duration-300 ease-out',
                isFloat && 'rounded-xl shadow-2xl border border-white/10',
                isDocked && 'rounded-none',
                !isVisible && 'scale-95 opacity-0',
                isVisible && 'scale-100 opacity-100',
            )}
            style={{
                ...containerStyle,
                ...(isDragging || isResizing ? { transition: 'none' } : {}),
            }}
        >
            {/* Title bar — draggable */}
            <div
                className={cn(
                    'flex items-center gap-2 px-3 py-1.5 bg-[#232428] shrink-0',
                    isFloat && 'cursor-grab active:cursor-grabbing',
                    isDragging && 'cursor-grabbing',
                )}
                onMouseDown={handleDragStart}
                onDoubleClick={toggleFullscreen}
            >
                {isFloat && <GripHorizontal className="h-3.5 w-3.5 text-[#949ba4] shrink-0" />}

                <span className="text-[#dbdee1] text-xs font-medium truncate flex-1">
                    {activeCall.chatTitle}
                </span>

                <span className="text-[#949ba4] text-xs font-mono tabular-nums shrink-0">
                    {statusText}
                </span>

                {activeCall.status === 'active' && (
                    <ConnectionQualityIcon quality={connectionQuality} className="shrink-0" />
                )}

                {/* Dock buttons */}
                <div className="flex items-center gap-0.5 ml-1 shrink-0" onMouseDown={e => e.stopPropagation()}>
                    {isDocked && (
                        <button onClick={undock} className="h-6 w-6 rounded flex items-center justify-center text-[#949ba4] hover:bg-white/10 hover:text-[#dbdee1] transition-colors" title="Открепить">
                            <Minimize2 className="h-3 w-3" />
                        </button>
                    )}
                    {!isDocked && dock !== 'fullscreen' && (
                        <>
                            <button onClick={() => setDock('left')} className="h-6 w-6 rounded flex items-center justify-center text-[#949ba4] hover:bg-white/10 hover:text-[#dbdee1] transition-colors" title="Прикрепить слева">
                                <PanelLeft className="h-3 w-3" />
                            </button>
                            <button onClick={() => setDock('right')} className="h-6 w-6 rounded flex items-center justify-center text-[#949ba4] hover:bg-white/10 hover:text-[#dbdee1] transition-colors" title="Прикрепить справа">
                                <PanelRight className="h-3 w-3" />
                            </button>
                        </>
                    )}
                    <button onClick={toggleFullscreen} className="h-6 w-6 rounded flex items-center justify-center text-[#949ba4] hover:bg-white/10 hover:text-[#dbdee1] transition-colors" title={isFullscreen ? 'Свернуть' : 'На весь экран'}>
                        {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                    </button>
                </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex overflow-hidden relative">
                {isPrivateCall ? (
                    <PrivateCallContent
                        otherPerson={otherPerson}
                        otherPersonVideo={otherPersonVideo}
                        isUserSpeaking={isUserSpeaking}
                        isRinging={isRinging}
                        statusText={statusText}
                        isCameraOn={isCameraOn}
                        cameraStream={cameraStream}
                        localVideoRef={localVideoRef}
                        isCompact={isFloat && size.h < 400}
                    />
                ) : hasFocusedScreen ? (
                    <div className="flex-1 flex">
                        <div className="flex-[3] flex items-center justify-center bg-black p-1">
                            {screenShareUser ? (
                                <RemoteVideo stream={screenShareUser[1].screen!} isSpeaking={false} objectFit="contain" />
                            ) : isScreenSharing ? (
                                <div className="text-[#949ba4] text-sm">Вы демонстрируете экран</div>
                            ) : null}
                        </div>
                        <div className="w-48 flex flex-col gap-1 p-1 overflow-y-auto bg-[#232428]">
                            {activeCall.participants.map((p) => (
                                <CallParticipantTile
                                    key={p.userId} userId={p.userId} username={p.username}
                                    firstName={p.firstName} avatar={p.avatar} isMuted={p.isMuted}
                                    isDeafened={p.isDeafened} isSpeaking={isUserSpeaking(p.userId)}
                                    videoStream={p.userId === currentUser?.id ? (isCameraOn ? cameraStream : null) : remoteVideos[p.userId]?.camera}
                                    isLocal={p.userId === currentUser?.id}
                                    onContextMenu={(e) => handleParticipantContextMenu(e, p.userId, p.firstName || p.username)}
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 p-2">
                        <div className="w-full h-full grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                            {activeCall.participants.map((p) => (
                                <CallParticipantTile
                                    key={p.userId} userId={p.userId} username={p.username}
                                    firstName={p.firstName} avatar={p.avatar} isMuted={p.isMuted}
                                    isDeafened={p.isDeafened} isSpeaking={isUserSpeaking(p.userId)}
                                    videoStream={p.userId === currentUser?.id ? (isCameraOn ? cameraStream : null) : remoteVideos[p.userId]?.camera}
                                    isLocal={p.userId === currentUser?.id}
                                    onContextMenu={(e) => handleParticipantContextMenu(e, p.userId, p.firstName || p.username)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom control bar */}
            <div className="flex items-center justify-center py-2 bg-[#1e1f22] shrink-0">
                <CallControlBar onLeave={handleLeave} participantCount={activeCall.participants.length} />
            </div>

            {/* Resize handles (float mode only) */}
            {isFloat && (
                <>
                    <div className="absolute top-0 left-0 w-2 h-full cursor-w-resize" onMouseDown={e => handleResizeStart(e, 'l')} />
                    <div className="absolute top-0 right-0 w-2 h-full cursor-e-resize" onMouseDown={e => handleResizeStart(e, 'r')} />
                    <div className="absolute top-0 left-0 h-2 w-full cursor-n-resize" onMouseDown={e => handleResizeStart(e, 't')} />
                    <div className="absolute bottom-0 left-0 h-2 w-full cursor-s-resize" onMouseDown={e => handleResizeStart(e, 'b')} />
                    <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize" onMouseDown={e => handleResizeStart(e, 'tl')} />
                    <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize" onMouseDown={e => handleResizeStart(e, 'tr')} />
                    <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize" onMouseDown={e => handleResizeStart(e, 'bl')} />
                    <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize" onMouseDown={e => handleResizeStart(e, 'br')} />
                </>
            )}

            {/* Context menu */}
            {contextMenu && (
                <CallParticipantContextMenu
                    userId={contextMenu.userId} username={contextMenu.username}
                    x={contextMenu.x} y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </div>
    );

    return createPortal(
        <>
            {content}
            {/* Dock hint overlay */}
            {showDockHint && isDragging && (
                <div className="fixed inset-0 z-[89] pointer-events-none">
                    <div className={cn(
                        'absolute bg-[#5865f2]/20 border-2 border-[#5865f2]/50 rounded-lg transition-all duration-150',
                        showDockHint === 'left' && 'top-2 left-2 bottom-2 w-[calc(50%-8px)]',
                        showDockHint === 'right' && 'top-2 right-2 bottom-2 w-[calc(50%-8px)]',
                        showDockHint === 'top' && 'top-2 left-2 right-2 h-[calc(50%-8px)]',
                        showDockHint === 'bottom' && 'bottom-2 left-2 right-2 h-[calc(50%-8px)]',
                    )} />
                </div>
            )}
        </>,
        document.body
    );
}

// ═══════════════════════════════════════════════
//  Private call content with PiP webcam
// ═══════════════════════════════════════════════
function PrivateCallContent({
    otherPerson,
    otherPersonVideo,
    isUserSpeaking,
    isRinging,
    statusText,
    isCameraOn,
    cameraStream,
    localVideoRef,
    isCompact,
}: {
    otherPerson: { userId: string; username: string; firstName?: string; avatar?: string; isMuted: boolean; isDeafened?: boolean } | null;
    otherPersonVideo: { camera?: MediaStream; screen?: MediaStream } | null;
    isUserSpeaking: (userId: string) => boolean;
    isRinging: boolean;
    statusText: string;
    isCameraOn: boolean;
    cameraStream: MediaStream | null;
    localVideoRef: React.RefObject<HTMLVideoElement | null>;
    isCompact: boolean;
}) {
    // Draggable PiP for local camera
    const [pipPos, setPipPos] = useState({ x: 8, y: 8 });
    const [pipDragging, setPipDragging] = useState(false);
    const pipDragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handlePipDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setPipDragging(true);
        pipDragStart.current = { x: e.clientX, y: e.clientY, px: pipPos.x, py: pipPos.y };
    }, [pipPos]);

    useEffect(() => {
        if (!pipDragging) return;
        const handleMove = (e: MouseEvent) => {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const dx = e.clientX - pipDragStart.current.x;
            const dy = e.clientY - pipDragStart.current.y;
            const pipW = 144;
            const pipH = 108;
            const newX = Math.max(4, Math.min(rect.width - pipW - 4, pipDragStart.current.px + dx));
            const newY = Math.max(4, Math.min(rect.height - pipH - 4, pipDragStart.current.py + dy));
            setPipPos({ x: newX, y: newY });
        };
        const handleUp = () => setPipDragging(false);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [pipDragging]);

    return (
        <div ref={containerRef} className="flex-1 flex items-center justify-center relative overflow-hidden">
            {otherPersonVideo?.camera ? (
                <RemoteVideo
                    stream={otherPersonVideo.camera}
                    isSpeaking={otherPerson ? isUserSpeaking(otherPerson.userId) : false}
                />
            ) : (
                <div className={cn('flex flex-col items-center', isCompact ? 'gap-2' : 'gap-4')}>
                    <div className={cn(
                        'relative rounded-full transition-shadow duration-200',
                        otherPerson && isUserSpeaking(otherPerson.userId) && 'ring-4 ring-[#23a559] shadow-[0_0_24px_rgba(35,165,89,0.4)]'
                    )}>
                        <Avatar className={isCompact ? 'h-20 w-20' : 'h-28 w-28'}>
                            <AvatarImage src={otherPerson?.avatar} className="object-cover" />
                            <AvatarFallback className="bg-[#5865f2] text-white text-3xl font-medium">
                                {(otherPerson?.firstName || otherPerson?.username || '?').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <div className="text-center">
                        <p className={cn('text-[#dbdee1] font-semibold', isCompact ? 'text-base' : 'text-xl')}>
                            {otherPerson?.firstName || otherPerson?.username}
                        </p>
                        {isRinging && (
                            <p className="text-[#949ba4] text-sm animate-pulse mt-1">{statusText}</p>
                        )}
                    </div>
                    {!isCompact && (
                        <div className="flex items-center gap-2">
                            {otherPerson?.isMuted && (
                                <div className="flex items-center gap-1 text-[#ed4245] text-xs">
                                    <MicOff className="h-3.5 w-3.5" /> Микрофон выключен
                                </div>
                            )}
                            {otherPerson?.isDeafened && (
                                <div className="flex items-center gap-1 text-[#ed4245] text-xs">
                                    <HeadphoneOff className="h-3.5 w-3.5" /> Оглушён
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Draggable PiP local camera */}
            {isCameraOn && cameraStream && (
                <div
                    className={cn(
                        'absolute w-36 aspect-[4/3] rounded-lg overflow-hidden border-2 border-[#232428] shadow-lg cursor-grab active:cursor-grabbing',
                        'transition-shadow hover:shadow-xl hover:border-[#5865f2]/50',
                        pipDragging && 'cursor-grabbing ring-2 ring-[#5865f2]/30',
                    )}
                    style={{
                        right: pipPos.x,
                        bottom: pipPos.y,
                        transition: pipDragging ? 'none' : 'right 0.2s ease, bottom 0.2s ease',
                    }}
                    onMouseDown={handlePipDragStart}
                >
                    <video
                        ref={localVideoRef}
                        autoPlay playsInline muted
                        className="w-full h-full object-cover scale-x-[-1]"
                    />
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════
//  Remote video renderer
// ═══════════════════════════════════════════════
function RemoteVideo({ stream, isSpeaking, objectFit = 'cover' }: { stream: MediaStream; isSpeaking: boolean; objectFit?: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
    }, [stream]);

    return (
        <video
            ref={videoRef}
            autoPlay playsInline
            className={cn(
                'w-full h-full rounded-lg transition-shadow duration-200',
                isSpeaking && 'ring-2 ring-[#23a559] shadow-[0_0_12px_rgba(35,165,89,0.3)]'
            )}
            style={{ objectFit: objectFit as any }}
        />
    );
}
