import { socketService } from '@/lib/socket';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import type { ConnectionQualityLevel, ConnectionStats } from '@/types';

interface VCPeerState {
    pc: RTCPeerConnection;
    makingOffer: boolean;
    audioAnalyser?: AnalyserNode;
    audioContext?: AudioContext;
}

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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

/** Munge Opus SDP for higher quality audio */
function mungeOpusSdp(sdp: string | undefined): string | undefined {
    if (!sdp) return sdp;
    return sdp.replace(
        /a=fmtp:(\d+) (.+)/g,
        (match, pt, params) => {
            const additions = 'maxaveragebitrate=64000;stereo=1;useinbandfec=1;maxplaybackrate=48000';
            const existing = params.split(';').map((p: string) => p.trim().split('=')[0]);
            const toAdd = additions.split(';').filter((a: string) => !existing.includes(a.split('=')[0]));
            return toAdd.length ? `a=fmtp:${pt} ${params};${toAdd.join(';')}` : match;
        }
    );
}

/**
 * Voice Channel PeerManager with support for:
 * - Audio (mic) with PTT and Noise Gate
 * - Simultaneous screen share + camera (two video tracks at once)
 * - Remote video stream tracking with callbacks
 * - Connection quality monitoring
 * - Priority speaker volume ducking
 */
class VoiceChannelPeerManager {
    private peers = new Map<string, VCPeerState>();
    private audioElements = new Map<string, HTMLAudioElement>();
    private localStream: MediaStream | null = null;

    // Voice activity detection
    private localAudioContext: AudioContext | null = null;
    private localAnalyser: AnalyserNode | null = null;
    private speakingInterval: ReturnType<typeof setInterval> | null = null;
    private wasSpeaking = false;

    // Noise gate — audio processing node chain
    private noiseGateNode: GainNode | null = null;
    private localGainNode: GainNode | null = null;

    // Connection quality monitoring
    private statsInterval: ReturnType<typeof setInterval> | null = null;
    private lastBytesSent = 0;
    private lastBytesReceived = 0;
    private lastStatsTimestamp = 0;

    // Priority speaker volume ducking
    private originalVolumes = new Map<string, number>();
    private isDucking = false;

    // ── Separate screen / camera senders per peer ──
    private screenSenders = new Map<string, RTCRtpSender>();
    private cameraSenders = new Map<string, RTCRtpSender>();

    // ── Remote video streams ──
    private remoteVideoStreams = new Map<string, MediaStream[]>();
    private videoChangeCallbacks: ((streams: Map<string, MediaStream[]>) => void)[] = [];

    /** Init mic and start local stream */
    async init(deviceId?: string): Promise<MediaStream> {
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
        }

        const settings = useVoiceChannelStore.getState().voiceSettings;
        const constraints: MediaStreamConstraints = {
            audio: {
                ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
                noiseSuppression: settings.noiseSuppression,
                echoCancellation: settings.echoCancellation,
                autoGainControl: settings.autoGainControl,
                sampleRate: 48000,
                channelCount: 1,
            },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.localStream = stream;

        // If PTT mode, start muted
        if (settings.inputMode === 'pushToTalk') {
            for (const track of stream.getAudioTracks()) {
                track.enabled = false;
            }
        }

        console.log('[VCPeerManager] Mic initialized');
        return stream;
    }

    // ═════════════════════════════════════════
    //  Push-to-Talk
    // ═════════════════════════════════════════

    /** Set PTT state — enables/disables audio track */
    setPTTState(active: boolean): void {
        if (!this.localStream) return;
        const settings = useVoiceChannelStore.getState().voiceSettings;
        if (settings.inputMode !== 'pushToTalk') return;

        for (const track of this.localStream.getAudioTracks()) {
            track.enabled = active;
        }

        // Emit speaking state
        const channelId = useVoiceChannelStore.getState().currentChannel?.id;
        if (channelId) {
            socketService.voiceSpeaking(channelId, active);
        }

        useVoiceChannelStore.getState().setPTTActive(active);
    }

    // ═════════════════════════════════════════
    //  Voice Activity Detection + Noise Gate
    // ═════════════════════════════════════════

