import { useState, useRef, useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { soundEngine, SOUND_LABELS, type SoundType } from '@/lib/sounds/soundEngine';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Volume2,
    Play,
    Upload,
    Trash2,
    ChevronDown,
    ChevronRight,
    RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { defaultSoundSettings } from '@/lib/sounds/soundEngine';

const SOUND_TYPES: SoundType[] = [
    'messageSend',
    'messageReceive',
    'notification',
    'voiceJoin',
    'voiceLeave',
    'callRing',
    'callConnect',
    'callEnd',
];

function SoundCard({ type }: { type: SoundType }) {
    const soundSettings = useSettingsStore((s) => s.soundSettings);
    const updateSoundConfig = useSettingsStore((s) => s.updateSoundConfig);
    const [expanded, setExpanded] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const config = soundSettings.sounds[type];

    const handleToggle = useCallback((enabled: boolean) => {
        updateSoundConfig(type, { enabled });
    }, [type, updateSoundConfig]);

    const handleVolume = useCallback((value: number[]) => {
        updateSoundConfig(type, { volume: value[0] });
    }, [type, updateSoundConfig]);

    const handlePitch = useCallback((value: number[]) => {
        updateSoundConfig(type, { pitch: value[0] });
    }, [type, updateSoundConfig]);

    const handleBass = useCallback((value: number[]) => {
        updateSoundConfig(type, { bass: value[0] });
    }, [type, updateSoundConfig]);

    const handleMid = useCallback((value: number[]) => {
        updateSoundConfig(type, { mid: value[0] });
    }, [type, updateSoundConfig]);

    const handleTreble = useCallback((value: number[]) => {
        updateSoundConfig(type, { treble: value[0] });
    }, [type, updateSoundConfig]);

    const handleDistortion = useCallback((value: number[]) => {
        updateSoundConfig(type, { distortion: value[0] });
    }, [type, updateSoundConfig]);

    const handlePreview = useCallback(() => {
        soundEngine.preview(type);
    }, [type]);

    const handleCustomUpload = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result as string;
            await soundEngine.loadCustomSound(type, dataUrl);
            updateSoundConfig(type, { customSoundData: dataUrl });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }, [type, updateSoundConfig]);

    const handleRemoveCustom = useCallback(() => {
        soundEngine.removeCustomSound(type);
        updateSoundConfig(type, { customSoundData: undefined });
    }, [type, updateSoundConfig]);

    const handleReset = useCallback(() => {
        const def = defaultSoundSettings.sounds[type];
        soundEngine.removeCustomSound(type);
        updateSoundConfig(type, { ...def, customSoundData: undefined });
    }, [type, updateSoundConfig]);

    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <Switch
                    checked={config.enabled}
                    onCheckedChange={handleToggle}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", !config.enabled && "text-muted-foreground")}>
                        {SOUND_LABELS[type]}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => {
                        e.stopPropagation();
                        handlePreview();
                    }}
                    title="Прослушать"
                >
                    <Play className="h-3.5 w-3.5" />
                </Button>
                {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
            </div>

            {expanded && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/50">
                    {/* Volume */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Громкость</Label>
                            <span className="text-xs text-muted-foreground tabular-nums">{config.volume}%</span>
                        </div>
                        <Slider
                            value={[config.volume]}
                            onValueChange={handleVolume}
                            min={0}
                            max={100}
                            step={1}
                        />
                    </div>

                    {/* Pitch */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Тон (Pitch)</Label>
                            <span className="text-xs text-muted-foreground tabular-nums">{config.pitch.toFixed(2)}x</span>
                        </div>
                        <Slider
                            value={[config.pitch]}
                            onValueChange={handlePitch}
                            min={0.5}
                            max={2.0}
                            step={0.05}
                        />
                    </div>

                    {/* EQ Section */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Эквалайзер</Label>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">Бас</span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">{config.bass > 0 ? '+' : ''}{config.bass}dB</span>
                                </div>
                                <Slider
                                    value={[config.bass]}
                                    onValueChange={handleBass}
                                    min={-12}
                                    max={12}
                                    step={1}
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">Средние</span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">{config.mid > 0 ? '+' : ''}{config.mid}dB</span>
                                </div>
                                <Slider
                                    value={[config.mid]}
                                    onValueChange={handleMid}
                                    min={-12}
                                    max={12}
                                    step={1}
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">Высокие</span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">{config.treble > 0 ? '+' : ''}{config.treble}dB</span>
                                </div>
                                <Slider
                                    value={[config.treble]}
                                    onValueChange={handleTreble}
                                    min={-12}
                                    max={12}
                                    step={1}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Distortion */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Искажение</Label>
                            <span className="text-xs text-muted-foreground tabular-nums">{config.distortion}%</span>
                        </div>
                        <Slider
                            value={[config.distortion]}
                            onValueChange={handleDistortion}
                            min={0}
                            max={100}
                            step={1}
                        />
                    </div>

                    {/* Custom sound */}
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={handleCustomUpload}
                        >
                            <Upload className="h-3 w-3" />
                            {config.customSoundData ? 'Заменить звук' : 'Свой звук'}
                        </Button>
                        {config.customSoundData && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                                onClick={handleRemoveCustom}
                            >
                                <Trash2 className="h-3 w-3" />
                                Удалить
                            </Button>
                        )}
                        <div className="flex-1" />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={handleReset}
                            title="Сбросить настройки звука"
                        >
                            <RotateCcw className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function SoundSettings() {
    const soundSettings = useSettingsStore((s) => s.soundSettings);
    const setMasterVolume = useSettingsStore((s) => s.setMasterVolume);

    const handleMasterVolume = useCallback((value: number[]) => {
        setMasterVolume(value[0]);
    }, [setMasterVolume]);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold mb-1">Звуки</h2>
                <p className="text-sm text-muted-foreground">
                    Настройте звуки уведомлений, звонков и голосовых каналов
                </p>
            </div>

            {/* Master Volume */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-tg-primary" />
                    <Label className="text-sm font-medium">Общая громкость</Label>
                    <span className="ml-auto text-sm text-muted-foreground tabular-nums">{soundSettings.masterVolume}%</span>
                </div>
                <Slider
                    value={[soundSettings.masterVolume]}
                    onValueChange={handleMasterVolume}
                    min={0}
                    max={100}
                    step={1}
                />
            </div>

            {/* Per-sound settings */}
            <div className="space-y-2">
                <Label className="text-sm font-medium">Настройки звуков</Label>
                <div className="space-y-1.5">
                    {SOUND_TYPES.map((type) => (
                        <SoundCard key={type} type={type} />
                    ))}
                </div>
            </div>
        </div>
    );
}
