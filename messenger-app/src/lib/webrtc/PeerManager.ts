import { socketService } from '@/lib/socket';
import { useCallStore } from '@/stores/callStore';

export interface AudioDeviceInfo {
    deviceId: string;
    label: string;
}

interface PeerState {
    pc: RTCPeerConnection;
    makingOffer: boolean;
    audioAnalyser?: AnalyserNode;
    audioContext?: AudioContext;
}

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
    {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
    {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
];

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'disconnected';
export interface ConnectionStats {
    rtt: number;
    packetLoss: number;
    bitrate: number;
}

/** Munge Opus SDP for higher quality audio */
function mungeOpusSdp(sdp: string | undefined): string | undefined {
    if (!sdp) return sdp;
    return sdp.replace(
        /a=fmtp:(\d+) (.+)/g,
        (match, pt, params) => {
            if (!params.includes('opus')) {
                // Only modify if this payload type is for Opus пїЅ check via rtpmap
                // We'll apply to all fmtp lines that follow an Opus rtpmap
            }
            const additions = 'maxaveragebitrate=64000;stereo=1;useinbandfec=1;maxplaybackrate=48000';
            // Avoid duplicates
            const existing = params.split(';').map((p: string) => p.trim().split('=')[0]);
            const toAdd = additions.split(';').filter(a => !existing.includes(a.split('=')[0]));
            return toAdd.length ? `a=fmtp:${pt} ${params};${toAdd.join(';')}` : match;
        }
    );
}

export interface AudioSettings {
    noiseSuppression: boolean;
    echoCancellation: boolean;
    autoGainControl: boolean;
}

class PeerManager {
    private peers = new Map<string, PeerState>();
    private audioElements = new Map<string, HTMLAudioElement>();
    private videoElements = new Map<string, HTMLVideoElement>();
    private localStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;
    private cameraStream: MediaStream | null = null;
    private callId: string | null = null;
    private currentDeviceId: string | null = null;
    private videoTrackKinds = new Map<string, Map<string, 'camera' | 'screen'>>();

    // Audio processing settings
    private audioSettings: AudioSettings = {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
    };

    // Connection quality monitoring
    private statsInterval: ReturnType<typeof setInterval> | null = null;
    private onQualityChange: ((quality: ConnectionQuality, stats: ConnectionStats) => void) | null = null;

    // Voice activity detection
    private localAudioContext: AudioContext | null = null;
    private localAnalyser: AnalyserNode | null = null;
    private speakingInterval: ReturnType<typeof setInterval> | null = null;
    private speakingState = new Map<string, boolean>(); // userId -> isSpeaking

    private notifyRemoteVideoChange(userId: string, stream: MediaStream | null, kind: 'camera' | 'screen'): void {
        useCallStore.getState().setRemoteVideo(userId, kind, stream);
    }

    getAudioSettings(): AudioSettings {
        return { ...this.audioSettings };
    }

    async setAudioSettings(settings: Partial<AudioSettings>): Promise<void> {
        this.audioSettings = { ...this.audioSettings, ...settings };
        // Re-apply constraints to local audio track
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                try {
                    await audioTrack.applyConstraints({
                        noiseSuppression: this.audioSettings.noiseSuppression,
                        echoCancellation: this.audioSettings.echoCancellation,
                        autoGainControl: this.audioSettings.autoGainControl,
                    });
                } catch (err) {
                    console.warn('[PeerManager] Failed to apply audio constraints:', err);
                }
            }
        }
    }

    /** Start monitoring voice activity for all streams */
    startVoiceActivityDetection(): void {
        if (this.speakingInterval) return;
        this.speakingInterval = setInterval(() => {
            this.detectLocalSpeaking();
            this.detectRemoteSpeaking();
        }, 100);
    }

    stopVoiceActivityDetection(): void {
        if (this.speakingInterval) {
            clearInterval(this.speakingInterval);
            this.speakingInterval = null;
        }
        this.speakingState.clear();
        this.localAudioContext?.close();
        this.localAudioContext = null;
        this.localAnalyser = null;
        for (const [, peer] of this.peers) {
            peer.audioContext?.close();
            peer.audioAnalyser = undefined;
            peer.audioContext = undefined;
        }
        useCallStore.getState().setSpeakingUsers({});
    }

    private setupLocalAnalyser(): void {
        if (this.localAnalyser || !this.localStream) return;
        try {
            this.localAudioContext = new AudioContext();
            const source = this.localAudioContext.createMediaStreamSource(this.localStream);
            this.localAnalyser = this.localAudioContext.createAnalyser();
            this.localAnalyser.fftSize = 256;
            source.connect(this.localAnalyser);
        } catch { /* browser might not support */ }
    }

    private setupRemoteAnalyser(userId: string, stream: MediaStream): void {
        const peer = this.peers.get(userId);
        if (!peer || peer.audioAnalyser) return;
        try {
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            peer.audioContext = ctx;
            peer.audioAnalyser = analyser;
        } catch { /* ignore */ }
    }

    private detectLocalSpeaking(): void {
        if (!this.localAnalyser) {
            this.setupLocalAnalyser();
            return;
        }
        const data = new Uint8Array(this.localAnalyser.frequencyBinCount);
        this.localAnalyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const isSpeaking = avg > 15;
        // Use 'local' key for self
        const wasSpeak = this.speakingState.get('local') ?? false;
        if (isSpeaking !== wasSpeak) {
            this.speakingState.set('local', isSpeaking);
            this.flushSpeakingState();
        }
    }

    private detectRemoteSpeaking(): void {
        for (const [userId, peer] of this.peers) {
            if (!peer.audioAnalyser) continue;
            const data = new Uint8Array(peer.audioAnalyser.frequencyBinCount);
            peer.audioAnalyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            const isSpeaking = avg > 15;
            const wasSpeak = this.speakingState.get(userId) ?? false;
            if (isSpeaking !== wasSpeak) {
                this.speakingState.set(userId, isSpeaking);
                this.flushSpeakingState();
            }
        }
    }

    private flushSpeakingState(): void {
        const obj: Record<string, boolean> = {};
        for (const [k, v] of this.speakingState) {
            obj[k] = v;
        }
        useCallStore.getState().setSpeakingUsers(obj);
    }

    /** List available audio input devices */
    async getAudioDevices(): Promise<AudioDeviceInfo[]> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices
                .filter((d) => d.kind === 'audioinput')
                .map((d) => ({
                    deviceId: d.deviceId,
                    label: d.label || `Устройство ${d.deviceId.slice(0, 4)}`,
                }));
        } catch {
            return [];
        }
    }

    /** Init mic with optional deviceId */
    async init(deviceId?: string): Promise<MediaStream> {
        if (this.localStream) {
            this.localStream.getTracks().forEach((t) => t.stop());
        }

        const constraints: MediaStreamConstraints = {
            audio: deviceId
                ? { deviceId: { exact: deviceId }, ...this.audioSettings, sampleRate: 48000, channelCount: 1 }
                : { ...this.audioSettings, sampleRate: 48000, channelCount: 1 },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.localStream = stream;
        this.currentDeviceId = deviceId || null;
        console.log('[PeerManager] Mic initialized, tracks:', stream.getAudioTracks().length);
        return stream;
    }

    /** Switch mic device while in a call */
    async switchDevice(deviceId: string): Promise<void> {
        const stream = await this.init(deviceId);
        useCallStore.getState().setLocalStream(stream);

        const newTrack = stream.getAudioTracks()[0];
        if (!newTrack) return;

        for (const [, peer] of this.peers) {
            const sender = peer.pc.getSenders().find((s) => s.track?.kind === 'audio');
            if (sender) {
                await sender.replaceTrack(newTrack);
            }
        }
    }

    /** Toggle webcam on/off */
    async toggleCamera(): Promise<MediaStream | null> {
        if (this.cameraStream) {
            // Stop camera
            const cameraTrackId = this.cameraStream.getVideoTracks()[0]?.id;
            this.cameraStream.getTracks().forEach((t) => t.stop());
            // Remove video track from all peers
            for (const [userId, peer] of this.peers) {
                const sender = peer.pc.getSenders().find((s) => s.track?.id === cameraTrackId);
                if (sender) {
                    peer.pc.removeTrack(sender);
                }
                this.videoTrackKinds.get(userId)?.delete(cameraTrackId || '');
            }
            this.cameraStream = null;
            this.renegotiateAll();
            return null;
        }

        // Start camera
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
        this.cameraStream = stream;
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return null;

        // Set contentHint so remote side can distinguish
        videoTrack.contentHint = 'motion';

        // Add video track to all peers
        for (const [userId, peer] of this.peers) {
            peer.pc.addTrack(videoTrack, stream);
            if (!this.videoTrackKinds.has(userId)) this.videoTrackKinds.set(userId, new Map());
            this.videoTrackKinds.get(userId)!.set(videoTrack.id, 'camera');
        }
        this.renegotiateAll();
        return stream;
    }

    /** Toggle screen sharing on/off */
    async toggleScreenShare(): Promise<MediaStream | null> {
        if (this.screenStream) {
            // Stop screen share
            const screenTrackId = this.screenStream.getVideoTracks()[0]?.id;
            this.screenStream.getTracks().forEach((t) => t.stop());
            for (const [userId, peer] of this.peers) {
                const sender = peer.pc.getSenders().find((s) => s.track?.id === screenTrackId);
                if (sender) {
                    peer.pc.removeTrack(sender);
                }
                this.videoTrackKinds.get(userId)?.delete(screenTrackId || '');
            }
            this.screenStream = null;
            this.renegotiateAll();
            return null;
        }

        // Start screen share пїЅ cap at 720p/15fps to reduce lag
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 15, max: 30 },
            },
            audio: false,
        });
        this.screenStream = stream;

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return null;

        // Set contentHint so remote side can distinguish screen from camera
        videoTrack.contentHint = 'detail';

        // Handle browser "stop sharing" button
        videoTrack.addEventListener('ended', () => {
            const trackId = videoTrack.id;
            this.screenStream = null;
            for (const [userId, peer] of this.peers) {
                const sender = peer.pc.getSenders().find((s) => s.track?.id === trackId);
                if (sender) {
                    peer.pc.removeTrack(sender);
                }
                this.videoTrackKinds.get(userId)?.delete(trackId);
            }
            this.renegotiateAll();
            useCallStore.getState().setScreenSharing(false);
            useCallStore.getState().setScreenStream(null);
        });

        // Add screen track to all peers
        for (const [userId, peer] of this.peers) {
            peer.pc.addTrack(videoTrack, stream);
            if (!this.videoTrackKinds.has(userId)) this.videoTrackKinds.set(userId, new Map());
            this.videoTrackKinds.get(userId)!.set(videoTrack.id, 'screen');
        }
        this.renegotiateAll();
        return stream;
    }

    getCameraStream(): MediaStream | null {
        return this.cameraStream;
    }

    getScreenStream(): MediaStream | null {
        return this.screenStream;
    }

    /** Tune encoding params for screen share senders пїЅ lower bitrate, prefer detail */
    private async tuneScreenSenders(): Promise<void> {
        for (const [, peer] of this.peers) {
            for (const sender of peer.pc.getSenders()) {
                if (sender.track?.kind === 'video' && sender.track.contentHint === 'detail') {
                    try {
                        const params = sender.getParameters();
                        if (!params.encodings?.length) continue;
                        params.encodings[0].maxBitrate = 1_500_000; // 1.5 Mbps cap
                        params.encodings[0].maxFramerate = 15;
                        (params as any).degradationPreference = 'maintain-resolution';
                        await sender.setParameters(params);
                    } catch { /* some browsers don't support setParameters */ }
                }
            }
        }
    }

    private renegotiateAll(): void {
        for (const [userId, peerState] of this.peers) {
            this.createAndSendOffer(userId, peerState);
        }
        // After renegotiation, tune screen share encoding
        setTimeout(() => this.tuneScreenSenders(), 500);
    }

    getCurrentDeviceId(): string | null {
        return this.currentDeviceId;
    }

    setCallId(callId: string): void {
        this.callId = callId;
    }

    createPeer(userId: string, initiator: boolean): void {
        if (this.peers.has(userId)) {
            this.removePeer(userId);
        }

        if (!this.localStream) {
            console.error('[PeerManager] No local stream - cannot create peer for', userId);
            return;
        }

        console.log(`[PeerManager] Creating peer for ${userId}, initiator=${initiator}`);

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const peerState: PeerState = { pc, makingOffer: false };

        // Add local audio tracks to the connection
        for (const track of this.localStream.getTracks()) {
            pc.addTrack(track, this.localStream);
        }

        // Track video kinds for this peer
        if (!this.videoTrackKinds.has(userId)) this.videoTrackKinds.set(userId, new Map());
        const kinds = this.videoTrackKinds.get(userId)!;

        // Add camera tracks if active
        if (this.cameraStream) {
            for (const track of this.cameraStream.getVideoTracks()) {
                track.contentHint = 'motion';
                pc.addTrack(track, this.cameraStream);
                kinds.set(track.id, 'camera');
            }
        }

        // Add screen share tracks if active
        if (this.screenStream) {
            for (const track of this.screenStream.getVideoTracks()) {
                track.contentHint = 'detail';
                pc.addTrack(track, this.screenStream);
                kinds.set(track.id, 'screen');
            }
        }

        // Send ICE candidates to remote peer
        pc.onicecandidate = (event) => {
            if (event.candidate && this.callId) {
                socketService.sendSignal(this.callId, userId, {
                    type: 'candidate',
                    candidate: event.candidate.toJSON(),
                });
            }
        };

        // Receive remote tracks (audio + video)
        pc.ontrack = (event) => {
            console.log(`[PeerManager] Got remote track from ${userId}, kind=${event.track.kind}, label=${event.track.label}, hint=${event.track.contentHint}, streams:`, event.streams.length);
            const stream = event.streams[0] || new MediaStream([event.track]);

            if (event.track.kind === 'audio') {
                this.handleRemoteStream(userId, stream);
            } else if (event.track.kind === 'video') {
                // Determine if this is camera or screen share:
                // 1. contentHint 'detail' = screen share, 'motion' or '' = camera
                // 2. Fallback: check label for 'screen'/'monitor'/'window'/'tab'
                const hint = event.track.contentHint;
                const label = event.track.label.toLowerCase();
                const isScreen = hint === 'detail' ||
                    (!hint && (label.includes('screen') || label.includes('monitor') || label.includes('window') || label.includes('tab')));
                const kind: 'camera' | 'screen' = isScreen ? 'screen' : 'camera';

                console.log(`[PeerManager] Remote video from ${userId}: kind=${kind}`);
                this.notifyRemoteVideoChange(userId, stream, kind);

                event.track.addEventListener('ended', () => {
                    this.notifyRemoteVideoChange(userId, null, kind);
                });
            }
        };

        // Auto-renegotiate when browser detects need (track add/remove)
        pc.onnegotiationneeded = () => {
            console.log(`[PeerManager] Negotiation needed for ${userId}`);
            if (!peerState.makingOffer) {
                this.createAndSendOffer(userId, peerState);
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`[PeerManager] ICE state (${userId}):`, pc.iceConnectionState);
        };

        pc.onconnectionstatechange = () => {
            console.log(`[PeerManager] Connection state (${userId}):`, pc.connectionState);
        };

        // For the initiator: create and send offer
        if (initiator) {
            this.createAndSendOffer(userId, peerState);
        }

        this.peers.set(userId, peerState);
    }

    private async createAndSendOffer(userId: string, peerState: PeerState): Promise<void> {
        const { pc } = peerState;
        try {
            peerState.makingOffer = true;
            const offer = await pc.createOffer();
            if (offer.sdp) offer.sdp = mungeOpusSdp(offer.sdp)!;
            await pc.setLocalDescription(offer);
            if (this.callId && pc.localDescription) {
                console.log(`[PeerManager] Sending offer to ${userId}`);
                socketService.sendSignal(this.callId, userId, {
                    type: 'description',
                    sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
                });
            }
        } catch (err) {
            console.error('[PeerManager] createOffer error:', err);
        } finally {
            peerState.makingOffer = false;
        }
    }

    async handleSignal(userId: string, signal: any): Promise<void> {
        const peerState = this.peers.get(userId);
        if (!peerState) {
            console.warn(`[PeerManager] No peer for signal from ${userId}`);
            return;
        }

        const { pc } = peerState;

        try {
            if (signal.type === 'description') {
                const mungedSdp = mungeOpusSdp(signal.sdp.sdp);
                const desc = new RTCSessionDescription({ ...signal.sdp, sdp: mungedSdp });
                console.log(`[PeerManager] Got ${desc.type} from ${userId}, signalingState=${pc.signalingState}`);

                // Handle "glare" (both sides send offers simultaneously)
                const offerCollision =
                    desc.type === 'offer' &&
                    (peerState.makingOffer || pc.signalingState !== 'stable');

                if (offerCollision) {
                    console.log('[PeerManager] Offer collision, rolling back');
                    await pc.setLocalDescription({ type: 'rollback' });
                }

                await pc.setRemoteDescription(desc);

                if (desc.type === 'offer') {
                    const answer = await pc.createAnswer();
                    if (answer.sdp) answer.sdp = mungeOpusSdp(answer.sdp)!;
                    await pc.setLocalDescription(answer);
                    if (this.callId && pc.localDescription) {
                        console.log(`[PeerManager] Sending answer to ${userId}`);
                        socketService.sendSignal(this.callId, userId, {
                            type: 'description',
                            sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
                        });
                    }
                }
            } else if (signal.type === 'candidate' && signal.candidate) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } catch (err) {
                    if (pc.remoteDescription) {
                        console.warn('[PeerManager] Failed to add ICE candidate:', err);
                    }
                }
            }
        } catch (err) {
            console.error('[PeerManager] handleSignal error:', err);
        }
    }

    private handleRemoteStream(userId: string, stream: MediaStream): void {
        this.removeAudioElement(userId);

        console.log(`[PeerManager] Setting up audio element for ${userId}, tracks:`, stream.getAudioTracks().length);

        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        (audio as any).playsInline = true;
        audio.id = `remote-audio-${userId}`;
        // Keep off-screen but not display:none (some browsers optimize away hidden elements)
        audio.style.position = 'absolute';
        audio.style.left = '-9999px';

        const storedVolume = useCallStore.getState().participantVolumes[userId] ?? 100;
        audio.volume = Math.min(storedVolume / 100, 1);

        document.body.appendChild(audio);
        this.audioElements.set(userId, audio);

        const playPromise = audio.play();
        if (playPromise) {
            playPromise
                .then(() => {
                    console.log(`[PeerManager] Audio playing for ${userId}`);
                })
                .catch((err) => {
                    console.warn('[PeerManager] Audio autoplay blocked:', err);
                    // Retry on next user interaction
                    const resumePlay = () => {
                        audio.play().catch(() => {});
                        document.removeEventListener('click', resumePlay);
                        document.removeEventListener('touchstart', resumePlay);
                    };
                    document.addEventListener('click', resumePlay, { once: true });
                    document.addEventListener('touchstart', resumePlay, { once: true });
                });
        }

        // Set up voice activity analyser for this remote user
        this.setupRemoteAnalyser(userId, stream);
    }

    setVolume(userId: string, volume: number): void {
        const audio = this.audioElements.get(userId);
        if (audio) {
            audio.volume = Math.min(volume / 100, 1);
        }
    }

    private removeAudioElement(userId: string): void {
        const audio = this.audioElements.get(userId);
        if (audio) {
            audio.pause();
            audio.srcObject = null;
            audio.remove();
            this.audioElements.delete(userId);
        }
        const legacy = document.getElementById(`remote-audio-${userId}`);
        if (legacy) legacy.remove();
    }

    removePeer(userId: string): void {
        const peerState = this.peers.get(userId);
        if (peerState) {
            peerState.audioContext?.close();
            peerState.pc.close();
        }
        this.peers.delete(userId);
        this.videoTrackKinds.delete(userId);
        this.speakingState.delete(userId);
        this.removeAudioElement(userId);
        this.notifyRemoteVideoChange(userId, null, 'camera');
        this.notifyRemoteVideoChange(userId, null, 'screen');
    }

    /** Set callback for connection quality changes */
    onConnectionQualityChange(cb: (quality: ConnectionQuality, stats: ConnectionStats) => void): void {
        this.onQualityChange = cb;
    }

    /** Start polling WebRTC stats every 2s */
    startStatsPolling(): void {
        if (this.statsInterval) return;
        this.statsInterval = setInterval(async () => {
            // Use the first peer connection for stats
            const firstPeer = this.peers.values().next().value as PeerState | undefined;
            if (!firstPeer) return;
            try {
                const report = await firstPeer.pc.getStats();
                let rtt = 0;
                let packetLoss = 0;
                let bitrate = 0;
                report.forEach((stat) => {
                    if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                        rtt = stat.currentRoundTripTime ? stat.currentRoundTripTime * 1000 : 0;
                    }
                    if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
                        if (stat.packetsLost !== undefined && stat.packetsReceived) {
                            packetLoss = (stat.packetsLost / (stat.packetsReceived + stat.packetsLost)) * 100;
                        }
                    }
                    if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
                        bitrate = stat.bytesSent ? (stat.bytesSent * 8) / 1000 : 0; // kbps
                    }
                });
                const stats: ConnectionStats = { rtt, packetLoss, bitrate };
                let quality: ConnectionQuality;
                if (rtt < 100 && packetLoss < 1) quality = 'excellent';
                else if (rtt < 200 && packetLoss < 3) quality = 'good';
                else if (rtt < 400 && packetLoss < 10) quality = 'poor';
                else quality = 'disconnected';
                this.onQualityChange?.(quality, stats);
            } catch { /* ignore stats errors */ }
        }, 2000);
    }

    stopStatsPolling(): void {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    /** Deafen: mute all remote audio */
    setDeafened(deafened: boolean): void {
        for (const [, audio] of this.audioElements) {
            audio.muted = deafened;
        }
    }

    destroy(): void {
        this.stopVoiceActivityDetection();
        this.stopStatsPolling();

        for (const [userId] of this.peers) {
            this.removePeer(userId);
        }
        this.peers.clear();
        this.audioElements.clear();
        this.videoElements.clear();
        this.videoTrackKinds.clear();

        if (this.localStream) {
            this.localStream.getTracks().forEach((t) => t.stop());
            this.localStream = null;
        }
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach((t) => t.stop());
            this.cameraStream = null;
        }
        if (this.screenStream) {
            this.screenStream.getTracks().forEach((t) => t.stop());
            this.screenStream = null;
        }

        this.callId = null;
        this.currentDeviceId = null;
    }

    /** Replace camera video track in all peer connections (for effects pipeline) */
    async replaceCameraTrack(newTrack: MediaStreamTrack): Promise<void> {
        for (const [, peer] of this.peers) {
            const sender = peer.pc.getSenders().find((s) =>
                s.track?.kind === 'video' && s.track.contentHint !== 'detail'
            );
            if (sender) {
                await sender.replaceTrack(newTrack);
            }
        }
    }

    hasPeer(userId: string): boolean {
        return this.peers.has(userId);
    }

    getLocalStream(): MediaStream | null {
        return this.localStream;
    }
}

export const peerManager = new PeerManager();


