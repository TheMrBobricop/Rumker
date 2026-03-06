import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WaveformPlayerProps {
    src: string;
    messageId: string;
    isMe: boolean;
}

const BAR_COUNT = 32;

/** Generate deterministic pseudo-waveform bars from message ID hash */
function generateBars(messageId: string): number[] {
    let hash = 0;
    for (let i = 0; i < messageId.length; i++) {
        hash = ((hash << 5) - hash + messageId.charCodeAt(i)) | 0;
    }

    const bars: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
        // Simple LCG-like deterministic values
        hash = ((hash * 1103515245 + 12345) & 0x7fffffff);
        const val = (hash % 100) / 100;
        // Bias toward medium heights for visual appeal
        bars.push(0.15 + val * 0.85);
    }
    return bars;
}

export function WaveformPlayer({ src, messageId, isMe }: WaveformPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const waveformRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [speed, setSpeed] = useState(1);
    const barsRef = useRef(generateBars(messageId));

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onMeta = () => setDuration(audio.duration || 0);
        const onTime = () => setCurrentTime(audio.currentTime);
        const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };
        audio.addEventListener('loadedmetadata', onMeta);
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('ended', onEnd);
        return () => {
            audio.removeEventListener('loadedmetadata', onMeta);
            audio.removeEventListener('timeupdate', onTime);
            audio.removeEventListener('ended', onEnd);
        };
    }, []);

    const toggle = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying]);

    const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        const waveform = waveformRef.current;
        if (!audio || !waveform || !duration) return;

        const rect = waveform.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        audio.currentTime = ratio * duration;
    }, [duration]);

    const cycleSpeed = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
        setSpeed(nextSpeed);
        audio.playbackRate = nextSpeed;
    }, [speed]);

    const progress = duration > 0 ? currentTime / duration : 0;

    const fmt = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-2.5 min-w-[200px] w-full">
            <audio ref={audioRef} src={src} preload="metadata" />
            <button
                onClick={toggle}
                className="h-10 w-10 shrink-0 rounded-full bg-tg-primary text-white flex items-center justify-center hover:opacity-90 transition-opacity active:scale-95"
            >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                {/* Waveform bars */}
                <div
                    ref={waveformRef}
                    className="flex items-end gap-[2px] h-6 cursor-pointer"
                    onClick={handleSeek}
                    onTouchStart={handleSeek}
                >
                    {barsRef.current.map((height, i) => {
                        const barProgress = i / BAR_COUNT;
                        const isActive = barProgress < progress;
                        return (
                            <div
                                key={i}
                                className={cn(
                                    "flex-1 rounded-full transition-colors duration-100 min-w-[2px]",
                                    isActive
                                        ? "bg-tg-primary"
                                        : isMe ? "bg-black/15 dark:bg-white/20" : "bg-black/15 dark:bg-white/20"
                                )}
                                style={{ height: `${height * 100}%` }}
                            />
                        );
                    })}
                </div>

                {/* Duration + speed */}
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-tg-text-secondary tabular-nums leading-none">
                        {fmt(currentTime)} / {fmt(duration)}
                    </span>
                    {isPlaying && (
                        <button
                            onClick={cycleSpeed}
                            className="text-[10px] text-tg-primary font-medium px-1.5 py-0.5 rounded bg-tg-primary/10 hover:bg-tg-primary/20 transition-colors"
                        >
                            {speed}x
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
