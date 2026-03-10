import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chat, Message, ReadReceipt } from '@/types';
import { getChats, getMessages, sendMessage as apiSendMessage, editMessage as apiEditMessage, deleteMessage as apiDeleteMessage, pinChat as apiPinChat, unpinChat as apiUnpinChat, muteChat as apiMuteChat, unmuteChat as apiUnmuteChat, clearChat as apiClearChat, deleteChat as apiDeleteChat, toggleReaction as apiToggleReaction, getPinnedMessages } from '@/lib/api/chats';
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
    pinnedMessages: Record<string, Message[]>; // chatId -> Message[]
    lastReadMessageId: Record<string, string>; // chatId -> messageId
    readReceipts: Record<string, ReadReceipt[]>; // chatId -> receipts from other users

    // Actions
    setChats: (chats: Chat[]) => void;
    loadChats: () => Promise<void>;
    setActiveChat: (chat: Chat | null) => void;
    loadMessages: (chatId: string) => Promise<void>;
    loadMoreMessages: (chatId: string) => Promise<void>;
    addMessage: (message: Message) => void;
    sendMessage: (chatId: string, content: string, type?: 'text' | 'image' | 'video' | 'voice' | 'file' | 'location' | 'contact', mediaUrl?: string, replyToId?: string, forwardedFrom?: { id?: string; name: string }, metadata?: Record<string, unknown>) => Promise<void>;
    updateMessage: (message: Message) => void;
    deleteMessage: (chatId: string, messageId: string) => void;
    editMessageApi: (chatId: string, messageId: string, content: string) => Promise<void>;
    deleteMessageApi: (chatId: string, messageId: string) => Promise<void>;
    toggleReaction: (chatId: string, messageId: string, emoji: string, userId: string) => Promise<void>;
    setMessages: (chatId: string, messages: Message[]) => void;
    markAsRead: (chatId: string, messageId: string) => void;
    updateReadReceipt: (chatId: string, userId: string, messageId: string) => void;
    setReadReceipts: (chatId: string, receipts: ReadReceipt[]) => void;
    setSearchQuery: (query: string) => void;
    setLoading: (loading: boolean) => void;
    addTypingUser: (chatId: string, userId: string) => void;
    removeTypingUser: (chatId: string, userId: string) => void;
    updateChatLastMessage: (chatId: string, message: Message) => void;
    incrementUnread: (chatId: string) => void;
    clearUnread: (chatId: string) => void;
    addPinnedMessage: (chatId: string, message: Message) => void;
    removePinnedMessage: (chatId: string, messageId: string) => void;
    setPinnedMessages: (chatId: string, messages: Message[]) => void;
    loadPinnedMessages: (chatId: string) => Promise<void>;
    clearPinnedMessages: (chatId: string) => void;
    togglePinChat: (chatId: string) => Promise<void>;
    toggleMuteChat: (chatId: string) => Promise<void>;
    clearChatMessages: (chatId: string) => Promise<void>;
    deleteChatAction: (chatId: string) => Promise<void>;
    removeChat: (chatId: string) => void;
    updateUserOnlineStatus: (userId: string, isOnline: boolean) => void;
    // Admin management
    updateParticipantRole: (chatId: string, userId: string, role: string, title?: string, adminRights?: any) => void;
    updateParticipantTitle: (chatId: string, userId: string, title: string | null) => void;
    removeParticipant: (chatId: string, userId: string) => void;
    // Chat info
    updateChatInfo: (chatId: string, updates: { title?: string; description?: string | null; avatar?: string | null }) => void;
    reset: () => void;
}

const PAGE_SIZE = 50;

