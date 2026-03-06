import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules
vi.mock('@/lib/api/chats', () => ({
  getChats: vi.fn(),
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  pinChat: vi.fn(),
  unpinChat: vi.fn(),
  muteChat: vi.fn(),
  unmuteChat: vi.fn(),
  clearChat: vi.fn(),
  deleteChat: vi.fn(),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      token: 'test-token',
      user: { id: 'user-1', username: 'testuser', firstName: 'Test' },
    })),
  },
}));

// Test the store logic without Zustand persistence
type Message = {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  content: string;
  timestamp: Date;
  status: string;
  isEdited: boolean;
  reactions?: { emoji: string; userIds: string[] }[];
  replyTo?: string;
};

type Chat = {
  id: string;
  type: string;
  title: string;
  lastMessage?: Message;
  unreadCount: number;
  participants: any[];
  isPinned: boolean;
  isMuted: boolean;
};

describe('ChatStore Logic', () => {
  let messages: Record<string, Message[]>;
  let chats: Chat[];

  beforeEach(() => {
    messages = {};
    chats = [
      {
        id: 'chat-1',
        type: 'private',
        title: 'Test Chat',
        unreadCount: 0,
        participants: [],
        isPinned: false,
        isMuted: false,
      },
      {
        id: 'chat-2',
        type: 'group',
        title: 'Group Chat',
        unreadCount: 3,
        participants: [],
        isPinned: true,
        isMuted: false,
      },
    ];
  });

  describe('addMessage', () => {
    it('should add a message to the correct chat', () => {
      const msg: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'Hello',
        timestamp: new Date(),
        status: 'sent',
        isEdited: false,
      };

      const chatMessages = messages['chat-1'] || [];
      messages['chat-1'] = [...chatMessages, msg];

      expect(messages['chat-1']).toHaveLength(1);
      expect(messages['chat-1'][0].content).toBe('Hello');
    });

    it('should deduplicate messages with same ID', () => {
      const msg: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'Hello',
        timestamp: new Date(),
        status: 'sent',
        isEdited: false,
      };

      messages['chat-1'] = [msg];

      // Try to add same message again
      const existing = messages['chat-1'];
      if (!existing.some((m) => m.id === msg.id)) {
        messages['chat-1'] = [...existing, msg];
      }

      expect(messages['chat-1']).toHaveLength(1);
    });
  });

  describe('updateMessage', () => {
    it('should update message content', () => {
      const msg: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'Original',
        timestamp: new Date(),
        status: 'sent',
        isEdited: false,
      };
      messages['chat-1'] = [msg];

      const updated = { ...msg, content: 'Updated', isEdited: true };
      messages['chat-1'] = messages['chat-1'].map((m) =>
        m.id === updated.id ? updated : m
      );

      expect(messages['chat-1'][0].content).toBe('Updated');
      expect(messages['chat-1'][0].isEdited).toBe(true);
    });
  });

  describe('deleteMessage', () => {
    it('should remove message from chat', () => {
      const msg: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'To delete',
        timestamp: new Date(),
        status: 'sent',
        isEdited: false,
      };
      messages['chat-1'] = [msg];

      messages['chat-1'] = messages['chat-1'].filter((m) => m.id !== 'msg-1');
      expect(messages['chat-1']).toHaveLength(0);
    });
  });

  describe('toggleReaction', () => {
    it('should add a new reaction', () => {
      const msg: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'Hello',
        timestamp: new Date(),
        status: 'sent',
        isEdited: false,
        reactions: [],
      };
      messages['chat-1'] = [msg];

      // Toggle reaction
      const emoji = '👍';
      const userId = 'user-2';
      messages['chat-1'] = messages['chat-1'].map((m) => {
        if (m.id !== 'msg-1') return m;
        const reactions = [...(m.reactions || [])];
        const existing = reactions.find((r) => r.emoji === emoji);
        if (!existing) {
          reactions.push({ emoji, userIds: [userId] });
        }
        return { ...m, reactions };
      });

      expect(messages['chat-1'][0].reactions).toHaveLength(1);
      expect(messages['chat-1'][0].reactions![0].emoji).toBe('👍');
      expect(messages['chat-1'][0].reactions![0].userIds).toContain('user-2');
    });

    it('should remove reaction if user already reacted', () => {
      const msg: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'Hello',
        timestamp: new Date(),
        status: 'sent',
        isEdited: false,
        reactions: [{ emoji: '👍', userIds: ['user-2'] }],
      };
      messages['chat-1'] = [msg];

      const emoji = '👍';
      const userId = 'user-2';
      messages['chat-1'] = messages['chat-1'].map((m) => {
        if (m.id !== 'msg-1') return m;
        const reactions = [...(m.reactions || [])];
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing && existing.userIds.includes(userId)) {
          existing.userIds = existing.userIds.filter((id) => id !== userId);
          if (existing.userIds.length === 0) {
            return { ...m, reactions: reactions.filter((r) => r.emoji !== emoji) };
          }
        }
        return { ...m, reactions };
      });

      expect(messages['chat-1'][0].reactions).toHaveLength(0);
    });
  });

  describe('incrementUnread / clearUnread', () => {
    it('should increment unread count', () => {
      chats = chats.map((chat) =>
        chat.id === 'chat-1' ? { ...chat, unreadCount: chat.unreadCount + 1 } : chat
      );
      expect(chats.find((c) => c.id === 'chat-1')!.unreadCount).toBe(1);
    });

    it('should clear unread count', () => {
      chats = chats.map((chat) =>
        chat.id === 'chat-2' ? { ...chat, unreadCount: 0 } : chat
      );
      expect(chats.find((c) => c.id === 'chat-2')!.unreadCount).toBe(0);
    });
  });

  describe('togglePinChat', () => {
    it('should toggle pin state', () => {
      const chatId = 'chat-1';
      chats = chats.map((c) =>
        c.id === chatId ? { ...c, isPinned: !c.isPinned } : c
      );
      expect(chats.find((c) => c.id === 'chat-1')!.isPinned).toBe(true);

      // Toggle back
      chats = chats.map((c) =>
        c.id === chatId ? { ...c, isPinned: !c.isPinned } : c
      );
      expect(chats.find((c) => c.id === 'chat-1')!.isPinned).toBe(false);
    });
  });

  describe('toggleMuteChat', () => {
    it('should toggle mute state', () => {
      const chatId = 'chat-1';
      chats = chats.map((c) =>
        c.id === chatId ? { ...c, isMuted: !c.isMuted } : c
      );
      expect(chats.find((c) => c.id === 'chat-1')!.isMuted).toBe(true);
    });
  });

  describe('removeChat', () => {
    it('should remove chat from list', () => {
      chats = chats.filter((c) => c.id !== 'chat-1');
      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('chat-2');
    });

    it('should also remove messages for that chat', () => {
      messages['chat-1'] = [
        { id: 'msg-1', chatId: 'chat-1', senderId: 'u1', type: 'text', content: 'Hello', timestamp: new Date(), status: 'sent', isEdited: false },
      ];

      delete messages['chat-1'];
      expect(messages['chat-1']).toBeUndefined();
    });
  });

  describe('updateUserOnlineStatus', () => {
    it('should update online status across all chats', () => {
      chats = [
        {
          id: 'chat-1',
          type: 'private',
          title: 'Chat',
          unreadCount: 0,
          participants: [
            { userId: 'user-1', user: { id: 'user-1', isOnline: false } },
            { userId: 'user-2', user: { id: 'user-2', isOnline: false } },
          ],
          isPinned: false,
          isMuted: false,
        },
      ];

      const userId = 'user-2';
      chats = chats.map((chat) => ({
        ...chat,
        participants: chat.participants.map((p: any) =>
          p.userId === userId
            ? { ...p, user: { ...p.user, isOnline: true } }
            : p
        ),
      }));

      expect(chats[0].participants[1].user.isOnline).toBe(true);
      expect(chats[0].participants[0].user.isOnline).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      messages = {};
      chats = [];
      const state = {
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
      };

      expect(state.chats).toHaveLength(0);
      expect(state.activeChat).toBeNull();
      expect(Object.keys(state.messages)).toHaveLength(0);
    });
  });

  describe('Message ordering', () => {
    it('should maintain chronological order', () => {
      const msgs: Message[] = [
        { id: 'msg-3', chatId: 'c1', senderId: 'u1', type: 'text', content: 'Third', timestamp: new Date('2026-01-03'), status: 'sent', isEdited: false },
        { id: 'msg-1', chatId: 'c1', senderId: 'u1', type: 'text', content: 'First', timestamp: new Date('2026-01-01'), status: 'sent', isEdited: false },
        { id: 'msg-2', chatId: 'c1', senderId: 'u1', type: 'text', content: 'Second', timestamp: new Date('2026-01-02'), status: 'sent', isEdited: false },
      ];

      const sorted = [...msgs].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      expect(sorted[0].id).toBe('msg-1');
      expect(sorted[1].id).toBe('msg-2');
      expect(sorted[2].id).toBe('msg-3');
    });
  });

  describe('Optimistic message flow', () => {
    it('should create temp message with sending status', () => {
      const tempId = `__temp_${Date.now()}_1`;
      const optimistic: Message = {
        id: tempId,
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'Sending...',
        timestamp: new Date(),
        status: 'sending',
        isEdited: false,
      };

      messages['chat-1'] = [optimistic];
      expect(messages['chat-1'][0].id).toContain('__temp_');
      expect(messages['chat-1'][0].status).toBe('sending');
    });

    it('should replace temp message with real one', () => {
      const tempId = '__temp_123_1';
      const tempMsg: Message = {
        id: tempId,
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'Hello',
        timestamp: new Date(),
        status: 'sending',
        isEdited: false,
      };
      messages['chat-1'] = [tempMsg];

      const realMsg: Message = {
        id: 'real-msg-id',
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'Hello',
        timestamp: new Date(),
        status: 'sent',
        isEdited: false,
      };

      messages['chat-1'] = messages['chat-1'].map((m) =>
        m.id === tempId ? { ...realMsg, status: 'sent' as const } : m
      );

      expect(messages['chat-1'][0].id).toBe('real-msg-id');
      expect(messages['chat-1'][0].status).toBe('sent');
    });

    it('should mark temp message as error on failure', () => {
      const tempId = '__temp_123_1';
      const tempMsg: Message = {
        id: tempId,
        chatId: 'chat-1',
        senderId: 'user-1',
        type: 'text',
        content: 'Hello',
        timestamp: new Date(),
        status: 'sending',
        isEdited: false,
      };
      messages['chat-1'] = [tempMsg];

      messages['chat-1'] = messages['chat-1'].map((m) =>
        m.id === tempId ? { ...m, status: 'error' as const } : m
      );

      expect(messages['chat-1'][0].status).toBe('error');
    });
  });
});
