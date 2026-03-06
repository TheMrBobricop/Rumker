import { useState, useEffect, useRef, useCallback } from 'react';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { useAuthStore } from '@/stores/authStore';
import { socketService } from '@/lib/socket';
import { api } from '@/lib/api/client';
import { X, Search, Upload, Star, Volume2, Trash2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { SoundboardSound } from '@/types';

// Discord palette
const DC = {
    bg: '#2b2d31', bgDark: '#1e1f22', bgHov: '#383a40',
    green: '#23a559', red: '#ed4245', blurple: '#5865f2', yellow: '#faa61a',
    textNorm: '#dbdee1', textMuted: '#949ba4', textFaint: '#6d6f78',
} as const;

// Built-in default sounds
const DEFAULT_SOUNDS: Omit<SoundboardSound, 'chatId' | 'uploadedBy' | 'createdAt'>[] = [
    { id: 'default-airhorn', name: 'Airhorn', category: 'Классика', fileUrl: '', durationMs: 1500, isDefault: true },
    { id: 'default-tada', name: 'Tada', category: 'Классика', fileUrl: '', durationMs: 1200, isDefault: true },
    { id: 'default-crickets', name: 'Crickets', category: 'Классика', fileUrl: '', durationMs: 2000, isDefault: true },
    { id: 'default-rimshot', name: 'Rimshot', category: 'Классика', fileUrl: '', durationMs: 800, isDefault: true },
    { id: 'default-quack', name: 'Quack', category: 'Животные', fileUrl: '', durationMs: 500, isDefault: true },
    { id: 'default-meow', name: 'Meow', category: 'Животные', fileUrl: '', durationMs: 700, isDefault: true },
    { id: 'default-woof', name: 'Woof', category: 'Животные', fileUrl: '', durationMs: 600, isDefault: true },
    { id: 'default-sad-trombone', name: 'Sad Trombone', category: 'Музыка', fileUrl: '', durationMs: 2500, isDefault: true },
    { id: 'default-alert', name: 'Alert', category: 'Эффекты', fileUrl: '', durationMs: 400, isDefault: true },
    { id: 'default-bruh', name: 'Bruh', category: 'Мемы', fileUrl: '', durationMs: 600, isDefault: true },
    { id: 'default-oof', name: 'Oof', category: 'Мемы', fileUrl: '', durationMs: 500, isDefault: true },
    { id: 'default-wow', name: 'Wow', category: 'Мемы', fileUrl: '', durationMs: 800, isDefault: true },
];

// Synthesize default sounds using Web Audio
function playDefaultSound(name: string): void {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    switch (name) {
        case 'Airhorn': {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(500, now);
            o.frequency.exponentialRampToValueAtTime(800, now + 0.1);
            g.gain.setValueAtTime(0.5, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            o.connect(g).connect(ctx.destination);
            o.start(now); o.stop(now + 1.2);
            break;
        }
        case 'Tada': {
            [523, 659, 784, 1047].forEach((f, i) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine';
                o.frequency.value = f;
                g.gain.setValueAtTime(0.3, now + i * 0.15);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
                o.connect(g).connect(ctx.destination);
                o.start(now + i * 0.15); o.stop(now + i * 0.15 + 0.4);
            });
            break;
        }
        case 'Rimshot': {
            const noise = ctx.createBufferSource();
            const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
            noise.buffer = buf;
            const g = ctx.createGain();
            g.gain.value = 0.5;
            noise.connect(g).connect(ctx.destination);
            noise.start(now);
            // Add the "shot" hit
            const o = ctx.createOscillator();
            const og = ctx.createGain();
            o.frequency.value = 200;
            og.gain.setValueAtTime(0.4, now);
            og.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            o.connect(og).connect(ctx.destination);
            o.start(now); o.stop(now + 0.15);
            break;
        }
        case 'Quack': {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(800, now);
            o.frequency.exponentialRampToValueAtTime(400, now + 0.08);
            o.frequency.setValueAtTime(700, now + 0.1);
            o.frequency.exponentialRampToValueAtTime(350, now + 0.2);
            g.gain.setValueAtTime(0.3, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            o.connect(g).connect(ctx.destination);
            o.start(now); o.stop(now + 0.25);
            break;
        }
        case 'Sad Trombone': {
            [311, 293, 277, 261].forEach((f, i) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sawtooth';
                o.frequency.value = f;
                g.gain.setValueAtTime(0.2, now + i * 0.5);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.5 + 0.45);
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 1500;
                o.connect(filter).connect(g).connect(ctx.destination);
                o.start(now + i * 0.5); o.stop(now + i * 0.5 + 0.45);
            });
            break;
        }
        default: {
            // Generic beep for other sounds
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = 440 + Math.random() * 400;
            g.gain.setValueAtTime(0.3, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            o.connect(g).connect(ctx.destination);
            o.start(now); o.stop(now + 0.3);
        }
    }
}

interface SoundboardPanelProps {
    onClose: () => void;
}

export function SoundboardPanel({ onClose }: SoundboardPanelProps) {
    const currentChannel = useVoiceChannelStore((s) => s.currentChannel);
    const currentUser = useAuthStore((s) => s.user);
    const [sounds, setSounds] = useState<SoundboardSound[]>([]);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'custom'>('all');
    const [cooldown, setCooldown] = useState(false);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Local favorites (localStorage)
    const [favorites, setFavorites] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('rumker-soundboard-favorites');
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });

    // Local keybinds (localStorage)
    const [keybinds] = useState<Record<string, string>>(() => {
        try {
            const saved = localStorage.getItem('rumker-soundboard-keybinds');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });

    // Load sounds
    useEffect(() => {
        loadSounds();
    }, [currentChannel?.id]);

    const loadSounds = async () => {
        const defaults = DEFAULT_SOUNDS.map(s => ({
            ...s,
            chatId: currentChannel?.id || '',
            uploadedBy: '',
            createdAt: new Date(),
            isFavorite: favorites.has(s.id),
        })) as SoundboardSound[];

        // Try to load custom sounds from server
        if (currentChannel) {
            try {
                const custom = await api.get<any[]>(`/soundboard?chatId=${currentChannel.id}`);
                const customSounds = (custom || []).map((s: any) => ({
                    ...s,
                    createdAt: new Date(s.createdAt),
                    isFavorite: favorites.has(s.id),
                }));
                setSounds([...defaults, ...customSounds]);
            } catch {
                setSounds(defaults);
            }
        } else {
            setSounds(defaults);
        }
    };

    const toggleFavorite = (soundId: string) => {
        setFavorites(prev => {
            const next = new Set(prev);
            if (next.has(soundId)) next.delete(soundId);
            else next.add(soundId);
            localStorage.setItem('rumker-soundboard-favorites', JSON.stringify([...next]));
            return next;
        });
    };

    const playSound = useCallback((sound: SoundboardSound) => {
        if (cooldown || !currentChannel) return;

        // Rate limit: 3 second cooldown
        setCooldown(true);
        setPlayingId(sound.id);
        setTimeout(() => { setCooldown(false); setPlayingId(null); }, 3000);

        if (sound.isDefault) {
            // Play locally with Web Audio
            playDefaultSound(sound.name);
            // Broadcast to others
            socketService.emit('soundboard:play', {
                channelId: currentChannel.id,
                soundId: sound.id,
                soundName: sound.name,
                isDefault: true,
            });
        } else if (sound.fileUrl) {
            // Play custom sound
            const audio = new Audio(sound.fileUrl);
            audio.volume = 0.7;
            audio.play().catch(() => {});
            // Broadcast
            socketService.emit('soundboard:play', {
                channelId: currentChannel.id,
                soundId: sound.id,
                soundName: sound.name,
                soundUrl: sound.fileUrl,
                isDefault: false,
            });
        }
    }, [cooldown, currentChannel]);

    // Listen for soundboard:played from other users
    useEffect(() => {
        const handler = (data: { channelId: string; userId: string; soundName: string; soundUrl?: string; isDefault: boolean }) => {
            if (data.userId === currentUser?.id) return;
            if (data.channelId !== currentChannel?.id) return;

            if (data.isDefault) {
                playDefaultSound(data.soundName);
            } else if (data.soundUrl) {
                const audio = new Audio(data.soundUrl);
                audio.volume = 0.7;
                audio.play().catch(() => {});
            }
        };

        socketService.on('soundboard:played', handler);
        return () => {
            // Can't easily unsubscribe with socketService.on, but component unmount should handle it
        };
    }, [currentChannel?.id, currentUser?.id]);

    // Keybind handler
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            for (const [soundId, key] of Object.entries(keybinds)) {
                if (e.code === key) {
                    const sound = sounds.find(s => s.id === soundId);
                    if (sound) {
                        e.preventDefault();
                        playSound(sound);
                    }
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [keybinds, sounds, playSound]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentChannel) return;

        // Validate
        const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];
        if (!validTypes.includes(file.type)) {
            toast.error('Поддерживаются только MP3, WAV, OGG');
            return;
        }
        if (file.size > 512 * 1024) { // 512KB
            toast.error('Максимальный размер файла 512KB');
            return;
        }

        // Validate duration
        try {
            const ctx = new AudioContext();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            if (audioBuffer.duration > 5) {
                toast.error('Максимальная длительность 5 секунд');
                return;
            }

            // Upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('chatId', currentChannel.id);
            formData.append('name', file.name.replace(/\.[^/.]+$/, ''));
            formData.append('durationMs', String(Math.round(audioBuffer.duration * 1000)));

            const result = await api.post<any>('/soundboard', formData);
            if (result) {
                setSounds(prev => [...prev, {
                    ...result,
                    createdAt: new Date(result.createdAt),
                    isFavorite: false,
                }]);
                toast.success('Звук загружен');
            }
        } catch (err) {
            toast.error('Ошибка при загрузке звука');
        }

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDelete = async (soundId: string) => {
        try {
            await api.delete(`/soundboard/${soundId}`);
            setSounds(prev => prev.filter(s => s.id !== soundId));
            toast.success('Звук удалён');
        } catch {
            toast.error('Ошибка при удалении');
        }
    };

    // Filter sounds
    const filtered = sounds.filter(s => {
        if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (activeTab === 'favorites' && !favorites.has(s.id)) return false;
        if (activeTab === 'custom' && s.isDefault) return false;
        return true;
    });

    // Group by category
    const categories = new Map<string, SoundboardSound[]>();
    for (const sound of filtered) {
        const cat = sound.category || 'Другое';
        if (!categories.has(cat)) categories.set(cat, []);
        categories.get(cat)!.push(sound);
    }

    return (
        <div className="flex flex-col rounded-xl shadow-2xl overflow-hidden" style={{ background: DC.bg, width: 340, maxHeight: 480 }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 shrink-0" style={{ borderBottom: `1px solid ${DC.bgDark}` }}>
                <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4" style={{ color: DC.yellow }} />
                    <span className="text-sm font-semibold" style={{ color: DC.textNorm }}>Soundboard</span>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
                    <X className="h-4 w-4" style={{ color: DC.textMuted }} />
                </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 shrink-0">
                <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5" style={{ background: DC.bgDark }}>
                    <Search className="h-3.5 w-3.5 shrink-0" style={{ color: DC.textFaint }} />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Поиск звуков..."
                        className="flex-1 bg-transparent text-xs outline-none placeholder:opacity-40"
                        style={{ color: DC.textNorm }}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-3 pb-2 shrink-0">
                {(['all', 'favorites', 'custom'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                            activeTab === tab ? 'text-white' : ''
                        )}
                        style={{
                            background: activeTab === tab ? DC.blurple : 'transparent',
                            color: activeTab === tab ? '#fff' : DC.textMuted,
                        }}
                    >
                        {tab === 'all' ? 'Все' : tab === 'favorites' ? '★ Избранное' : 'Свои'}
                    </button>
                ))}
            </div>

            {/* Sound Grid */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: DC.textFaint }}>
                        <Volume2 className="h-8 w-8 opacity-20" />
                        <span className="text-xs">Звуки не найдены</span>
                    </div>
                ) : (
                    [...categories.entries()].map(([cat, catSounds]) => (
                        <div key={cat} className="mb-3">
                            <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5 px-0.5" style={{ color: DC.textFaint }}>
                                {cat}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {catSounds.map(sound => (
                                    <SoundButton
                                        key={sound.id}
                                        sound={sound}
                                        isFavorite={favorites.has(sound.id)}
                                        isPlaying={playingId === sound.id}
                                        isCooldown={cooldown}
                                        isOwner={sound.uploadedBy === currentUser?.id}
                                        onPlay={() => playSound(sound)}
                                        onFavorite={() => toggleFavorite(sound.id)}
                                        onDelete={() => handleDelete(sound.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Upload button */}
            <div className="px-3 pb-3 shrink-0">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors hover:brightness-110"
                    style={{ background: DC.blurple, color: '#fff' }}
                >
                    <Upload className="h-3.5 w-3.5" />
                    Загрузить звук
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/ogg,audio/webm"
                    onChange={handleUpload}
                    className="hidden"
                />
            </div>
        </div>
    );
}

function SoundButton({
    sound, isFavorite, isPlaying, isCooldown, isOwner,
    onPlay, onFavorite, onDelete,
}: {
    sound: SoundboardSound;
    isFavorite: boolean;
    isPlaying: boolean;
    isCooldown: boolean;
    isOwner: boolean;
    onPlay: () => void;
    onFavorite: () => void;
    onDelete: () => void;
}) {
    const [hov, setHov] = useState(false);

    return (
        <div
            className="relative group"
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
        >
            <button
                onClick={onPlay}
                disabled={isCooldown && !isPlaying}
                className={cn(
                    "w-full rounded-lg px-2 py-2.5 text-center transition-all",
                    isPlaying && "ring-2 ring-[#23a559]",
                    isCooldown && !isPlaying && "opacity-40 cursor-not-allowed",
                )}
                style={{
                    background: isPlaying ? 'rgba(35,165,89,.15)' : hov ? DC.bgHov : DC.bgDark,
                    color: isPlaying ? DC.green : DC.textNorm,
                }}
            >
                <div className="flex items-center justify-center mb-1">
                    {isPlaying ? (
                        <div className="flex items-end gap-0.5 h-4">
                            {[0, 1, 2].map(i => (
                                <div
                                    key={i}
                                    className="w-1 rounded-full animate-pulse"
                                    style={{
                                        background: DC.green,
                                        height: `${8 + Math.random() * 8}px`,
                                        animationDelay: `${i * 100}ms`,
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <Play className="h-3.5 w-3.5" style={{ color: DC.textMuted }} />
                    )}
                </div>
                <span className="text-[10px] leading-tight line-clamp-2 font-medium">{sound.name}</span>
            </button>

            {/* Hover actions */}
            {hov && (
                <div className="absolute -top-1 -right-1 flex gap-0.5 z-10">
                    <button
                        onClick={(e) => { e.stopPropagation(); onFavorite(); }}
                        className="p-0.5 rounded"
                        style={{ background: DC.bgDark }}
                    >
                        <Star className="h-3 w-3" style={{ color: isFavorite ? DC.yellow : DC.textFaint, fill: isFavorite ? DC.yellow : 'none' }} />
                    </button>
                    {isOwner && !sound.isDefault && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="p-0.5 rounded"
                            style={{ background: DC.bgDark }}
                        >
                            <Trash2 className="h-3 w-3" style={{ color: DC.red }} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