    /** Start VAD — emits voice:speaking events, applies noise gate */
    startVoiceActivityDetection(): void {
        if (this.speakingInterval || !this.localStream) return;

        try {
            this.localAudioContext = new AudioContext();
            const source = this.localAudioContext.createMediaStreamSource(this.localStream);
            this.localAnalyser = this.localAudioContext.createAnalyser();
            this.localAnalyser.fftSize = 256;
            source.connect(this.localAnalyser);
        } catch {
            return;
        }

        this.speakingInterval = setInterval(() => {
            if (!this.localAnalyser) return;
            const data = new Uint8Array(this.localAnalyser.frequencyBinCount);
            this.localAnalyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;

            const settings = useVoiceChannelStore.getState().voiceSettings;

            // In PTT mode, skip VAD — speaking state is controlled by setPTTState
            if (settings.inputMode === 'pushToTalk') return;

            const threshold = settings.noiseGateEnabled ? settings.noiseGateThreshold : 15;
            const isSpeaking = avg > threshold;

            // Noise gate: actually mute/unmute the audio track
            if (settings.noiseGateEnabled && this.localStream) {
                for (const track of this.localStream.getAudioTracks()) {
                    // Don't override manual mute
                    if (!useVoiceChannelStore.getState().isMuted) {
                        track.enabled = isSpeaking;
                    }
                }
            }

            if (isSpeaking !== this.wasSpeaking) {
                this.wasSpeaking = isSpeaking;
                const channelId = useVoiceChannelStore.getState().currentChannel?.id;
                if (channelId) {
                    socketService.voiceSpeaking(channelId, isSpeaking);
                }
            }
        }, 100);
    }

    stopVoiceActivityDetection(): void {
        if (this.speakingInterval) {
            clearInterval(this.speakingInterval);
            this.speakingInterval = null;
        }
        this.wasSpeaking = false;
        this.localAudioContext?.close();
        this.localAudioContext = null;
        this.localAnalyser = null;
    }

    /** Get current audio level (0-100) for UI meters */
    getCurrentAudioLevel(): number {
        if (!this.localAnalyser) return 0;
        const data = new Uint8Array(this.localAnalyser.frequencyBinCount);
        this.localAnalyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        return Math.min(100, (avg / 128) * 100);
    }

    // ═════════════════════════════════════════
    //  Connection Quality Monitoring
    // ═════════════════════════════════════════

    startConnectionMonitoring(): void {
        if (this.statsInterval) return;

        this.lastStatsTimestamp = Date.now();
        this.lastBytesSent = 0;
        this.lastBytesReceived = 0;

        this.statsInterval = setInterval(async () => {
            const stats = await this.aggregateStats();
            if (stats) {
                const quality = this.computeQuality(stats);
                useVoiceChannelStore.getState().setConnectionQuality(quality);
                useVoiceChannelStore.getState().setConnectionStats(stats);
            }
        }, 2000);
    }

    stopConnectionMonitoring(): void {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        useVoiceChannelStore.getState().setConnectionQuality('excellent');
        useVoiceChannelStore.getState().setConnectionStats(null);
    }

