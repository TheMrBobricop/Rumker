import { useState, useEffect, useRef, useCallback } from 'react';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { cn } from '@/lib/utils';
import type { AudioDevice, VoiceInputMode } from '@/types';

export function VoiceSettings() {
    const voiceSettings = useVoiceChannelStore((s) => s.voiceSettings);
    const setVoiceSettings = useVoiceChannelStore((s) => s.setVoiceSettings);
    const audioDevices = useVoiceChannelStore((s) => s.audioDevices);
    const setAudioDevices = useVoiceChannelStore((s) => s.setAudioDevices);
    const setInputDevice = useVoiceChannelStore((s) => s.setInputDevice);
    const setOutputDevice = useVoiceChannelStore((s) => s.setOutputDevice);
    const [audioLevel, setAudioLevel] = useState(0);
    const streamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number>(0);
    const [capturingKey, setCapturingKey] = useState(false);

    // Load audio devices on mount
    useEffect(() => {
        async function loadDevices() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());

                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioDevs: AudioDevice[] = devices
                    .filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput')
                    .map(d => ({
                        deviceId: d.deviceId,
                        label: d.label || (d.kind === 'audioinput' ? 'Микрофон' : 'Динамик'),
                        kind: d.kind as 'audioinput' | 'audiooutput',
                    }));
                setAudioDevices(audioDevs);
            } catch (err) {
                console.error('Failed to load audio devices:', err);
            }
        }
        loadDevices();
    }, [setAudioDevices]);

    // Audio level visualization
    useEffect(() => {
        let active = true;

        async function startMeter() {
            try {
                const constraints: MediaStreamConstraints = {
                    audio: {
                        deviceId: voiceSettings.inputDeviceId ? { exact: voiceSettings.inputDeviceId } : undefined,
                        noiseSuppression: voiceSettings.noiseSuppression,
                        echoCancellation: voiceSettings.echoCancellation,
                        autoGainControl: voiceSettings.autoGainControl,
                    },
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;

                const ctx = new AudioContext();
                const source = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                analyserRef.current = analyser;

                const data = new Uint8Array(analyser.frequencyBinCount);
                function tick() {
                    if (!active) return;
                    analyser.getByteFrequencyData(data);
                    const avg = data.reduce((a, b) => a + b, 0) / data.length;
                    setAudioLevel(Math.min(100, (avg / 128) * 100 * (voiceSettings.inputVolume / 100)));
                    rafRef.current = requestAnimationFrame(tick);
                }
                tick();
            } catch {
                // No mic access
            }
        }

        startMeter();

        return () => {
            active = false;
            cancelAnimationFrame(rafRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [voiceSettings.inputDeviceId, voiceSettings.noiseSuppression, voiceSettings.echoCancellation, voiceSettings.autoGainControl]);

    // PTT key capture
    const handleCaptureKey = useCallback(() => {
        setCapturingKey(true);
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            setVoiceSettings({ pttKey: e.code });
            setCapturingKey(false);
            window.removeEventListener('keydown', handler);
        };
        window.addEventListener('keydown', handler);
    }, [setVoiceSettings]);

    const inputDevices = audioDevices.filter(d => d.kind === 'audioinput');
    const outputDevices = audioDevices.filter(d => d.kind === 'audiooutput');

    // Human-readable key name
    const keyName = (code: string) => {
        const map: Record<string, string> = {
            'Space': 'Пробел', 'ControlLeft': 'L Ctrl', 'ControlRight': 'R Ctrl',
            'ShiftLeft': 'L Shift', 'ShiftRight': 'R Shift', 'AltLeft': 'L Alt', 'AltRight': 'R Alt',
            'CapsLock': 'Caps Lock', 'Tab': 'Tab', 'Backquote': '`',
        };
        return map[code] || code.replace('Key', '').replace('Digit', '');
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Настройки звука</h2>
                <p className="text-sm text-muted-foreground">Устройства ввода/вывода и параметры голоса</p>
            </div>

            {/* Input Device */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Устройство ввода</label>
                <select
                    value={voiceSettings.inputDeviceId || ''}
                    onChange={(e) => setInputDevice(e.target.value)}
                    className="w-full bg-muted text-foreground text-sm rounded-lg p-2.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                    <option value="">По умолчанию</option>
                    {inputDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                </select>
            </div>

            {/* Input Volume */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Громкость ввода</label>
                    <span className="text-sm text-muted-foreground">{voiceSettings.inputVolume}%</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={200}
                    value={voiceSettings.inputVolume}
                    onChange={(e) => setVoiceSettings({ inputVolume: Number(e.target.value) })}
                    className="w-full accent-primary"
                />
            </div>

            {/* Audio Level Meter with Noise Gate threshold line */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Уровень звука</label>
                <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-75"
                        style={{
                            width: `${audioLevel}%`,
                            backgroundColor: audioLevel > 80 ? '#ef4444' : audioLevel > 50 ? '#f59e0b' : '#22c55e',
                        }}
                    />
                    {voiceSettings.noiseGateEnabled && (
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
                            style={{ left: `${(voiceSettings.noiseGateThreshold / 128) * 100}%` }}
                            title={`Порог: ${voiceSettings.noiseGateThreshold}`}
                        />
                    )}
                </div>
            </div>

            <div className="h-px bg-border" />

            {/* Output Device */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Устройство вывода</label>
                <select
                    value={voiceSettings.outputDeviceId || ''}
                    onChange={(e) => setOutputDevice(e.target.value)}
                    className="w-full bg-muted text-foreground text-sm rounded-lg p-2.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                    <option value="">По умолчанию</option>
                    {outputDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                </select>
            </div>

            {/* Output Volume */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Громкость вывода</label>
                    <span className="text-sm text-muted-foreground">{voiceSettings.outputVolume}%</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={200}
                    value={voiceSettings.outputVolume}
                    onChange={(e) => setVoiceSettings({ outputVolume: Number(e.target.value) })}
                    className="w-full accent-primary"
                />
            </div>

            <div className="h-px bg-border" />

            {/* ═══ Input Mode (Voice Activity / Push to Talk) ═══ */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">Режим ввода</h3>
                <div className="grid grid-cols-2 gap-2">
                    {(['voiceActivity', 'pushToTalk'] as VoiceInputMode[]).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setVoiceSettings({ inputMode: mode })}
                            className={cn(
                                "rounded-lg border-2 p-3 text-sm font-medium text-center transition-all",
                                voiceSettings.inputMode === mode
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:border-muted-foreground/50"
                            )}
                        >
                            {mode === 'voiceActivity' ? 'Голосовая активность' : 'Нажми чтобы говорить'}
                        </button>
                    ))}
                </div>

                {/* PTT Settings (only when PTT mode) */}
                {voiceSettings.inputMode === 'pushToTalk' && (
                    <div className="space-y-3 pl-1">
                        <div className="space-y-2">
                            <label className="text-sm text-foreground">Клавиша</label>
                            <button
                                onClick={handleCaptureKey}
                                className={cn(
                                    "w-full py-2.5 px-4 rounded-lg text-sm font-medium border transition-all text-left",
                                    capturingKey
                                        ? "border-primary bg-primary/10 text-primary animate-pulse"
                                        : "border-border bg-muted text-foreground hover:border-primary/50"
                                )}
                            >
                                {capturingKey ? 'Нажмите клавишу...' : keyName(voiceSettings.pttKey)}
                            </button>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-foreground">Задержка отпускания</label>
                                <span className="text-sm text-muted-foreground">{voiceSettings.pttReleaseDelay} мс</span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={2000}
                                step={50}
                                value={voiceSettings.pttReleaseDelay}
                                onChange={(e) => setVoiceSettings({ pttReleaseDelay: Number(e.target.value) })}
                                className="w-full accent-primary"
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="h-px bg-border" />

            {/* ═══ Audio Processing Toggles ═══ */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">Обработка звука</h3>
                <VoiceToggle
                    label="Шумоподавление"
                    description="Подавление фонового шума (Krisp)"
                    checked={voiceSettings.noiseSuppression}
                    onChange={(v) => setVoiceSettings({ noiseSuppression: v })}
                />
                <VoiceToggle
                    label="Эхоподавление"
                    description="Удаление эха от динамиков"
                    checked={voiceSettings.echoCancellation}
                    onChange={(v) => setVoiceSettings({ echoCancellation: v })}
                />
                <VoiceToggle
                    label="Автоусиление"
                    description="Автоматическая регулировка громкости"
                    checked={voiceSettings.autoGainControl}
                    onChange={(v) => setVoiceSettings({ autoGainControl: v })}
                />
            </div>

            <div className="h-px bg-border" />

            {/* ═══ Noise Gate ═══ */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">Шумовой порог</h3>
                <VoiceToggle
                    label="Включить шумовой порог"
                    description="Автоматическое отключение микрофона при тихом звуке"
                    checked={voiceSettings.noiseGateEnabled}
                    onChange={(v) => setVoiceSettings({ noiseGateEnabled: v })}
                />
                {voiceSettings.noiseGateEnabled && (
                    <div className="space-y-2 pl-1">
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-foreground">Чувствительность</label>
                            <span className="text-sm text-muted-foreground">{voiceSettings.noiseGateThreshold}</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={voiceSettings.noiseGateThreshold}
                            onChange={(e) => setVoiceSettings({ noiseGateThreshold: Number(e.target.value) })}
                            className="w-full accent-primary"
                        />
                        <p className="text-xs text-muted-foreground">
                            Звуки ниже порога будут автоматически отсекаться. Настройте так, чтобы красная линия была чуть выше уровня фонового шума.
                        </p>
                    </div>
                )}
            </div>

            <div className="h-px bg-border" />

            {/* ═══ Attenuation ═══ */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">Приглушение</h3>
                <VoiceToggle
                    label="Приглушать других"
                    description="Уменьшать громкость других когда кто-то говорит"
                    checked={voiceSettings.attenuationEnabled}
                    onChange={(v) => setVoiceSettings({ attenuationEnabled: v })}
                />
                {voiceSettings.attenuationEnabled && (
                    <div className="space-y-2 pl-1">
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-foreground">Степень приглушения</label>
                            <span className="text-sm text-muted-foreground">{voiceSettings.attenuationAmount}%</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={voiceSettings.attenuationAmount}
                            onChange={(e) => setVoiceSettings({ attenuationAmount: Number(e.target.value) })}
                            className="w-full accent-primary"
                        />
                    </div>
                )}
            </div>

            <div className="h-px bg-border" />

            {/* ═══ Screen Share Quality ═══ */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">Качество демонстрации экрана</h3>
                <div className="space-y-2">
                    <label className="text-sm text-foreground">Разрешение</label>
                    <select
                        value={voiceSettings.screenShareQuality}
                        onChange={(e) => setVoiceSettings({ screenShareQuality: e.target.value as any })}
                        className="w-full bg-muted text-foreground text-sm rounded-lg p-2.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                        <option value="auto">Авто</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="source">Оригинал</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-sm text-foreground">Частота кадров</label>
                    <select
                        value={voiceSettings.screenShareFps}
                        onChange={(e) => setVoiceSettings({ screenShareFps: Number(e.target.value) as any })}
                        className="w-full bg-muted text-foreground text-sm rounded-lg p-2.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                        <option value={15}>15 FPS</option>
                        <option value={30}>30 FPS</option>
                        <option value={60}>60 FPS</option>
                    </select>
                </div>
            </div>
        </div>
    );
}

function VoiceToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <span className="text-sm text-foreground">{label}</span>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-3",
                    checked ? "bg-primary" : "bg-muted-foreground/30"
                )}
            >
                <span
                    className={cn(
                        "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                        checked ? "translate-x-[22px]" : "translate-x-[3px]"
                    )}
                />
            </button>
        </div>
    );
}
