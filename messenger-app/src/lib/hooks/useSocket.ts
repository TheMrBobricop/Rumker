import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { socketService } from '@/lib/socket';

export function useSocket() {
    const token = useAuthStore((s) => s.token);
    const currentUserId = useAuthStore((s) => s.user?.id);
    const {
        addMessage,
        updateMessage,
        deleteMessage,
        addTypingUser,
        removeTypingUser,
        updateChatLastMessage,
        incrementUnread,
        loadChats,
    } = useChatStore();

    const connectedRef = useRef(false);

    useEffect(() => {
        if (!token) {
            socketService.disconnect();
            connectedRef.current = false;
            return;
        }

        if (connectedRef.current) return;

        socketService.connect(token);
        connectedRef.current = true;

        // Wire socket events to store actions
        socketService.onNewMessage((message) => {
            addMessage(message);
            updateChatLastMessage(message.chatId, message);
            // Increment unread if the message is from another user
            if (message.senderId !== currentUserId) {
                incrementUnread(message.chatId);
            }
        });

        socketService.onMessageEdit((message) => {
            updateMessage(message);
        });

        socketService.onMessageDelete((data) => {
            deleteMessage(data.chatId, data.messageId);
        });

        socketService.onTypingStart((data) => {
            if (data.userId !== currentUserId) {
                addTypingUser(data.chatId, data.userId);
                // Auto-remove after 3s
                setTimeout(() => removeTypingUser(data.chatId, data.userId), 3000);
            }
        });

        socketService.onTypingStop((data) => {
            if (data.userId !== currentUserId) {
                removeTypingUser(data.chatId, data.userId);
            }
        });

        socketService.onUserOnline(() => {
            // Refresh chat list to update online status
            loadChats();
        });

        return () => {
            socketService.removeAllListeners();
            socketService.disconnect();
            connectedRef.current = false;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);
}
