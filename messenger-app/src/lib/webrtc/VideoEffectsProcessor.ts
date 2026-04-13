/**
 * VideoEffectsProcessor пїЅ Canvas-based video processing pipeline.
 * Takes a raw camera MediaStream, applies visual effects (filters, face masks),
 * and outputs a processed MediaStream via canvas.captureStream().
 */

export type VideoEffect =
    | 'none'
    | 'grayscale'
    | 'sepia'
    | 'nightvision'
    | 'invert'
    | 'blur'
    | 'contrast'
    | 'warm'
    | 'cool'
    | 'vignette'
    | 'mask-sunglasses'
    | 'mask-cat'
    | 'mask-crown'
    | 'mask-hearts'
    | 'mask-clown'
    | 'mask-fire';

export interface EffectInfo {
    id: VideoEffect;
    label: string;
    emoji: string;
    category: 'filter' | 'mask';
}

export const EFFECTS: EffectInfo[] = [
    { id: 'none', label: 'Без эффектов', emoji: '⛔', category: 'filter' },
    { id: 'grayscale', label: 'Ч/Б', emoji: '🖤', category: 'filter' },
    { id: 'sepia', label: 'Сепия', emoji: '📜', category: 'filter' },
    { id: 'warm', label: 'Теплый', emoji: '🌅', category: 'filter' },
    { id: 'cool', label: 'Холодный', emoji: '❄️', category: 'filter' },
    { id: 'nightvision', label: 'Ночное зрение', emoji: '🌙', category: 'filter' },
    { id: 'invert', label: 'Инверсия', emoji: '🔄', category: 'filter' },
    { id: 'contrast', label: 'Контраст', emoji: '🎨', category: 'filter' },
    { id: 'blur', label: 'Размытие', emoji: '💨', category: 'filter' },
    { id: 'vignette', label: 'Виньетка', emoji: '📷', category: 'filter' },
    { id: 'mask-sunglasses', label: 'Очки', emoji: '🕶️', category: 'mask' },
    { id: 'mask-cat', label: 'Кот', emoji: '🐱', category: 'mask' },
    { id: 'mask-crown', label: 'Корона', emoji: '👑', category: 'mask' },
    { id: 'mask-hearts', label: 'Сердечки', emoji: '💕', category: 'mask' },
    { id: 'mask-clown', label: 'Клоун', emoji: '🤡', category: 'mask' },
    { id: 'mask-fire', label: 'Огонь', emoji: '🔥', category: 'mask' },
];