    private async aggregateStats(): Promise<ConnectionStats | null> {
        let totalRtt = 0;
        let totalPacketLoss = 0;
        let totalBytesNow = 0;
        let peerCount = 0;
        let totalJitter = 0;

        for (const [, peerState] of this.peers) {
            try {
                const stats = await peerState.pc.getStats();
                stats.forEach((report) => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        totalRtt += report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
                        peerCount++;
                    }
                    if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                        if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
                            const total = report.packetsReceived + report.packetsLost;
                            if (total > 0) {
                                totalPacketLoss += (report.packetsLost / total) * 100;
                            }
                        }
                        if (report.jitter !== undefined) {
                            totalJitter += report.jitter * 1000;
                        }
                        totalBytesNow += report.bytesReceived || 0;
                    }
                    if (report.type === 'outbound-rtp' && report.kind === 'audio') {
                        totalBytesNow += report.bytesSent || 0;
                    }
                });
            } catch { /* peer may have closed */ }
        }

        if (peerCount === 0) return null;

        const now = Date.now();
        const elapsed = (now - this.lastStatsTimestamp) / 1000;
        const totalBytesPrev = this.lastBytesSent + this.lastBytesReceived;
        const bitrate = elapsed > 0 ? ((totalBytesNow - totalBytesPrev) * 8) / elapsed / 1000 : 0;

        this.lastStatsTimestamp = now;
        this.lastBytesSent = totalBytesNow; // simplified

        return {
            rtt: Math.round(totalRtt / peerCount),
            packetLoss: Math.round((totalPacketLoss / peerCount) * 10) / 10,
            bitrate: Math.round(Math.max(0, bitrate)),
            jitter: Math.round(totalJitter / peerCount),
        };
    }

    private computeQuality(stats: ConnectionStats): ConnectionQualityLevel {
        if (stats.rtt < 100 && stats.packetLoss < 1) return 'excellent';
        if (stats.rtt < 250 && stats.packetLoss < 5) return 'good';
        if (stats.rtt < 500 && stats.packetLoss < 10) return 'fair';
        return 'poor';
    }

    // ═════════════════════════════════════════
    //  Priority Speaker Volume Ducking
    // ═════════════════════════════════════════

    /** When priority speaker starts talking, duck all other audio */
    applyPrioritySpeakerDucking(priorityUserId: string, isSpeaking: boolean): void {
        const settings = useVoiceChannelStore.getState().voiceSettings;
        if (!settings.attenuationEnabled) return;

        if (isSpeaking && !this.isDucking) {
            this.isDucking = true;
            const duckFactor = 1 - (settings.attenuationAmount / 100);
            for (const [userId, audio] of this.audioElements) {
                if (userId !== priorityUserId) {
                    this.originalVolumes.set(userId, audio.volume);
                    audio.volume = audio.volume * duckFactor;
                }
            }
        } else if (!isSpeaking && this.isDucking) {
            this.isDucking = false;
            for (const [userId, audio] of this.audioElements) {
                const orig = this.originalVolumes.get(userId);
                if (orig !== undefined) {
                    audio.volume = orig;
                }
            }
            this.originalVolumes.clear();
        }
    }

    // ═════════════════════════════════════════
    //  Remote video stream subscriptions
    // ═════════════════════════════════════════

    /** Subscribe to remote video stream changes. Returns unsubscribe fn. */
    onRemoteVideoChange(cb: (streams: Map<string, MediaStream[]>) => void): () => void {
        this.videoChangeCallbacks.push(cb);
        // Immediately fire with current state
        cb(new Map(this.remoteVideoStreams));
        return () => {
            this.videoChangeCallbacks = this.videoChangeCallbacks.filter(c => c !== cb);
        };
    }

    private notifyVideoChange(): void {
        const snapshot = new Map(this.remoteVideoStreams);
        this.videoChangeCallbacks.forEach(cb => cb(snapshot));
    }

    getRemoteVideoStreams(): Map<string, MediaStream[]> {
        return new Map(this.remoteVideoStreams);
    }

    // ═════════════════════════════════════════
    //  Peer connection management
    // ═════════════════════════════════════════

    /** Create a peer connection to another user */
    createPeer(userId: string, initiator: boolean): void {
        if (this.peers.has(userId)) {
            this.removePeer(userId);
        }
        if (!this.localStream) {
            console.error('[VCPeerManager] No local stream');
            return;
        }

        console.log(`[VCPeerManager] Creating peer for ${userId}, initiator=${initiator}`);
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const peerState: VCPeerState = { pc, makingOffer: false };

        // Add local audio
        for (const track of this.localStream.getTracks()) {
            pc.addTrack(track, this.localStream);
        }

        // ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketService.voiceIceCandidate(userId, event.candidate.toJSON());
            }
        };

        // ── Handle remote tracks (audio + video) ──
        pc.ontrack = (event) => {
            const stream = event.streams[0] || new MediaStream([event.track]);

            if (event.track.kind === 'audio') {
                this.handleRemoteAudio(userId, stream);
            } else if (event.track.kind === 'video') {
                // Add to remote video streams
                const existing = this.remoteVideoStreams.get(userId) || [];
                // Avoid duplicate streams
                if (!existing.some(s => s.id === stream.id)) {
                    this.remoteVideoStreams.set(userId, [...existing, stream]);
                    this.notifyVideoChange();
                }

                // When track ends, remove it permanently
                event.track.onended = () => {
                    const streams = this.remoteVideoStreams.get(userId) || [];
                    const filtered = streams.filter(s => s.id !== stream.id);
                    if (filtered.length > 0) {
                        this.remoteVideoStreams.set(userId, filtered);
                    } else {
                        this.remoteVideoStreams.delete(userId);
                    }
                    this.notifyVideoChange();
                };

                // When track is muted, temporarily remove from display
                event.track.onmute = () => {
                    const streams = this.remoteVideoStreams.get(userId) || [];
                    const filtered = streams.filter(s => s.id !== stream.id);
                    if (filtered.length > 0) {
                        this.remoteVideoStreams.set(userId, filtered);
                    } else {
                        this.remoteVideoStreams.delete(userId);
                    }
                    this.notifyVideoChange();
                };

                // When track is unmuted, restore it
                event.track.onunmute = () => {
                    const existing = this.remoteVideoStreams.get(userId) || [];
                    if (!existing.some(s => s.id === stream.id)) {
                        this.remoteVideoStreams.set(userId, [...existing, stream]);
                        this.notifyVideoChange();
                    }
                };
            }
        };

        // Negotiation
        pc.onnegotiationneeded = () => {
            if (!peerState.makingOffer) {
                this.createAndSendOffer(userId, peerState);
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`[VCPeerManager] ICE state (${userId}):`, pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                // Clean up remote video for this peer
                this.remoteVideoStreams.delete(userId);
                this.notifyVideoChange();
            }
        };

        if (initiator) {
            this.createAndSendOffer(userId, peerState);
        }

        this.peers.set(userId, peerState);

        // Start connection monitoring if first peer
        if (this.peers.size === 1) {
            this.startConnectionMonitoring();
        }
    }

    private async createAndSendOffer(userId: string, peerState: VCPeerState): Promise<void> {
        const { pc } = peerState;
        try {
            peerState.makingOffer = true;
            const offer = await pc.createOffer();
            if (offer.sdp) offer.sdp = mungeOpusSdp(offer.sdp)!;
            await pc.setLocalDescription(offer);
            if (pc.localDescription) {
                socketService.voiceOffer(userId, {
                    type: pc.localDescription.type,
                    sdp: pc.localDescription.sdp,
                });
            }
        } catch (err) {
            console.error('[VCPeerManager] createOffer error:', err);
        } finally {
            peerState.makingOffer = false;
        }
    }

    async handleOffer(fromUserId: string, offer: RTCSessionDescriptionInit): Promise<void> {
        let peerState = this.peers.get(fromUserId);
        if (!peerState) {
            this.createPeer(fromUserId, false);
            peerState = this.peers.get(fromUserId);
            if (!peerState) return;
        }

        const { pc } = peerState;
        try {
            const offerCollision =
                offer.type === 'offer' &&
                (peerState.makingOffer || pc.signalingState !== 'stable');

            if (offerCollision) {
                await pc.setLocalDescription({ type: 'rollback' });
            }

            const mungedOffer = { ...offer, sdp: mungeOpusSdp(offer.sdp) };
            await pc.setRemoteDescription(new RTCSessionDescription(mungedOffer));

            if (offer.type === 'offer') {
                const answer = await pc.createAnswer();
                if (answer.sdp) answer.sdp = mungeOpusSdp(answer.sdp)!;
                await pc.setLocalDescription(answer);
                if (pc.localDescription) {
                    socketService.voiceAnswer(fromUserId, {
                        type: pc.localDescription.type,
                        sdp: pc.localDescription.sdp,
                    });
                }
            }
        } catch (err) {
            console.error('[VCPeerManager] handleOffer error:', err);
        }
    }

    /** Renegotiate all peer connections (after adding/removing tracks) */
    private renegotiateAll(): void {
        for (const [userId, peerState] of this.peers) {
            if (!peerState.makingOffer) {
                this.createAndSendOffer(userId, peerState);
            }
        }
    }

    async handleAnswer(fromUserId: string, answer: RTCSessionDescriptionInit): Promise<void> {
        const peerState = this.peers.get(fromUserId);
        if (!peerState) return;

        try {
            const mungedAnswer = { ...answer, sdp: mungeOpusSdp(answer.sdp) };
            await peerState.pc.setRemoteDescription(new RTCSessionDescription(mungedAnswer));
        } catch (err) {
            console.error('[VCPeerManager] handleAnswer error:', err);
        }
    }

    async handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
        const peerState = this.peers.get(fromUserId);
        if (!peerState) return;

        try {
            await peerState.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            if (peerState.pc.remoteDescription) {
                console.warn('[VCPeerManager] Failed to add ICE candidate:', err);
            }
        }
    }

    private handleRemoteAudio(userId: string, stream: MediaStream): void {
        this.removeAudioElement(userId);

        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        (audio as any).playsInline = true;
        audio.id = `vc-audio-${userId}`;
        audio.style.position = 'absolute';
        audio.style.left = '-9999px';

        const state = useVoiceChannelStore.getState();
        const userVol = (state as any).userVolumes?.[userId];
        const outputVol = state.voiceSettings.outputVolume ?? 100;
        audio.volume = userVol !== undefined
            ? Math.min(Math.max(userVol / 100, 0), 2)
            : Math.min(outputVol / 100, 1);

        document.body.appendChild(audio);
        this.audioElements.set(userId, audio);

        const playPromise = audio.play();
        if (playPromise) {
            playPromise.catch(() => {
                const resumePlay = () => {
                    audio.play().catch(() => {});
                    document.removeEventListener('click', resumePlay);
                };
                document.addEventListener('click', resumePlay, { once: true });
            });
        }
    }

    // ═════════════════════════════════════════
    //  Screen share track management
    // ═════════════════════════════════════════

    /** Add screen share video track to all peers (separate from camera) */
    addScreenTrack(stream: MediaStream): void {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;
        for (const [userId, peer] of this.peers) {
            try {
                const sender = peer.pc.addTrack(videoTrack, stream);
                this.screenSenders.set(userId, sender);
            } catch (err) {
                console.warn('[VCPeerManager] Failed to add screen track:', err);
            }
        }
        // Explicitly renegotiate so remote peers receive the new track
        this.renegotiateAll();
    }

    /** Remove screen share track from all peers */
    removeScreenTrack(): void {
        for (const [userId, sender] of this.screenSenders) {
            const peer = this.peers.get(userId);
            if (peer) {
                try { peer.pc.removeTrack(sender); } catch {}
            }
        }
        this.screenSenders.clear();
        this.renegotiateAll();
    }

    // ═════════════════════════════════════════
    //  Camera track management
    // ═════════════════════════════════════════

    /** Add camera video track to all peers (separate from screen share) */
    addCameraTrack(stream: MediaStream): void {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;
        for (const [userId, peer] of this.peers) {
            try {
                const sender = peer.pc.addTrack(videoTrack, stream);
                this.cameraSenders.set(userId, sender);
            } catch (err) {
                console.warn('[VCPeerManager] Failed to add camera track:', err);
            }
        }
        this.renegotiateAll();
    }

    /** Remove camera track from all peers */
    removeCameraTrack(): void {
        for (const [userId, sender] of this.cameraSenders) {
            const peer = this.peers.get(userId);
            if (peer) {
                try { peer.pc.removeTrack(sender); } catch {}
            }
        }
        this.cameraSenders.clear();
        this.renegotiateAll();
    }

    // ═════════════════════════════════════════
    //  Legacy compatibility
    // ═════════════════════════════════════════

    /** @deprecated Use addScreenTrack or addCameraTrack instead */
    addVideoTrack(stream: MediaStream): void {
        this.addScreenTrack(stream);
    }

    /** @deprecated Use removeScreenTrack or removeCameraTrack instead */
    removeVideoTracks(): void {
        this.removeScreenTrack();
        this.removeCameraTrack();
    }

    // ═════════════════════════════════════════
    //  Mute / Deafen / Cleanup
    // ═════════════════════════════════════════

    setMuted(muted: boolean): void {
        if (this.localStream) {
            for (const track of this.localStream.getAudioTracks()) {
                track.enabled = !muted;
            }
        }
    }

    setDeafened(deafened: boolean): void {
        for (const [, audio] of this.audioElements) {
            audio.muted = deafened;
        }
    }

    setRemoteAudioMuted(userId: string, muted: boolean): void {
        const audio = this.audioElements.get(userId);
        if (audio) audio.muted = muted;
    }

    /** Set per-user volume (0-200 scale, 100 = normal) */
    setRemoteVolume(userId: string, volume: number): void {
        const audio = this.audioElements.get(userId);
        if (audio) {
            audio.volume = Math.min(Math.max(volume / 100, 0), 2);
        }
    }

    removePeer(userId: string): void {
        const peerState = this.peers.get(userId);
        if (peerState) {
            peerState.audioContext?.close();
            peerState.pc.close();
        }
        this.peers.delete(userId);
        this.removeAudioElement(userId);
        this.screenSenders.delete(userId);
        this.cameraSenders.delete(userId);
        this.remoteVideoStreams.delete(userId);
        this.notifyVideoChange();

        // Stop monitoring if no peers left
        if (this.peers.size === 0) {
            this.stopConnectionMonitoring();
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
        const legacy = document.getElementById(`vc-audio-${userId}`);
        if (legacy) legacy.remove();
    }

    hasPeer(userId: string): boolean {
        return this.peers.has(userId);
    }

    getLocalStream(): MediaStream | null {
        return this.localStream;
    }

    getPeerCount(): number {
        return this.peers.size;
    }

    destroy(): void {
        this.stopVoiceActivityDetection();
        this.stopConnectionMonitoring();

        for (const [userId] of this.peers) {
            this.removePeer(userId);
        }
        this.peers.clear();
        this.audioElements.clear();
        this.screenSenders.clear();
        this.cameraSenders.clear();
        this.remoteVideoStreams.clear();
        this.videoChangeCallbacks = [];
        this.originalVolumes.clear();
        this.isDucking = false;

        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
    }
}

export const voiceChannelPeerManager = new VoiceChannelPeerManager();