export const useChatStore = create<ChatStore>()(persist((set, get) => ({
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
    pinnedMessages: {},
    lastReadMessageId: {},
    readReceipts: {},

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
            const freshChats = await getChats();
            // Safety: never replace existing chats with empty if user had chats before
            // (protects against partial backend failures returning [])
            const currentChats = get().chats;
            if (freshChats.length === 0 && currentChats.length > 0) {
                console.warn('[ChatStore] API returned 0 chats but user had', currentChats.length, '— keeping existing');
                set({ isLoading: false });
                return;
            }
            set({ chats: freshChats, isLoading: false });
        } catch (error) {
            console.error('Failed to load chats:', error);
            set({ isLoading: false });
        }
    },

    setActiveChat: (chat) => set({ activeChat: chat }),

    loadMessages: async (chatId: string) => {
        console.log('[ChatStore] Loading messages for chat:', chatId);
        set({ isLoadingMessages: true });
        try {
            const fetched = await getMessages(chatId, PAGE_SIZE, 0);
            console.log('[ChatStore] Loaded messages:', fetched.length, 'for chat:', chatId);
            set((state) => {
                const existing = state.messages[chatId] || [];
                // Keep temp messages (still waiting for REST response from sendMessage)
                const tempMessages = existing.filter((m) => m.id.startsWith('__temp_'));
                // Keep non-temp messages that arrived via socket during fetch
                const socketOnly = existing.filter(
                    (m) => !m.id.startsWith('__temp_') && !fetched.some((f) => f.id === m.id)
                );
                // Merge: fetched + socketOnly + temps, dedup, sort
                const merged = [...fetched, ...socketOnly, ...tempMessages];
                merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                return {
                    messages: {
                        ...state.messages,
                        [chatId]: merged,
                    },
                    hasMore: {
                        ...state.hasMore,
                        [chatId]: fetched.length >= PAGE_SIZE,
                    },
                    isLoadingMessages: false,
                };
            });
        } catch (error) {
            console.error('[ChatStore] Failed to load messages:', error);
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

    sendMessage: async (chatId: string, content: string, type?: 'text' | 'image' | 'video' | 'voice' | 'file' | 'location' | 'contact', fileUrl?: string, replyToId?: string, forwardedFrom?: { id?: string; name: string }, metadata?: Record<string, unknown>) => {
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
            forwardedFrom: forwardedFrom ? { id: forwardedFrom.id, name: forwardedFrom.name } : undefined,
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
                    id: replyMsg.id,
                    chatId: replyMsg.chatId,
                    senderId: replyMsg.senderId,
                    type: 'text' as const,
                    content: replyMsg.content,
                    timestamp: replyMsg.timestamp,
                    status: replyMsg.status,
                    isEdited: replyMsg.isEdited,
                    replyTo: replyMsg.replyTo,
                };
            }
        }

        set((s) => ({
            messages: {
                ...s.messages,
                [chatId]: [...(s.messages[chatId] || []), optimisticMessage],
            },
        }));

        try {
            // Send message via REST API — saves to DB and emits socket event
            const realMessage = await apiSendMessage({
                chatId,
                content,
                type: type || 'text',
                fileUrl,
                replyToId,
                forwardedFromId: forwardedFrom?.id,
                forwardedFromName: forwardedFrom?.name,
                metadata,
            });

            // Replace temp message with real one (handles all race conditions atomically).
            const realWithStatus = { ...realMessage, status: 'sent' as const };
            set((s) => {
                const msgs = s.messages[chatId] || [];
                const hasTemp = msgs.some((m) => m.id === tempId);
                const hasReal = msgs.some((m) => m.id === realMessage.id);

                let updatedMsgs: typeof msgs;
                if (hasTemp && hasReal) {
                    // Both exist (socket added real while temp still present) — remove temp, update real
                    updatedMsgs = msgs
                        .filter((m) => m.id !== tempId)
                        .map((m) => m.id === realMessage.id ? realWithStatus : m);
                } else if (hasTemp) {
                    // Normal case — replace temp with real
                    updatedMsgs = msgs.map((m) => m.id === tempId ? realWithStatus : m);
                } else if (hasReal) {
                    // Temp removed (e.g. by loadMessages), socket added real — just update status
                    updatedMsgs = msgs.map((m) => m.id === realMessage.id ? realWithStatus : m);
                } else {
                    // Neither exists — add real message
                    updatedMsgs = [...msgs, realWithStatus];
                }

                return {
                    messages: { ...s.messages, [chatId]: updatedMsgs },
                    chats: s.chats.map((chat) =>
                        chat.id === chatId ? { ...chat, lastMessage: realWithStatus } : chat
                    ),
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
            const pinnedChatMessages = state.pinnedMessages[chatId] || [];
            return {
                messages: {
                    ...state.messages,
                    [chatId]: chatMessages.filter((m) => m.id !== messageId),
                },
                // Auto-remove from pinned list if deleted
                pinnedMessages: {
                    ...state.pinnedMessages,
                    [chatId]: pinnedChatMessages.filter((m) => m.id !== messageId),
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

    toggleReaction: async (chatId, messageId, emoji, userId) => {
        // Optimistic update
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
        });
        try {
            await apiToggleReaction(chatId, messageId, emoji);
        } catch (error) {
            // Revert on error: toggle back
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
            });
            console.error('Failed to toggle reaction:', error);
        }
    },

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
            const readMsg = chatMessages.find(m => m.id === messageId);
            const readTimestamp = readMsg ? new Date(readMsg.timestamp).getTime() : 0;
            return {
                messages: {
                    ...state.messages,
                    [chatId]: chatMessages.map((m) => {
                        // Mark all messages with status 'sent' up to readMsg timestamp as 'read'
                        if (m.status === 'sent' && readTimestamp && new Date(m.timestamp).getTime() <= readTimestamp) {
                            return { ...m, status: 'read' as const };
                        }
                        return m.id === messageId ? { ...m, status: 'read' as const } : m;
                    }),
                },
                lastReadMessageId: {
                    ...state.lastReadMessageId,
                    [chatId]: messageId,
                },
            };
        }),

    updateReadReceipt: (chatId, userId, messageId) =>
        set((state) => {
            const existing = state.readReceipts[chatId] || [];
            const idx = existing.findIndex(r => r.userId === userId);
            const receipt: ReadReceipt = {
                userId,
                lastReadMessageId: messageId,
                readAt: new Date().toISOString(),
                user: existing[idx]?.user,
            };
            const updated = idx >= 0
                ? existing.map((r, i) => i === idx ? receipt : r)
                : [...existing, receipt];
            return {
                readReceipts: { ...state.readReceipts, [chatId]: updated },
            };
        }),

    setReadReceipts: (chatId, receipts) =>
        set((state) => ({
            readReceipts: { ...state.readReceipts, [chatId]: receipts },
        })),

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

    addPinnedMessage: (chatId, message) =>
        set((state) => {
            const current = state.pinnedMessages[chatId] || [];
            if (current.some(m => m.id === message.id)) return state;
            return {
                pinnedMessages: {
                    ...state.pinnedMessages,
                    [chatId]: [...current, message],
                },
            };
        }),

    removePinnedMessage: (chatId, messageId) =>
        set((state) => ({
            pinnedMessages: {
                ...state.pinnedMessages,
                [chatId]: (state.pinnedMessages[chatId] || []).filter(m => m.id !== messageId),
            },
        })),

    setPinnedMessages: (chatId, messages) =>
        set((state) => ({
            pinnedMessages: {
                ...state.pinnedMessages,
                [chatId]: messages,
            },
        })),

    loadPinnedMessages: async (chatId: string) => {
        try {
            const messages = await getPinnedMessages(chatId);
            set((state) => ({
                pinnedMessages: {
                    ...state.pinnedMessages,
                    [chatId]: messages,
                },
            }));
        } catch {
            set((state) => ({
                pinnedMessages: {
                    ...state.pinnedMessages,
                    [chatId]: [],
                },
            }));
        }
    },

    clearPinnedMessages: (chatId) =>
        set((state) => ({
            pinnedMessages: {
                ...state.pinnedMessages,
                [chatId]: [],
            },
        })),

    togglePinChat: async (chatId: string) => {
        const state = get();
        const chat = state.chats.find(c => c.id === chatId);
        if (!chat) return;
        const isPinned = chat.isPinned;
        // Optimistic update
        set((s) => ({
            chats: s.chats.map(c => c.id === chatId ? { ...c, isPinned: !isPinned } : c),
        }));
        try {
            if (isPinned) {
                await apiUnpinChat(chatId);
            } else {
                await apiPinChat(chatId);
            }
        } catch {
            // Revert
            set((s) => ({
                chats: s.chats.map(c => c.id === chatId ? { ...c, isPinned } : c),
            }));
        }
    },

    toggleMuteChat: async (chatId: string) => {
        const state = get();
        const chat = state.chats.find(c => c.id === chatId);
        if (!chat) return;
        const isMuted = chat.isMuted;
        // Optimistic update
        set((s) => ({
            chats: s.chats.map(c => c.id === chatId ? { ...c, isMuted: !isMuted } : c),
        }));
        try {
            if (isMuted) {
                await apiUnmuteChat(chatId);
            } else {
                await apiMuteChat(chatId);
            }
        } catch {
            // Revert
            set((s) => ({
                chats: s.chats.map(c => c.id === chatId ? { ...c, isMuted } : c),
            }));
        }
    },

    clearChatMessages: async (chatId: string) => {
        try {
            await apiClearChat(chatId);
            set((s) => ({
                messages: { ...s.messages, [chatId]: [] },
                chats: s.chats.map(c => c.id === chatId ? { ...c, lastMessage: undefined } : c),
            }));
        } catch (error) {
            console.error('Failed to clear chat:', error);
            throw error;
        }
    },

    deleteChatAction: async (chatId: string) => {
        try {
            await apiDeleteChat(chatId);
            set((s) => ({
                chats: s.chats.filter(c => c.id !== chatId),
                activeChat: s.activeChat?.id === chatId ? null : s.activeChat,
                messages: (() => {
                    const msgs = { ...s.messages };
                    delete msgs[chatId];
                    return msgs;
                })(),
            }));
        } catch (error) {
            console.error('Failed to delete chat:', error);
            throw error;
        }
    },

    removeChat: (chatId: string) =>
        set((state) => ({
            chats: state.chats.filter(c => c.id !== chatId),
            activeChat: state.activeChat?.id === chatId ? null : state.activeChat,
        })),

    updateUserOnlineStatus: (userId: string, isOnline: boolean) =>
        set((state) => ({
            chats: state.chats.map((chat) => ({
                ...chat,
                participants: chat.participants.map((p) =>
                    p.userId === userId
                        ? { ...p, user: { ...p.user, isOnline, lastSeen: isOnline ? undefined : new Date() } }
                        : p
                ),
            })),
        })),

    // ---- Admin management ----

    updateParticipantRole: (chatId, userId, role, title, adminRights) =>
        set((state) => ({
            chats: state.chats.map((chat) =>
                chat.id === chatId
                    ? {
                        ...chat,
                        participants: chat.participants.map((p) =>
                            p.userId === userId
                                ? { ...p, role: role as any, title: title || undefined, adminRights }
                                : p
                        ),
                    }
                    : chat
            ),
        })),

    updateParticipantTitle: (chatId, userId, title) =>
        set((state) => ({
            chats: state.chats.map((chat) =>
                chat.id === chatId
                    ? {
                        ...chat,
                        participants: chat.participants.map((p) =>
                            p.userId === userId
                                ? { ...p, title: title || undefined }
                                : p
                        ),
                    }
                    : chat
            ),
        })),

    removeParticipant: (chatId, userId) =>
        set((state) => ({
            chats: state.chats.map((chat) =>
                chat.id === chatId
                    ? {
                        ...chat,
                        participants: chat.participants.filter((p) => p.userId !== userId),
                    }
                    : chat
            ),
        })),

    updateChatInfo: (chatId, updates) =>
        set((state) => {
            const applyUpdates = (chat: any) => ({
                ...chat,
                ...(updates.title !== undefined && { title: updates.title }),
                ...(updates.description !== undefined && { description: updates.description }),
                ...(updates.avatar !== undefined && { avatar: updates.avatar }),
            });
            return {
                chats: state.chats.map((chat) =>
                    chat.id === chatId ? applyUpdates(chat) : chat
                ),
                activeChat: state.activeChat?.id === chatId
                    ? applyUpdates(state.activeChat)
                    : state.activeChat,
            };
        }),

    reset: () => set({
        chats: [],
        activeChat: null,
        messages: {},
        hasMore: {},
        isLoading: false,
        isLoadingMessages: false,
        isLoadingMore: false,
        searchQuery: '',
        typingUsers: {},
        pinnedMessages: {},
        lastReadMessageId: {},
        readReceipts: {},
    }),
}), {
    name: 'chat-storage',
    partialize: (state) => ({
        chats: state.chats,
        lastReadMessageId: state.lastReadMessageId,
    }),
}));