class VideoEffectsProcessor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private videoElement: HTMLVideoElement;
    private animationId: number | null = null;
    private outputStream: MediaStream | null = null;
    private currentEffect: VideoEffect = 'none';
    private faceDetector: any = null;
    private lastFaces: any[] = [];
    private faceDetectionInterval: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
        this.videoElement = document.createElement('video');
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.style.display = 'none';

        // Try to create FaceDetector (Chromium 70+)
        if ('FaceDetector' in window) {
            try {
                this.faceDetector = new (window as any).FaceDetector({
                    maxDetectedFaces: 5,
                    fastMode: true,
                });
            } catch {
                // Not available
            }
        }
    }

    setEffect(effect: VideoEffect): void {
        this.currentEffect = effect;
        // Start/stop face detection based on effect
        if (effect.startsWith('mask-') && this.running) {
            this.startFaceDetection();
        } else {
            this.stopFaceDetection();
            this.lastFaces = [];
        }
    }

    getEffect(): VideoEffect {
        return this.currentEffect;
    }

    hasFaceDetection(): boolean {
        return !!this.faceDetector;
    }

    isRunning(): boolean {
        return this.running;
    }

    async start(inputStream: MediaStream): Promise<MediaStream> {
        this.stop();

        const videoTrack = inputStream.getVideoTracks()[0];
        if (!videoTrack) throw new Error('No video track in input stream');

        const settings = videoTrack.getSettings();
        this.canvas.width = settings.width || 640;
        this.canvas.height = settings.height || 480;

        this.videoElement.srcObject = inputStream;
        await this.videoElement.play();
        this.running = true;

        // Start render loop
        this.renderLoop();

        // Capture canvas as stream at 30fps
        this.outputStream = this.canvas.captureStream(30);

        // Start face detection if mask is active
        if (this.currentEffect.startsWith('mask-')) {
            this.startFaceDetection();
        }

        return this.outputStream;
    }

    stop(): void {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.stopFaceDetection();
        this.videoElement.pause();
        this.videoElement.srcObject = null;
        this.outputStream = null;
        this.lastFaces = [];
    }

    getOutputVideoTrack(): MediaStreamTrack | null {
        return this.outputStream?.getVideoTracks()[0] ?? null;
    }

    getOutputStream(): MediaStream | null {
        return this.outputStream;
    }

    // ---- Face Detection ----

    private startFaceDetection(): void {
        if (this.faceDetectionInterval || !this.faceDetector) return;
        this.faceDetectionInterval = setInterval(async () => {
            if (!this.running || !this.videoElement.videoWidth) return;
            try {
                const faces = await this.faceDetector.detect(this.videoElement);
                this.lastFaces = faces;
            } catch {
                // Detection failed this frame
            }
        }, 100); // 10fps detection
    }

    private stopFaceDetection(): void {
        if (this.faceDetectionInterval) {
            clearInterval(this.faceDetectionInterval);
            this.faceDetectionInterval = null;
        }
    }

    // ---- Render Loop ----

    private renderLoop = (): void => {
        if (!this.running) return;

        const { canvas, ctx, videoElement } = this;
        if (!videoElement.videoWidth) {
            this.animationId = requestAnimationFrame(this.renderLoop);
            return;
        }

        // Match canvas size to actual video dimensions
        if (canvas.width !== videoElement.videoWidth || canvas.height !== videoElement.videoHeight) {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
        }

        ctx.save();

        // Apply CSS filter for simple effects
        const filter = this.getCanvasFilter();
        if (filter) {
            ctx.filter = filter;
        }

        // Draw video frame
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Post-processing effects that need pixel manipulation
        if (this.currentEffect === 'vignette') {
            this.drawVignette();
        } else if (this.currentEffect === 'warm') {
            this.drawColorOverlay('rgba(255, 140, 50, 0.12)');
        } else if (this.currentEffect === 'cool') {
            this.drawColorOverlay('rgba(50, 100, 255, 0.12)');
        }

        // Draw face masks on top
        if (this.currentEffect.startsWith('mask-')) {
            this.drawFaceMasks();
        }

        this.animationId = requestAnimationFrame(this.renderLoop);
    };

    private getCanvasFilter(): string | null {
        switch (this.currentEffect) {
            case 'grayscale': return 'grayscale(100%)';
            case 'sepia': return 'sepia(85%)';
            case 'nightvision': return 'brightness(1.4) contrast(1.4) hue-rotate(90deg) saturate(2)';
            case 'invert': return 'invert(100%)';
            case 'blur': return 'blur(3px)';
            case 'contrast': return 'contrast(1.6) saturate(1.4)';
            default: return null;
        }
    }

    private drawVignette(): void {
        const { ctx, canvas } = this;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = Math.max(cx, cy) * 1.2;

        const gradient = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.6)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    private drawColorOverlay(color: string): void {
        const { ctx, canvas } = this;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    private drawFaceMasks(): void {
        const { ctx } = this;

        for (const face of this.lastFaces) {
            const { x, y, width, height } = face.boundingBox;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            switch (this.currentEffect) {
                case 'mask-sunglasses': {
                    const emojiSize = width * 0.7;
                    ctx.font = `${emojiSize}px serif`;
                    ctx.fillText('рџ•¶пёЏ', x + width / 2, y + height * 0.38);
                    break;
                }
                case 'mask-cat': {
                    // Cat ears on top
                    const earSize = width * 0.4;
                    ctx.font = `${earSize}px serif`;
                    ctx.fillText('рџђ±', x + width * 0.2, y - height * 0.05);
                    ctx.fillText('рџђ±', x + width * 0.8, y - height * 0.05);
                    // Cat nose
                    const noseSize = width * 0.25;
                    ctx.font = `${noseSize}px serif`;
                    ctx.fillText('рџђѕ', x + width / 2, y + height * 0.65);
                    break;
                }
                case 'mask-crown': {
                    const crownSize = width * 0.7;
                    ctx.font = `${crownSize}px serif`;
                    ctx.fillText('рџ‘‘', x + width / 2, y - height * 0.15);
                    break;
                }
                case 'mask-hearts': {
                    const heartSize = width * 0.35;
                    ctx.font = `${heartSize}px serif`;
                    // Hearts around face
                    ctx.fillText('рџ’–', x + width * 0.15, y + height * 0.3);
                    ctx.fillText('рџ’–', x + width * 0.85, y + height * 0.3);
                    ctx.fillText('рџ’•', x + width / 2, y - height * 0.1);
                    ctx.fillText('вњЁ', x - width * 0.05, y + height * 0.6);
                    ctx.fillText('вњЁ', x + width * 1.05, y + height * 0.6);
                    break;
                }
                case 'mask-clown': {
                    // Clown nose
                    const noseSize = width * 0.3;
                    ctx.font = `${noseSize}px serif`;
                    ctx.fillText('рџ”ґ', x + width / 2, y + height * 0.52);
                    // Clown wig
                    const wigSize = width * 0.5;
                    ctx.font = `${wigSize}px serif`;
                    ctx.fillText('рџ¤Ў', x + width / 2, y - height * 0.08);
                    break;
                }
                case 'mask-fire': {
                    const fireSize = width * 0.35;
                    ctx.font = `${fireSize}px serif`;
                    // Fire around head
                    ctx.fillText('рџ”Ґ', x + width * 0.1, y - height * 0.05);
                    ctx.fillText('рџ”Ґ', x + width * 0.5, y - height * 0.15);
                    ctx.fillText('рџ”Ґ', x + width * 0.9, y - height * 0.05);
                    ctx.fillText('рџ”Ґ', x - width * 0.05, y + height * 0.4);
                    ctx.fillText('рџ”Ґ', x + width * 1.05, y + height * 0.4);
                    break;
                }
            }

            ctx.restore();
        }

        // If no FaceDetector, draw masks in center of frame as fallback
        if (!this.faceDetector && this.currentEffect.startsWith('mask-')) {
            this.drawCenterMask();
        }
    }

    private drawCenterMask(): void {
        const { ctx, canvas } = this;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const size = Math.min(canvas.width, canvas.height) * 0.15;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${size}px serif`;

        switch (this.currentEffect) {
            case 'mask-sunglasses': ctx.fillText('рџ•¶пёЏ', cx, cy * 0.7); break;
            case 'mask-cat': ctx.fillText('рџє', cx, cy * 0.3); break;
            case 'mask-crown': ctx.fillText('рџ‘‘', cx, cy * 0.3); break;
            case 'mask-hearts':
                ctx.fillText('рџ’–', cx - size, cy * 0.5);
                ctx.fillText('рџ’–', cx + size, cy * 0.5);
                break;
            case 'mask-clown': ctx.fillText('рџ¤Ў', cx, cy * 0.35); break;
            case 'mask-fire':
                ctx.fillText('рџ”Ґ', cx - size, cy * 0.3);
                ctx.fillText('рџ”Ґ', cx, cy * 0.2);
                ctx.fillText('рџ”Ґ', cx + size, cy * 0.3);
                break;
        }

        ctx.restore();
    }
}

export const videoEffects = new VideoEffectsProcessor();


