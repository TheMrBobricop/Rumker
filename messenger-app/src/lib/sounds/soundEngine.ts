/**
 * Rumker Sound Engine пїЅ Web Audio API based
 * Supports per-sound volume, 3-band EQ, pitch shift, distortion, custom sounds
 */

export type SoundType =
    | 'messageSend'
    | 'messageReceive'
    | 'notification'
    | 'voiceJoin'
    | 'voiceLeave'
    | 'callRing'
    | 'callConnect'
    | 'callEnd';

export interface SoundConfig {
    enabled: boolean;
    volume: number;         // 0пїЅ100
    pitch: number;          // 0.5пїЅ2.0 (1.0 = normal)
    bass: number;           // -12 to +12 dB
    mid: number;            // -12 to +12 dB
    treble: number;         // -12 to +12 dB
    distortion: number;     // 0пїЅ100
    customSoundData?: string; // base64 data URL or blob URL
}

export interface SoundSettings {
    masterVolume: number; // 0пїЅ100
    sounds: Record<SoundType, SoundConfig>;
}

const defaultSoundConfig: SoundConfig = {
    enabled: true,
    volume: 70,
    pitch: 1.0,
    bass: 0,
    mid: 0,
    treble: 0,
    distortion: 0,
};

export const defaultSoundSettings: SoundSettings = {
    masterVolume: 80,
    sounds: {
        messageSend:    { ...defaultSoundConfig, volume: 40 },
        messageReceive: { ...defaultSoundConfig, volume: 60 },
        notification:   { ...defaultSoundConfig, volume: 70 },
        voiceJoin:      { ...defaultSoundConfig, volume: 75 },
        voiceLeave:     { ...defaultSoundConfig, volume: 65 },
        callRing:       { ...defaultSoundConfig, volume: 90 },
        callConnect:    { ...defaultSoundConfig, volume: 60 },
        callEnd:        { ...defaultSoundConfig, volume: 50 },
    },
};

export const SOUND_LABELS: Record<SoundType, string> = {
    messageSend: 'Отправка сообщения',
    messageReceive: 'Получение сообщения',
    notification: 'Уведомление',
    voiceJoin: 'Вход в голосовой канал',
    voiceLeave: 'Выход из голосового канала',
    callRing: 'Входящий вызов',
    callConnect: 'Подключение вызова',
    callEnd: 'Завершение вызова',
};

