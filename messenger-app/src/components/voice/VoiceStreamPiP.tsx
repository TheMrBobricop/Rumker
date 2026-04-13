import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { voiceChannelPeerManager } from '@/lib/webrtc/VoiceChannelPeerManager';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Monitor, X, Maximize2 } from 'lucide-react';

const DC = {
    red: '#ed4245',
    bgTer: '#1e1f22',
} as const;

/**
 * Floating PiP window for watched streams when user navigates away
 * from the voice panel. Draggable, shows the first watched stream.
 */
export function VoiceStreamPiP() {
    const watchingStreams = useVoiceChannelStore((s) => s.watchingStreams);
    const removeWatching = useVoiceChannelStore((s) => s.removeWatching);
    const setViewingChannel = useVoiceChannelStore((s) => s.setViewingChannel);
    const currentChannel = useVoiceChannelStore((s) => s.currentChannel);
    const isConnected = useVoiceChannelStore((s) => s.isConnected);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream[]>>(new Map());

    // Subscribe to remote video
    useEffect(() => {
        return voiceChannelPeerManager.onRemoteVideoChange((streams) => {
            setRemoteStreams(new Map(streams));
        });
    }, []);

    // Dragging state
    const pipRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: -1, y: -1 }); // -1 = uninitialized
    const dragging = useRef(false);
    const offset = useRef({ x: 0, y: 0 });

    // Initialize position to bottom-right
    useEffect(() => {
        if (pos.x === -1) {
            setPos({
                x: window.innerWidth - 340,
                y: window.innerHeight - 220,
            });
        }
    }, [pos.x]);

    const videoRef = useRef<HTMLVideoElement>(null);

    // Find the first stream to display
    const firstWatching = watchingStreams[0];
    const mediaStream = firstWatching ? (remoteStreams.get(firstWatching.userId) || [])[0] || null : null;

    // Set video srcObject
    useEffect(() => {
        if (videoRef.current && mediaStream) {
            videoRef.current.srcObject = mediaStream;
        }
    }, [mediaStream]);

    // ═══ Drag handlers ═══
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        // Ignore clicks on buttons
        if ((e.target as HTMLElement).closest('button')) return;
        dragging.current = true;
        offset.current = {
            x: e.clientX - pos.x,
            y: e.clientY - pos.y,
        };
        e.preventDefault();
    }, [pos]);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const newX = Math.max(0, Math.min(window.innerWidth - 320, e.clientX - offset.current.x));
            const newY = Math.max(0, Math.min(window.innerHeight - 200, e.clientY - offset.current.y));
            setPos({ x: newX, y: newY });
        };
        const onMouseUp = () => { dragging.current = false; };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    // Touch drag
    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        const touch = e.touches[0];
        dragging.current = true;
        offset.current = {
            x: touch.clientX - pos.x,
            y: touch.clientY - pos.y,
        };
    }, [pos]);

    useEffect(() => {
        const onTouchMove = (e: TouchEvent) => {
            if (!dragging.current) return;
            const touch = e.touches[0];
            const newX = Math.max(0, Math.min(window.innerWidth - 320, touch.clientX - offset.current.x));
            const newY = Math.max(0, Math.min(window.innerHeight - 200, touch.clientY - offset.current.y));
            setPos({ x: newX, y: newY });
        };
        const onTouchEnd = () => { dragging.current = false; };
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
        return () => {
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };
    }, []);

    // Don't render if nothing to show
    if (!isConnected || !currentChannel || watchingStreams.length === 0 || !mediaStream || pos.x === -1) {
        return null;
    }

    const openPanel = () => {
        setViewingChannel({
            id: currentChannel.id,
            name: currentChannel.name,
            chatId: '',
        });
    };

    const closeStream = () => {
        if (firstWatching) removeWatching(firstWatching.userId);
    };

    return (
        <div
            ref={pipRef}
            className="dc-pip animate-dc-pip-in"
            style={{
                left: pos.x,
                top: pos.y,
                width: 320,
                height: 190,
                background: DC.bgTer,
            }}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
        >
            {/* Video */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
                style={{ background: '#000' }}
            />

            {/* Name badge */}
            <div className="dc-pip-name">
                <Monitor className="h-3 w-3" />
                {firstWatching.username}
            </div>

            {/* Hover controls */}
            <div className="dc-pip-controls">
                {/* Expand — go to voice panel */}
                <button
                    onClick={openPanel}
                    className="dc-pip-btn"
                    style={{ background: 'rgba(255,255,255,.15)' }}
                    title="Open voice panel"
                >
                    <Maximize2 className="h-4 w-4 text-white" />
                </button>

                {/* Close stream */}
                <button
                    onClick={closeStream}
                    className="dc-pip-btn"
                    style={{ background: DC.red }}
                    title="Close stream"
                >
                    <X className="h-4 w-4 text-white" />
                </button>
            </div>
        </div>
    );
}
