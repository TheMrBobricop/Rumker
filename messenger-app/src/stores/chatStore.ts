import { create } from 'zustand';
import type { Chat, Message } from '@/types';
import { getChats, getMessages, sendMessage as apiSendMessage, editMessage as apiEditMessage, deleteMessage as apiDeleteMessage } from '@/lib/api/chats';
import { useAuthStore } from './authStore';

let tempIdCounter = 0;
function generateTempId() {
    return `__temp_${Date.now()}_${++tempIdCounter}`;
}

interface ChatStore {
    // State
    chats: Chat[];
    activeChat: Chat | null;
    messages: Record<string, Message[]>;
    hasMore: Record<string, boolean>;
    isLoading: boolean;
    isLoadingMessages: boolean;
    isLoadingMore: boolean;
    searchQuery: string;
    typingUsers: Record<string, string[]>; // chatId -> userId[]

    // Actions
    setChats: (chats: Chat[]) => void;
    loadChats: () => Promise<void>;
    setActiveChat: (chat: Chat | null) => void;
    loadMessages: (chatId: string) => Promise<void>;
    loadMoreMessages: (chatId: string) => Promise<void>;
    addMessage: (message: Message) => void;
    sendMessage: (chatId: string, content: string, type?: 'text' | 'image' | 'video' | 'voice' | 'file', fileUrl?: string, replyToId?: string) => Promise<void>;
    updateMessage: (message: Message) => void;
    deleteMessage: (chatId: string, messageId: string) => void;
    editMessageApi: (chatId: string, messageId: string, content: string) => Promise<void>;
    deleteMessageApi: (chatId: string, messageId: string) => Promise<void>;
    toggleReaction: (chatId: string, messageId: string, emoji: string, userId: string) => void;
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

const PAGE_SIZE = 50;

export const useChatStore = create<ChatStore>((set, get) => ({
    // Initial state
    chats: [],
    activeChat: null,
    messages: {},
    hasMore: {},
    isLoading: false,
    isLoadingMessages: false,
    isLoadingMore: false,
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
            const messages = await getMessages(chatId, PAGE_SIZE, 0);
            set((state) => ({
                messages: {
                    ...state.messages,
                    [chatId]: messages,
                },
                hasMore: {
                    ...state.hasMore,
                    [chatId]: messages.length >= PAGE_SIZE,
                },
                isLoadingMessages: false,
            }));
        } catch (error) {
            console.error('Failed to load messages:', error);
            set({ isLoadingMessages: false });
        }
    },

    loadMoreMessages: async (chatId: string) => {
        const state = get();
        if (state.isLoadingMore || !state.hasMore[chatId]) return;

        set({ isLoadingMore: true });
        try {
            const currentMessages = state.messages[chatId] || [];
            const olderMessages = await getMessages(chatId, PAGE_SIZE, currentMessages.length);
            set((s) => ({
                messages: {
                    ...s.messages,
                    [chatId]: [...olderMessages, ...currentMessages],
                },
                hasMore: {
                    ...s.hasMore,
                    [chatId]: olderMessages.length >= PAGE_SIZE,
                },
                isLoadingMore: false,
            }));
        } catch (error) {
            console.error('Failed to load more messages:', error);
            set({ isLoadingMore: false });
        }
    },

    addMessage: (message) =>
        set((state) => {
            const chatMessages = state.messages[message.chatId] || [];
            // Deduplicate: skip if message with same ID already exists
            if (chatMessages.some((m) => m.id === message.id)) {
                return state;
            }
            return {
                messages: {
                    ...state.messages,
                    [message.chatId]: [...chatMessages, message],
                },
            };
        }),

    sendMessage: async (chatId: string, content: string, type?: 'text' | 'image' | 'video' | 'voice' | 'file', fileUrl?: string, replyToId?: string) => {
        const authStore = useAuthStore.getState();
        const currentUser = authStore.user;
        const tempId = generateTempId();

        // Optimistic: add message immediately with 'sending' status
        const optimisticMessage: Message = {
            id: tempId,
            chatId,
            senderId: currentUser?.id || '',
            type: (type || 'text') as Message['type'],
            content: content || '',
            mediaUrl: fileUrl,
            timestamp: new Date(),
            status: 'sending',
            isEdited: false,
            replyTo: replyToId,
            sender: currentUser ? {
                id: currentUser.id,
                username: currentUser.username || '',
                firstName: currentUser.firstName,
                lastName: currentUser.lastName,
            } : undefined,
        };

        // Resolve replyToMessage from existing messages
        const state = get();
        const chatMessages = state.messages[chatId] || [];
        if (replyToId) {
            const replyMsg = chatMessages.find((m) => m.id === replyToId);
            if (replyMsg) {
                optimisticMessage.replyToMessage = {
                    ...replyMsg,
                    senderName: replyMsg.sender?.firstName || replyMsg.sender?.username || 'User',
                } as any;
            }
        }

        set((s) => ({
            messages: {
                ...s.messages,
                [chatId]: [...(s.messages[chatId] || []), optimisticMessage],
            },
        }));

        try {
            const message = await apiSendMessage({ chatId, content, type: type || 'text', fileUrl, replyToId });
            // Replace temp message with real one
            set((s) => {
                const msgs = s.messages[chatId] || [];
                return {
                    messages: {
                        ...s.messages,
                        [chatId]: msgs.map((m) =>
                            m.id === tempId ? { ...message, status: 'sent' as const } : m
                        ),
                    },
                };
            });
        } catch (error) {
            // Mark optimistic message as error
            set((s) => {
                const msgs = s.messages[chatId] || [];
                return {
                    messages: {
                        ...s.messages,
                        [chatId]: msgs.map((m) =>
                            m.id === tempId ? { ...m, status: 'error' as const } : m
                        ),
                    },
                };
            });
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

    editMessageApi: async (chatId: string, messageId: string, content: string) => {
        try {
            const updated = await apiEditMessage(chatId, messageId, content);
            set((state) => {
                const chatMessages = state.messages[chatId] || [];
                return {
                    messages: {
                        ...state.messages,
                        [chatId]: chatMessages.map((m) =>
                            m.id === messageId ? { ...m, content: updated.content, isEdited: true } : m
                        ),
                    },
                };
            });
        } catch (error) {
            console.error('Failed to edit message:', error);
            throw error;
        }
    },

    deleteMessageApi: async (chatId: string, messageId: string) => {
        try {
            await apiDeleteMessage(chatId, messageId);
            set((state) => {
                const chatMessages = state.messages[chatId] || [];
                return {
                    messages: {
                        ...state.messages,
                        [chatId]: chatMessages.filter((m) => m.id !== messageId),
                    },
                };
            });
        } catch (error) {
            console.error('Failed to delete message:', error);
            throw error;
        }
    },

    toggleReaction: (chatId, messageId, emoji, userId) =>
        set((state) => {
            const chatMessages = state.messages[chatId] || [];
            return {
                messages: {
                    ...state.messages,
                    [chatId]: chatMessages.map((m) => {
                        if (m.id !== messageId) return m;
                        const reactions = [...(m.reactions || [])];
                        const existing = reactions.find((r) => r.emoji === emoji);
                        if (existing) {
                            if (existing.userIds.includes(userId)) {
                                existing.userIds = existing.userIds.filter((id) => id !== userId);
                                if (existing.userIds.length === 0) {
                                    return { ...m, reactions: reactions.filter((r) => r.emoji !== emoji) };
                                }
                            } else {
                                existing.userIds = [...existing.userIds, userId];
                            }
                            return { ...m, reactions: [...reactions] };
                        }
                        return { ...m, reactions: [...reactions, { emoji, userIds: [userId] }] };
                    }),
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
