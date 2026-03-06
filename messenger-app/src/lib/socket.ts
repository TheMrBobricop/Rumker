import { io, Socket } from 'socket.io-client';
import type { Message } from '@/types';
import { useAuthStore } from '@/stores/authStore';

class SocketService {
    private socket: Socket | null = null;
    private _reconnectCallbacks: Array<() => void> = [];
    private _refreshingToken = false;

    connect(token: string): void {
        // Reuse existing socket if already connected or connecting
        if (this.socket) {
            if (this.socket.connected) return;
            // Socket exists but disconnected — update token and reconnect
            (this.socket.auth as any).token = token;
            this.socket.connect();
            return;
        }

        this.socket = io(window.location.origin, {
            auth: { token },
            transports: ['websocket', 'polling'],
            upgrade: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 15000,
            randomizationFactor: 0.5,
            timeout: 20000,
        });

        this.socket.on('connect', () => {
            console.log('[Socket] Connected, id:', this.socket?.id);
        });

        this.socket.on('disconnect', (reason) => {
            console.warn('[Socket] Disconnected:', reason);
            // Server forced disconnect — try to refresh token and reconnect
            if (reason === 'io server disconnect') {
                this._tryRefreshAndReconnect();
            }
            // For other reasons (transport close, ping timeout), socket.io auto-reconnects
        });

        this.socket.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err.message);
            // Auth errors — try to refresh the JWT
            if (err.message.includes('Invalid token') || err.message.includes('Authentication')) {
                this._tryRefreshAndReconnect();
            }
        });

        this.socket.io.on('reconnect', (attempt) => {
            console.log('[Socket] Reconnected after', attempt, 'attempts');
            this._reconnectCallbacks.forEach((cb) => cb());
        });
    }

    /**
     * When socket can't connect due to expired JWT, refresh the token
     * via the auth API and update socket auth for the next reconnect attempt.
     */
    private async _tryRefreshAndReconnect(): Promise<void> {
        if (this._refreshingToken) return;
        this._refreshingToken = true;

        try {
            const authStore = useAuthStore.getState();

            // Refresh token передаётся только через httpOnly cookie (credentials: 'include')
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });

            if (response.ok) {
                const data = await response.json();
                // Update auth store — this also triggers useSocket to call updateAuth
                authStore.setTokens(data.accessToken);
                // Immediately update socket auth for the next reconnect attempt
                this.updateAuth(data.accessToken);
                console.log('[Socket] Token refreshed for reconnection');
            } else {
                console.warn('[Socket] Token refresh failed:', response.status);
            }
        } catch (err) {
            console.warn('[Socket] Token refresh error:', err);
        } finally {
            this._refreshingToken = false;
        }
    }

    /** Update auth token without disconnecting (used on token refresh) */
    updateAuth(token: string): void {
        if (this.socket) {
            (this.socket.auth as any).token = token;
        }
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    isConnected(): boolean {
        return this.socket?.connected ?? false;
    }

    // --- Room management ---
    joinChat(chatId: string): void {
        this.socket?.emit('chat:join', chatId);
    }

    leaveChat(chatId: string): void {
        this.socket?.emit('chat:leave', chatId);
    }

    // --- Typing ---
    startTyping(chatId: string): void {
        this.socket?.emit('typing:start', { chatId });
    }

    stopTyping(chatId: string): void {
        this.socket?.emit('typing:stop', { chatId });
    }

    // --- Read receipts ---
    markRead(chatId: string, messageId: string): void {
        this.socket?.emit('message:read', { chatId, messageId });
    }

    // --- Message sending ---
    sendMessage(data: {
        chatId: string;
        content: string;
        type?: string;
        mediaUrl?: string;
        replyToId?: string;
        forwardedFromId?: string;
        forwardedFromName?: string;
    }): void {
        this.socket?.emit('message:send', data);
    }

    // --- Event listeners ---
    onNewMessage(callback: (message: Message) => void): void {
        this.socket?.on('message:new', callback);
    }

    onMessageEdit(callback: (message: Message) => void): void {
        this.socket?.on('message:edit', callback);
    }

    onMessageDelete(callback: (data: { messageId: string; chatId: string }) => void): void {
        this.socket?.on('message:delete', callback);
    }

    onMessageRead(callback: (data: { userId: string; chatId: string; messageId: string }) => void): void {
        this.socket?.on('message:read', callback);
    }

    onTypingStart(callback: (data: { userId: string; chatId: string }) => void): void {
        this.socket?.on('typing:start', callback);
    }

    onTypingStop(callback: (data: { userId: string; chatId: string }) => void): void {
        this.socket?.on('typing:stop', callback);
    }

    onUserOnline(callback: (data: { userId: string; isOnline: boolean }) => void): void {
        this.socket?.on('user:online', callback);
    }

    onMessagePin(callback: (data: { chatId: string; message: import('@/types').Message }) => void): void {
        this.socket?.on('message:pin', callback);
    }

    onMessageUnpin(callback: (data: { chatId: string; messageId: string }) => void): void {
        this.socket?.on('message:unpin', callback);
    }

    onMessageUnpinAll(callback: (data: { chatId: string }) => void): void {
        this.socket?.on('message:unpin-all', callback);
    }

    // --- Friend events ---
    onFriendRequest(callback: (data: { userId: string; username: string; firstName?: string; lastName?: string; avatar?: string }) => void): void {
        this.socket?.on('friend:request', callback);
    }

    onFriendAccepted(callback: (data: { userId: string; username: string; firstName?: string; lastName?: string; avatar?: string }) => void): void {
        this.socket?.on('friend:accepted', callback);
    }

    onFriendRejected(callback: (data: { userId: string; username: string; firstName?: string; lastName?: string; avatar?: string }) => void): void {
        this.socket?.on('friend:rejected', callback);
    }

    // --- Call methods ---
    initiateCall(chatId: string, type: 'private' | 'group'): void {
        this.socket?.emit('call:initiate', { chatId, type });
    }

    acceptCall(callId: string): void {
        this.socket?.emit('call:accept', { callId });
    }

    rejectCall(callId: string): void {
        this.socket?.emit('call:reject', { callId });
    }

    joinCall(callId: string): void {
        this.socket?.emit('call:join', { callId });
    }

    leaveCall(callId: string): void {
        this.socket?.emit('call:leave', { callId });
    }

    endCall(callId: string): void {
        this.socket?.emit('call:end', { callId });
    }

    sendSignal(callId: string, targetUserId: string, signal: { type: string; sdp?: { type: RTCSdpType; sdp: string }; candidate?: RTCIceCandidateInit }): void {
        this.socket?.emit('call:signal', { callId, targetUserId, signal });
    }

    toggleCallMute(callId: string, muted: boolean): void {
        this.socket?.emit('call:toggle-mute', { callId, muted });
    }

    deafenCall(callId: string, isDeafened: boolean): void {
        this.socket?.emit('call:toggle-deafen', { callId, isDeafened });
    }

    getActiveCall(chatId: string): Promise<{
        callId: string;
        chatId: string;
        type: string;
        status: string;
        participants: Array<{
            userId: string;
            username: string;
            firstName?: string;
            avatar?: string;
            isMuted: boolean;
            volume: number;
        }>;
        startedAt: string;
        initiatorId: string;
    } | null> {
        return new Promise((resolve) => {
            if (!this.socket) return resolve(null);
            this.socket.emit('call:get-active', { chatId }, (result: any) => {
                resolve(result);
            });
        });
    }

    // --- Call event listeners ---
    onCallIncoming(callback: (data: {
        callId: string;
        chatId: string;
        chatTitle: string;
        callerId: string;
        callerName: string;
        callerAvatar: string;
        type: 'private' | 'group';
    }) => void): void {
        this.socket?.on('call:incoming', callback);
    }

    onCallStarted(callback: (data: {
        callId: string;
        chatId: string;
        chatTitle?: string;
        type: 'private' | 'group';
        initiatorId: string;
        participants?: Array<{
            userId: string;
            username: string;
            firstName?: string;
            avatar?: string;
            isMuted: boolean;
            volume: number;
        }>;
        startedAt: string;
    }) => void): void {
        this.socket?.on('call:started', callback);
    }

    onCallUserJoined(callback: (data: {
        callId: string;
        userId: string;
        username: string;
        firstName?: string;
        avatar?: string;
    }) => void): void {
        this.socket?.on('call:user-joined', callback);
    }

    onCallUserLeft(callback: (data: {
        callId: string;
        userId: string;
    }) => void): void {
        this.socket?.on('call:user-left', callback);
    }

    onCallSignal(callback: (data: {
        callId: string;
        fromUserId: string;
        toUserId: string;
        signal: { type: string; sdp?: string; candidate?: RTCIceCandidate };
    }) => void): void {
        this.socket?.on('call:signal', callback);
    }

    onCallEnded(callback: (data: {
        callId: string;
        reason?: string;
    }) => void): void {
        this.socket?.on('call:ended', callback);
    }

    onCallRejected(callback: (data: {
        callId: string;
        userId: string;
    }) => void): void {
        this.socket?.on('call:rejected', callback);
    }

    onCallMuteChanged(callback: (data: {
        callId: string;
        userId: string;
        muted: boolean;
    }) => void): void {
        this.socket?.on('call:mute-changed', callback);
    }

    onCallDeafenChanged(callback: (data: {
        callId: string;
        userId: string;
        isDeafened: boolean;
    }) => void): void {
        this.socket?.on('call:deafen-changed', callback);
    }

    onCallError(callback: (data: {
        callId?: string;
        message: string;
    }) => void): void {
        this.socket?.on('call:error', callback);
    }

    onCallBusy(callback: (data: { callId: string; chatId: string; targetUserId: string }) => void): void {
        this.socket?.on('call:busy', callback);
    }

    onCallMissed(callback: (data: { callId: string; chatId: string; callerId: string; callerName: string }) => void): void {
        this.socket?.on('call:missed', callback);
    }

    // --- Reconnect ---
    onReconnect(callback: () => void): void {
        this._reconnectCallbacks.push(callback);
    }

    // --- Voice channel methods ---
    voiceJoin(channelId: string): void {
        this.socket?.emit('voice:join', { channelId });
    }

    voiceLeave(channelId: string): void {
        this.socket?.emit('voice:leave', { channelId });
    }

    voiceMute(channelId: string, muted: boolean): void {
        this.socket?.emit('voice:mute', { channelId, muted });
    }

    voiceDeafen(channelId: string, deafened: boolean): void {
        this.socket?.emit('voice:deafen', { channelId, deafened });
    }

    voiceSpeaking(channelId: string, speaking: boolean): void {
        this.socket?.emit('voice:speaking', { channelId, speaking });
    }

    voiceOffer(targetUserId: string, offer: any): void {
        this.socket?.emit('voice:offer', { targetUserId, offer });
    }

    voiceAnswer(targetUserId: string, answer: any): void {
        this.socket?.emit('voice:answer', { targetUserId, answer });
    }

    voiceIceCandidate(targetUserId: string, candidate: any): void {
        this.socket?.emit('voice:ice-candidate', { targetUserId, candidate });
    }

    // --- Voice event listeners ---
    onVoiceUserJoined(callback: (data: { channelId: string; chatId: string; userId: string; username: string; firstName: string; avatar: string }) => void): void {
        this.socket?.on('voice:user:joined', callback);
    }

    onVoiceUserLeft(callback: (data: { channelId: string; chatId: string; userId: string }) => void): void {
        this.socket?.on('voice:user:left', callback);
    }

    onVoiceUserUpdated(callback: (data: { channelId: string; userId: string; isMuted?: boolean; isDeafened?: boolean }) => void): void {
        this.socket?.on('voice:user:updated', callback);
    }

    onVoiceUserSpeaking(callback: (data: { channelId: string; userId: string; isSpeaking: boolean }) => void): void {
        this.socket?.on('voice:user:speaking', callback);
    }

    onVoiceOffer(callback: (data: { fromUserId: string; offer: any }) => void): void {
        this.socket?.on('voice:offer', callback);
    }

    onVoiceAnswer(callback: (data: { fromUserId: string; answer: any }) => void): void {
        this.socket?.on('voice:answer', callback);
    }

    onVoiceIceCandidate(callback: (data: { fromUserId: string; candidate: any }) => void): void {
        this.socket?.on('voice:ice-candidate', callback);
    }

    onVoiceParticipantsSync(callback: (data: { channelId: string; participants: { userId: string; username: string; firstName: string; avatar: string; isMuted: boolean; isDeafened: boolean }[] }) => void): void {
        this.socket?.on('voice:participants:sync', callback);
    }

    // --- Voice channel text chat ---
    voiceChatMessage(channelId: string, content: string): void {
        this.socket?.emit('voice:chat:message', { channelId, content });
    }

    onVoiceChatMessage(callback: (data: { channelId: string; userId: string; username: string; content: string }) => void): void {
        this.socket?.on('voice:chat:message', callback);
    }

    offVoiceChatMessage(callback: (...args: any[]) => void): void {
        this.socket?.off('voice:chat:message', callback);
    }

    // --- Soundboard ---
    soundboardPlay(channelId: string, soundId: string, soundName: string, soundUrl?: string, isDefault?: boolean): void {
        this.socket?.emit('soundboard:play', { channelId, soundId, soundName, soundUrl, isDefault });
    }

    onSoundboardPlayed(callback: (data: { channelId: string; userId: string; username: string; soundId: string; soundName: string; soundUrl?: string; isDefault: boolean }) => void): void {
        this.socket?.on('soundboard:played', callback);
    }

    // --- Screen share tracking ---
    voiceScreenStart(channelId: string): void {
        this.socket?.emit('voice:screen:start', { channelId });
    }

    voiceScreenStop(channelId: string): void {
        this.socket?.emit('voice:screen:stop', { channelId });
    }

    onVoiceScreenStarted(callback: (data: { channelId: string; userId: string; username: string }) => void): void {
        this.socket?.on('voice:screen:started', callback);
    }

    onVoiceScreenStopped(callback: (data: { channelId: string; userId: string }) => void): void {
        this.socket?.on('voice:screen:stopped', callback);
    }

    // --- Voice admin actions ---
    voiceAdminMute(channelId: string, targetUserId: string, muted: boolean): void {
        this.socket?.emit('voice:admin:mute', { channelId, targetUserId, muted });
    }

    voiceAdminDeafen(channelId: string, targetUserId: string, deafened: boolean): void {
        this.socket?.emit('voice:admin:deafen', { channelId, targetUserId, deafened });
    }

    voiceAdminDisconnect(channelId: string, targetUserId: string): void {
        this.socket?.emit('voice:admin:disconnect', { channelId, targetUserId });
    }

    voiceAdminMove(channelId: string, targetUserId: string, targetChannelId: string): void {
        this.socket?.emit('voice:admin:move', { channelId, targetUserId, targetChannelId });
    }

    voiceAdminPrioritySpeaker(channelId: string, targetUserId: string | null): void {
        this.socket?.emit('voice:admin:priority-speaker', { channelId, targetUserId });
    }

    onVoiceAdminServerMuted(callback: (data: { channelId: string; muted: boolean; mutedBy: string }) => void): void {
        this.socket?.on('voice:admin:server-muted', callback);
    }

    onVoiceAdminServerDeafened(callback: (data: { channelId: string; deafened: boolean }) => void): void {
        this.socket?.on('voice:admin:server-deafened', callback);
    }

    onVoiceAdminDisconnected(callback: (data: { channelId: string }) => void): void {
        this.socket?.on('voice:admin:disconnected', callback);
    }

    onVoiceAdminMoved(callback: (data: { fromChannelId: string; toChannelId: string }) => void): void {
        this.socket?.on('voice:admin:moved', callback);
    }

    onVoicePrioritySpeaker(callback: (data: { channelId: string; userId: string | null }) => void): void {
        this.socket?.on('voice:priority-speaker', callback);
    }

    // --- Reaction event listeners ---
    onMessageReaction(callback: (data: { messageId: string; chatId: string; emoji: string; userId: string; action: 'add' | 'remove' }) => void): void {
        this.socket?.on('message:reaction', callback);
    }

    // --- Poll event listeners ---
    onPollUpdate(callback: (data: { chatId: string; pollId: string; pollData: any }) => void): void {
        this.socket?.on('poll:update', callback);
    }

    // Generic event emitter
    emit(event: string, data?: any): void {
        this.socket?.emit(event, data);
    }

    // Generic event listener
    on(event: string, callback: (...args: any[]) => void): void {
        this.socket?.on(event, callback);
    }

    // Generic event unsubscribe
    off(event: string, callback: (...args: any[]) => void): void {
        this.socket?.off(event, callback);
    }

    // Remove all listeners (useful for cleanup)
    removeAllListeners(): void {
        this._reconnectCallbacks = [];
        this.socket?.removeAllListeners('message:new');
        this.socket?.removeAllListeners('message:edit');
        this.socket?.removeAllListeners('message:delete');
        this.socket?.removeAllListeners('message:read');
        this.socket?.removeAllListeners('typing:start');
        this.socket?.removeAllListeners('typing:stop');
        this.socket?.removeAllListeners('user:online');
        this.socket?.removeAllListeners('message:pin');
        this.socket?.removeAllListeners('message:unpin');
        this.socket?.removeAllListeners('message:unpin-all');
        this.socket?.removeAllListeners('friend:request');
        this.socket?.removeAllListeners('friend:accepted');
        this.socket?.removeAllListeners('friend:rejected');
        this.socket?.removeAllListeners('call:incoming');
        this.socket?.removeAllListeners('call:started');
        this.socket?.removeAllListeners('call:user-joined');
        this.socket?.removeAllListeners('call:user-left');
        this.socket?.removeAllListeners('call:signal');
        this.socket?.removeAllListeners('call:ended');
        this.socket?.removeAllListeners('call:rejected');
        this.socket?.removeAllListeners('call:mute-changed');
        this.socket?.removeAllListeners('call:deafen-changed');
        this.socket?.removeAllListeners('call:error');
        this.socket?.removeAllListeners('call:busy');
        this.socket?.removeAllListeners('call:missed');
        this.socket?.removeAllListeners('voice:user:joined');
        this.socket?.removeAllListeners('voice:user:left');
        this.socket?.removeAllListeners('voice:user:updated');
        this.socket?.removeAllListeners('voice:user:speaking');
        this.socket?.removeAllListeners('voice:offer');
        this.socket?.removeAllListeners('voice:answer');
        this.socket?.removeAllListeners('voice:ice-candidate');
        this.socket?.removeAllListeners('voice:participants:sync');
        this.socket?.removeAllListeners('poll:update');
        this.socket?.removeAllListeners('message:reaction');
        this.socket?.removeAllListeners('voice:chat:message');
        this.socket?.removeAllListeners('soundboard:played');
        this.socket?.removeAllListeners('voice:screen:started');
        this.socket?.removeAllListeners('voice:screen:stopped');
        this.socket?.removeAllListeners('voice:admin:server-muted');
        this.socket?.removeAllListeners('voice:admin:server-deafened');
        this.socket?.removeAllListeners('voice:admin:disconnected');
        this.socket?.removeAllListeners('voice:admin:moved');
        this.socket?.removeAllListeners('voice:priority-speaker');
        this.socket?.removeAllListeners('member:role-changed');
        this.socket?.removeAllListeners('member:title-changed');
        this.socket?.removeAllListeners('member:removed');
        this.socket?.removeAllListeners('chat:updated');
    }

    // ---- Admin events ----

    onMemberRoleChanged(callback: (data: {
        chatId: string; userId: string; role: string;
        title?: string; adminRights?: any; changedBy: string;
    }) => void): void {
        this.socket?.on('member:role-changed', callback);
    }

    onMemberTitleChanged(callback: (data: {
        chatId: string; userId: string; title: string | null;
    }) => void): void {
        this.socket?.on('member:title-changed', callback);
    }

    onMemberRemoved(callback: (data: {
        chatId: string; userId: string; reason: 'kicked' | 'banned'; removedBy: string;
    }) => void): void {
        this.socket?.on('member:removed', callback);
    }

    onChatUpdated(callback: (data: {
        chatId: string; name: string; description: string | null;
        avatar: string | null; updatedBy: string;
    }) => void): void {
        this.socket?.on('chat:updated', callback);
    }
}

export const socketService = new SocketService();
