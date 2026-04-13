class Ringtone {
    private audioCtx: AudioContext | null = null;
    private intervalId: number | null = null;
    private playing = false;
    private mode: 'incoming' | 'caller' | null = null;

    /** Incoming ring пїЅ Telegram-style dual-frequency phone ring (425Hz + 350Hz, 1s ring / 4s pause) */
    start(): void {
        if (this.playing) return;
        this.playing = true;
        this.mode = 'incoming';

        this.audioCtx = new AudioContext();
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const playRing = () => {
            if (!this.audioCtx || !this.playing) return;

            const now = this.audioCtx.currentTime;
            const gain = this.audioCtx.createGain();
            // Envelope: quick attack, sustain 0.8s, then fade out
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
            gain.gain.setValueAtTime(0.18, now + 0.4);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            // Second burst
            gain.gain.linearRampToValueAtTime(0.18, now + 0.52);
            gain.gain.setValueAtTime(0.18, now + 0.9);
            gain.gain.linearRampToValueAtTime(0, now + 1.0);
            gain.connect(this.audioCtx.destination);

            // Dual-frequency: 425Hz + 350Hz (standard phone ring)
            for (const freq of [425, 350]) {
                const osc = this.audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 1.0);
            }
        };

        playRing();
        this.intervalId = window.setInterval(playRing, 5000); // 1s ring + 4s pause
    }

    /** Caller-side ringback tone пїЅ single 425Hz, 1s on / 4s off (what caller hears while ringing) */
    startCallerTone(): void {
        if (this.playing) return;
        this.playing = true;
        this.mode = 'caller';

        this.audioCtx = new AudioContext();
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const playTone = () => {
            if (!this.audioCtx || !this.playing) return;

            const now = this.audioCtx.currentTime;
            const gain = this.audioCtx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
            gain.gain.setValueAtTime(0.1, now + 0.9);
            gain.gain.linearRampToValueAtTime(0, now + 1.0);
            gain.connect(this.audioCtx.destination);

            const osc = this.audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(425, now);
            osc.connect(gain);
            osc.start(now);
            osc.stop(now + 1.0);
        };

        playTone();
        this.intervalId = window.setInterval(playTone, 5000); // 1s tone + 4s silence
    }

    stop(): void {
        this.playing = false;
        this.mode = null;
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
    }

    isPlaying(): boolean {
        return this.playing;
    }

    getMode(): 'incoming' | 'caller' | null {
        return this.mode;
    }
}

export const ringtone = new Ringtone();


