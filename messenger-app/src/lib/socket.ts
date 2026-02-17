import { io, Socket } from 'socket.io-client';
import type { Message } from '@/types';

class SocketService {
    private socket: Socket | null = null;

    connect(token: string): void {
        if (this.socket?.connected) return;

        this.socket = io(window.location.origin, {
            auth: { token },
            transports: ['websocket', 'polling'],
        });

        this.socket.on('connect', () => {
            console.log('[Socket] Connected');
        });

        this.socket.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err.message);
        });
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

    // Remove all listeners (useful for cleanup)
    removeAllListeners(): void {
        this.socket?.removeAllListeners('message:new');
        this.socket?.removeAllListeners('message:edit');
        this.socket?.removeAllListeners('message:delete');
        this.socket?.removeAllListeners('message:read');
        this.socket?.removeAllListeners('typing:start');
        this.socket?.removeAllListeners('typing:stop');
        this.socket?.removeAllListeners('user:online');
    }
}

export const socketService = new SocketService();
