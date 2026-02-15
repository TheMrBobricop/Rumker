import { create } from 'zustand';
import type { Chat, Message } from '@/types';
import { getChats, getMessages, sendMessage as apiSendMessage } from '@/lib/api/chats';
import { useAuthStore } from './authStore';

interface ChatStore {
    // State
    chats: Chat[];
    activeChat: Chat | null;
    messages: Record<string, Message[]>;
    isLoading: boolean;
    isLoadingMessages: boolean;
    searchQuery: string;
    typingUsers: Record<string, string[]>; // chatId -> userId[]

    // Actions
    setChats: (chats: Chat[]) => void;
    loadChats: () => Promise<void>;
    setActiveChat: (chat: Chat | null) => void;
    loadMessages: (chatId: string) => Promise<void>;
    addMessage: (message: Message) => void;
    sendMessage: (chatId: string, content: string) => Promise<void>;
    updateMessage: (message: Message) => void;
    deleteMessage: (chatId: string, messageId: string) => void;
    setMessages: (chatId: string, messages: Message[]) => void;
    markAsRead: (chatId: string, messageId: string) => void;
    setSearchQuery: (query: string) => void;
    setLoading: (loading: boolean) => void;
    addTypingUser: (chatId: string, userId: string) => void;
    removeTypingUser: (chatId: string, userId: string) => void;
    updateChatLastMessage: (chatId: string, message: Message) => void;
    incrementUnread: (chatId: string) => void;
    clearUnread: (chatId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
    // Initial state
    chats: [],
    activeChat: null,
    messages: {},
    isLoading: false,
    isLoadingMessages: false,
    searchQuery: '',
    typingUsers: {},

    // Actions
    setChats: (chats) => set({ chats }),

    loadChats: async () => {
        // Check if user is authenticated
        const authStore = useAuthStore.getState();
        const token = authStore.token;
        if (!token) {
            console.log('No token found, skipping chat load');
            return;
        }
        
        set({ isLoading: true });
        try {
            const chats = await getChats();
            set({ chats, isLoading: false });
        } catch (error) {
            console.error('Failed to load chats:', error);
            set({ isLoading: false });
        }
    },

    setActiveChat: (chat) => set({ activeChat: chat }),

    loadMessages: async (chatId: string) => {
        set({ isLoadingMessages: true });
        try {
            const messages = await getMessages(chatId);
            set((state) => ({
                messages: {
                    ...state.messages,
                    [chatId]: messages,
                },
                isLoadingMessages: false,
            }));
        } catch (error) {
            console.error('Failed to load messages:', error);
            set({ isLoadingMessages: false });
        }
    },

    addMessage: (message) =>
        set((state) => {
            const chatMessages = state.messages[message.chatId] || [];
            return {
                messages: {
                    ...state.messages,
                    [message.chatId]: [...chatMessages, message],
                },
            };
        }),

    sendMessage: async (chatId: string, content: string) => {
        try {
            const message = await apiSendMessage({ chatId, content, type: 'text' });
            set((state) => {
                const chatMessages = state.messages[chatId] || [];
                return {
                    messages: {
                        ...state.messages,
                        [chatId]: [...chatMessages, message],
                    },
                };
            });
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    },

    updateMessage: (message) =>
        set((state) => {
            const chatMessages = state.messages[message.chatId] || [];
            return {
                messages: {
                    ...state.messages,
                    [message.chatId]: chatMessages.map((m) =>
                        m.id === message.id ? message : m
                    ),
                },
            };
        }),

    deleteMessage: (chatId, messageId) =>
        set((state) => {
            const chatMessages = state.messages[chatId] || [];
            return {
                messages: {
                    ...state.messages,
                    [chatId]: chatMessages.filter((m) => m.id !== messageId),
                },
            };
        }),

    setMessages: (chatId, messages) =>
        set((state) => ({
            messages: {
                ...state.messages,
                [chatId]: messages,
            },
        })),

    markAsRead: (chatId, messageId) =>
        set((state) => {
            const chatMessages = state.messages[chatId] || [];
            return {
                messages: {
                    ...state.messages,
                    [chatId]: chatMessages.map((m) =>
                        m.id === messageId ? { ...m, status: 'read' as const } : m
                    ),
                },
            };
        }),

    setSearchQuery: (searchQuery) => set({ searchQuery }),

    setLoading: (isLoading) => set({ isLoading }),

    addTypingUser: (chatId, userId) =>
        set((state) => {
            const current = state.typingUsers[chatId] || [];
            if (current.includes(userId)) return state;
            return {
                typingUsers: {
                    ...state.typingUsers,
                    [chatId]: [...current, userId],
                },
            };
        }),

    removeTypingUser: (chatId, userId) =>
        set((state) => {
            const current = state.typingUsers[chatId] || [];
            return {
                typingUsers: {
                    ...state.typingUsers,
                    [chatId]: current.filter((id) => id !== userId),
                },
            };
        }),

    updateChatLastMessage: (chatId, message) =>
        set((state) => ({
            chats: state.chats.map((chat) =>
                chat.id === chatId ? { ...chat, lastMessage: message } : chat
            ),
        })),

    incrementUnread: (chatId) =>
        set((state) => ({
            chats: state.chats.map((chat) =>
                chat.id === chatId
                    ? { ...chat, unreadCount: chat.unreadCount + 1 }
                    : chat
            ),
        })),

    clearUnread: (chatId) =>
        set((state) => ({
            chats: state.chats.map((chat) =>
                chat.id === chatId ? { ...chat, unreadCount: 0 } : chat
            ),
        })),
}));