// Distortion curve generator
function makeDistortionCurve(amount: number): Float32Array {
    const k = amount;
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

class SoundEngine {
    private ctx: AudioContext | null = null;
    private customBuffers = new Map<SoundType, AudioBuffer>();
    private settings: SoundSettings = defaultSoundSettings;

    private getCtx(): AudioContext {
        if (!this.ctx) this.ctx = new AudioContext();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    updateSettings(settings: SoundSettings): void {
        this.settings = settings;
    }

    /** Load a custom sound from base64 data URL */
    async loadCustomSound(type: SoundType, dataUrl: string): Promise<void> {
        try {
            const ctx = this.getCtx();
            const response = await fetch(dataUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            this.customBuffers.set(type, audioBuffer);
        } catch (err) {
            console.error(`[SoundEngine] Failed to load custom sound for ${type}:`, err);
        }
    }

    removeCustomSound(type: SoundType): void {
        this.customBuffers.delete(type);
    }

    /** Build the effects chain: source в†’ EQ в†’ distortion в†’ gain в†’ destination */
    private buildChain(ctx: AudioContext, config: SoundConfig): {
        input: AudioNode;
        output: AudioNode;
    } {
        const masterGain = (this.settings.masterVolume / 100);
        const soundGain = (config.volume / 100);

        // Gain node
        const gain = ctx.createGain();
        gain.gain.value = masterGain * soundGain;

        // 3-band EQ
        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 200;
        bassFilter.gain.value = config.bass;

        const midFilter = ctx.createBiquadFilter();
        midFilter.type = 'peaking';
        midFilter.frequency.value = 1000;
        midFilter.Q.value = 1;
        midFilter.gain.value = config.mid;

        const trebleFilter = ctx.createBiquadFilter();
        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 3000;
        trebleFilter.gain.value = config.treble;

        // Chain: input в†’ bass в†’ mid в†’ treble в†’ [distortion] в†’ gain в†’ destination
        bassFilter.connect(midFilter);
        midFilter.connect(trebleFilter);

        if (config.distortion > 0) {
            const waveshaper = ctx.createWaveShaper();
            waveshaper.curve = makeDistortionCurve(config.distortion) as Float32Array<ArrayBuffer>;
            waveshaper.oversample = '4x';
            trebleFilter.connect(waveshaper);
            waveshaper.connect(gain);
        } else {
            trebleFilter.connect(gain);
        }

        gain.connect(ctx.destination);

        return { input: bassFilter, output: gain };
    }

    /** Play a generated sound through the effects chain */
    private playGenerated(type: SoundType): void {
        const config = this.settings.sounds[type];
        if (!config?.enabled) return;

        const ctx = this.getCtx();
        const chain = this.buildChain(ctx, config);
        const now = ctx.currentTime;
        const rate = config.pitch;

        switch (type) {
            case 'messageSend':
                this.genMessageSend(ctx, chain.input, now, rate);
                break;
            case 'messageReceive':
            case 'notification':
                this.genNotification(ctx, chain.input, now, rate);
                break;
            case 'voiceJoin':
                this.genVoiceJoin(ctx, chain.input, now, rate);
                break;
            case 'voiceLeave':
                this.genVoiceLeave(ctx, chain.input, now, rate);
                break;
            case 'callRing':
                this.genCallRing(ctx, chain.input, now, rate);
                break;
            case 'callConnect':
                this.genCallConnect(ctx, chain.input, now, rate);
                break;
            case 'callEnd':
                this.genCallEnd(ctx, chain.input, now, rate);
                break;
        }
    }

    /** Play a custom AudioBuffer through the effects chain */
    private playBuffer(type: SoundType): void {
        const config = this.settings.sounds[type];
        if (!config?.enabled) return;

        const buffer = this.customBuffers.get(type);
        if (!buffer) return;

        const ctx = this.getCtx();
        const chain = this.buildChain(ctx, config);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = config.pitch;
        source.connect(chain.input);
        source.start();
    }

    /** Main play method */
    play(type: SoundType): void {
        const config = this.settings.sounds[type];
        if (!config?.enabled) return;

        try {
            if (this.customBuffers.has(type)) {
                this.playBuffer(type);
            } else {
                this.playGenerated(type);
            }
        } catch (err) {
            console.error(`[SoundEngine] Error playing ${type}:`, err);
        }
    }

    /** Preview a specific sound (always plays even if disabled) */
    preview(type: SoundType): void {
        try {
            const config = this.settings.sounds[type];
            if (!config) return;

            // Temporarily enable for preview
            const prev = config.enabled;
            config.enabled = true;

            if (this.customBuffers.has(type)) {
                this.playBuffer(type);
            } else {
                this.playGenerated(type);
            }

            config.enabled = prev;
        } catch (err) {
            console.error(`[SoundEngine] Error previewing ${type}:`, err);
        }
    }

    // в”Ђв”Ђ Generated sounds в”Ђв”Ђ

    private osc(ctx: AudioContext, dest: AudioNode, freq: number, start: number, dur: number, type: OscillatorType = 'sine', rate = 1): void {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq * rate;
        g.gain.setValueAtTime(0.6, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + dur);
        o.connect(g);
        g.connect(dest);
        o.start(start);
        o.stop(start + dur);
    }

    private genMessageSend(ctx: AudioContext, dest: AudioNode, now: number, rate: number): void {
        // Quick ascending chirp пїЅ C5в†’G5
        this.osc(ctx, dest, 523, now, 0.06, 'triangle', rate);
        this.osc(ctx, dest, 784, now + 0.04, 0.08, 'triangle', rate);
    }

    private genNotification(ctx: AudioContext, dest: AudioNode, now: number, rate: number): void {
        // Two-note chime пїЅ E5в†’G5
        this.osc(ctx, dest, 659, now, 0.12, 'sine', rate);
        this.osc(ctx, dest, 784, now + 0.1, 0.15, 'sine', rate);
    }

    private genVoiceJoin(ctx: AudioContext, dest: AudioNode, now: number, rate: number): void {
        // Bright ascending 3-note пїЅ C5в†’E5в†’G5 (major chord)
        this.osc(ctx, dest, 523, now, 0.13, 'sine', rate);
        this.osc(ctx, dest, 659, now + 0.1, 0.13, 'sine', rate);
        this.osc(ctx, dest, 784, now + 0.2, 0.18, 'sine', rate);
    }

    private genVoiceLeave(ctx: AudioContext, dest: AudioNode, now: number, rate: number): void {
        // Descending 2-note пїЅ E5в†’C5
        this.osc(ctx, dest, 659, now, 0.13, 'sine', rate);
        this.osc(ctx, dest, 523, now + 0.12, 0.18, 'sine', rate);
    }

    private genCallRing(ctx: AudioContext, dest: AudioNode, now: number, rate: number): void {
        // Repeating ring pattern пїЅ E5 G5 A5
        this.osc(ctx, dest, 659, now, 0.2, 'sine', rate);
        this.osc(ctx, dest, 784, now + 0.22, 0.2, 'sine', rate);
        this.osc(ctx, dest, 880, now + 0.44, 0.25, 'sine', rate);
    }

    private genCallConnect(ctx: AudioContext, dest: AudioNode, now: number, rate: number): void {
        // Quick ascending пїЅ C5в†’E5
        this.osc(ctx, dest, 523, now, 0.1, 'sine', rate);
        this.osc(ctx, dest, 659, now + 0.08, 0.14, 'sine', rate);
    }

    private genCallEnd(ctx: AudioContext, dest: AudioNode, now: number, rate: number): void {
        // Descending пїЅ G4в†’E4в†’C4
        this.osc(ctx, dest, 392, now, 0.12, 'sine', rate);
        this.osc(ctx, dest, 330, now + 0.1, 0.12, 'sine', rate);
        this.osc(ctx, dest, 262, now + 0.2, 0.18, 'sine', rate);
    }
}

export const soundEngine = new SoundEngine();


