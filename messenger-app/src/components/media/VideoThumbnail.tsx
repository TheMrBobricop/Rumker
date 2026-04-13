import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';

interface VideoThumbnailProps {
    src: string;
    onOpenViewer: () => void;
}

export function VideoThumbnail({ src, onOpenViewer }: VideoThumbnailProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [thumbnailReady, setThumbnailReady] = useState(false);
    const lastTapRef = useRef(0);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onMeta = () => {
            setDuration(video.duration || 0);
            setThumbnailReady(true);
        };
        const onTime = () => setCurrentTime(video.currentTime);
        const onEnd = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };

        video.addEventListener('loadedmetadata', onMeta);
        video.addEventListener('timeupdate', onTime);
        video.addEventListener('ended', onEnd);
        return () => {
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('timeupdate', onTime);
            video.removeEventListener('ended', onEnd);
        };
    }, []);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (isPlaying) {
            video.pause();
            setIsPlaying(false);
        } else {
            video.play();
            setIsPlaying(true);
        }
    }, [isPlaying]);

    const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
            // Double tap — open viewer
            const video = videoRef.current;
            if (video && isPlaying) {
                video.pause();
                setIsPlaying(false);
            }
            onOpenViewer();
            lastTapRef.current = 0;
            return;
        }
        lastTapRef.current = now;
        // Single tap — toggle play
        togglePlay();
    }, [togglePlay, onOpenViewer, isPlaying]);

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const fmt = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div
            className="relative overflow-hidden rounded-t-[var(--message-border-radius,12px)] cursor-pointer bg-black min-h-[120px] -mx-2.5 -mt-1.5 mb-1"
            onClick={handleClick}
        >
            <video
                ref={videoRef}
                src={src}
                className="max-h-[300px] w-full object-contain bg-black"
                preload="metadata"
                playsInline
                crossOrigin="anonymous"
            />

            {/* Play/Pause overlay — shown when NOT playing or on hover */}
            {!isPlaying && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 transition-colors">
                    <div className="bg-black/50 rounded-full p-3 backdrop-blur-sm">
                        <Play className="h-6 w-6 text-white fill-white" />
                    </div>
                </div>
            )}

            {/* Pause overlay on hover while playing */}
            {isPlaying && (
                <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <div className="bg-black/50 rounded-full p-3 backdrop-blur-sm">
                        <Pause className="h-6 w-6 text-white fill-white" />
                    </div>
                </div>
            )}

            {/* Duration badge */}
            {duration > 0 && !isPlaying && (
                <div className="absolute bottom-2 right-2 z-10 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded tabular-nums">
                    {fmt(duration)}
                </div>
            )}

            {/* Current time while playing */}
            {isPlaying && (
                <div className="absolute bottom-2 right-2 z-10 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded tabular-nums">
                    {fmt(currentTime)} / {fmt(duration)}
                </div>
            )}

            {/* Progress bar */}
            {(isPlaying || currentTime > 0) && (
                <div className="absolute bottom-0 left-0 right-0 z-10 h-1 bg-white/20">
                    <div
                        className="h-full bg-tg-primary transition-[width] duration-100"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}

            {/* Loading state */}
            {!thumbnailReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                </div>
            )}
        </div>
    );
}
