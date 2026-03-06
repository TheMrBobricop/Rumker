import { Router } from 'express';
import type { Application } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { joinUserToRoom } from '../socket/index.js';
import { validateBody, validateUuidParam, createChatSchema, createPrivateChatSchema, sendMessageSchema, editMessageSchema, markReadSchema, addMembersSchema, reactionSchema, updateMemberRoleSchema, updateMemberTitleSchema, updateChatSchema } from '../lib/validation.js';
import { messageSendLimiter } from '../lib/security.js';
import { getParticipantInfo, hasRight, canPromote, outranks, type AdminRights } from '../lib/permissions.js';

const router = Router();

function getIO(req: AuthRequest) {
    return (req.app as Application).get('io');
}

/** Fetch poll with options and vote counts (inline helper for message formatting) */
async function fetchPollData(pollId: string, userId: string) {
    // Parallelize all 3 queries
    const [pollResult, optionsResult, votesResult] = await Promise.all([
        supabase.from('polls').select('id, question, is_anonymous, is_multiple_choice, is_closed, created_by').eq('id', pollId).single(),
        supabase.from('poll_options').select('id, text, position').eq('poll_id', pollId).order('position'),
        supabase.from('poll_votes').select('option_id, user_id').eq('poll_id', pollId),
    ]);

    const { data: poll, error } = pollResult;
    if (error || !poll) return null;

    const { data: options } = optionsResult;
    const { data: votes } = votesResult;

    const votesByOption = new Map<string, string[]>();
    let totalVotes = 0;
    for (const v of votes || []) {
        const arr = votesByOption.get(v.option_id) || [];
        arr.push(v.user_id);
        votesByOption.set(v.option_id, arr);
        totalVotes++;
    }

    const votedOptionIds = (votes || [])
        .filter(v => v.user_id === userId)
        .map(v => v.option_id);

    return {
        id: poll.id,
        question: poll.question,
        isAnonymous: poll.is_anonymous,
        isMultipleChoice: poll.is_multiple_choice,
        isClosed: poll.is_closed,
        createdBy: poll.created_by,
        totalVotes,
        votedOptionIds,
        options: (options || []).map((o: { id: string; text: string }) => ({
            id: o.id,
            text: o.text,
            voterCount: (votesByOption.get(o.id) || []).length,
            voters: poll.is_anonymous ? undefined : votesByOption.get(o.id) || [],
        })),
    };
}

// Get all chats for current user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        // Получаем ID чатов, в которых участвует пользователь
        const { data: participantRows, error: participantError } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', userId);

        if (participantError) {
            console.error('Get participant chats error:', participantError);
            return res.status(500).json({ error: 'Failed to get chats' });
        }

        const chatIds = participantRows?.map(r => r.chat_id) || [];

        if (chatIds.length === 0) {
            return res.json([]);
        }

        // Получаем чаты с участниками (try full query, fall back to simpler if columns missing)
        let chats: any[] | null = null;

        const fullSelect = `
            id, name, type, description, avatar, created_at, updated_at, created_by,
            chat_participants(
                user_id, joined_at, is_pinned, is_muted, role, title, admin_rights, is_banned,
                users!chat_participants_user_id_fkey(id, username, first_name, last_name, avatar, is_online, last_seen)
            )
        `;

        const fallbackSelect = `
            id, name, type, created_at, updated_at, created_by,
            chat_participants(
                user_id, joined_at,
                users!chat_participants_user_id_fkey(id, username, first_name, last_name, avatar, is_online, last_seen)
            )
        `;

        let { data, error } = await supabase
            .from('chats')
            .select(fullSelect)
            .in('id', chatIds)
            .order('updated_at', { ascending: false });

        if (error) {
            console.warn('Get chats full query failed, trying fallback:', error.message);
            // Fallback: query without optional columns (description, avatar, is_pinned, etc.)
            const fallback = await supabase
                .from('chats')
                .select(fallbackSelect)
                .in('id', chatIds)
                .order('updated_at', { ascending: false });

            if (fallback.error) {
                console.error('Get chats fallback error:', fallback.error);
                return res.status(500).json({ error: 'Failed to get chats' });
            }
            data = fallback.data;
        }
        chats = data;

        // Fetch last message per chat (batch query instead of N+1)
        const lastMessageMap = new Map<string, any>();
        try {
            // Fetch recent messages for all chats in one query, then pick the latest per chat
            // Limit to chatIds.length * 2 to avoid fetching millions of rows
            const { data: allLastMsgs } = await supabase
                .from('messages')
                .select(`
                    id, chat_id, content, type, file_url, created_at, sender_id, is_deleted,
                    users!messages_sender_id_fkey(id, username, first_name, last_name, avatar)
                `)
                .in('chat_id', chatIds)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
                .limit(chatIds.length * 3);

            // Group by chat_id, take first (newest) per chat
            if (allLastMsgs) {
                const seen = new Set<string>();
                for (const msg of allLastMsgs) {
                    if (!seen.has(msg.chat_id)) {
                        seen.add(msg.chat_id);
                        lastMessageMap.set(msg.chat_id, msg);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to batch-fetch last messages:', err);
        }

        // Try to fetch read status (table may not exist)
        const readMap = new Map<string, string>(); // chatId -> last_read_message_id
        const readTimestampMap = new Map<string, string>(); // chatId -> created_at of last read msg
        try {
            const { data: readRows } = await supabase
                .from('message_reads')
                .select('chat_id, last_read_message_id')
                .eq('user_id', userId)
                .in('chat_id', chatIds);

            if (readRows && readRows.length > 0) {
                for (const row of readRows) {
                    readMap.set(row.chat_id, row.last_read_message_id);
                }

                // Batch-fetch timestamps for all last-read messages
                const readMsgIds = readRows.map(r => r.last_read_message_id);
                const { data: readMsgs } = await supabase
                    .from('messages')
                    .select('id, chat_id, created_at')
                    .in('id', readMsgIds);

                if (readMsgs) {
                    for (const msg of readMsgs) {
                        readTimestampMap.set(msg.chat_id, msg.created_at);
                    }
                }
            }
        } catch {
            // message_reads table may not exist yet — skip unread counts
        }

        // Форматируем данные под фронтенд Chat type
        const formattedChatsRaw = await Promise.all((chats || []).map(async (chat: any) => {
            try {
            const participants = (chat.chat_participants || []).map((p: any) => {
                const u = p.users; // Supabase returns joined table as 'users' (table name)
                return {
                    userId: p.user_id,
                    chatId: chat.id,
                    role: p.role || (chat.created_by === p.user_id ? 'owner' : 'member'),
                    title: p.title || undefined,
                    adminRights: p.admin_rights || undefined,
                    isBanned: p.is_banned || false,
                    joinedAt: p.joined_at,
                    user: u ? {
                        id: u.id,
                        username: u.username,
                        firstName: u.first_name,
                        lastName: u.last_name,
                        avatar: u.avatar,
                        isOnline: u.is_online || false,
                        lastSeen: u.last_seen || null,
                    } : null,
                };
            });

            // Для private чатов берем имя собеседника как title
            const otherParticipants = participants.filter((p: { userId: string }) => p.userId !== userId);
            let title = chat.name;
            if (!title && chat.type === 'private' && otherParticipants.length > 0 && otherParticipants[0].user) {
                const other = otherParticipants[0].user;
                title = `${other.firstName || other.username} ${other.lastName || ''}`.trim();
            }

            // Format last message
            const rawLastMsg = lastMessageMap.get(chat.id);
            let lastMessage = null;
            if (rawLastMsg) {
                lastMessage = {
                    id: rawLastMsg.id,
                    chatId: rawLastMsg.chat_id,
                    senderId: rawLastMsg.sender_id,
                    type: rawLastMsg.type,
                    content: rawLastMsg.content,
                    mediaUrl: rawLastMsg.file_url,
                    timestamp: rawLastMsg.created_at,
                    status: 'sent',
                    isEdited: false,
                    sender: rawLastMsg.users ? {
                        id: (rawLastMsg.users as { id: string }).id,
                        username: (rawLastMsg.users as { username: string }).username,
                        firstName: (rawLastMsg.users as { first_name: string | null }).first_name,
                        lastName: (rawLastMsg.users as { last_name: string | null }).last_name,
                        avatar: (rawLastMsg.users as { avatar: string | null }).avatar,
                    } : null,
                };
            }

            // Calculate unread count (graceful — defaults to 0 on any error)
            let unreadCount = 0;
            try {
                const readTimestamp = readTimestampMap.get(chat.id);
                if (readTimestamp) {
                    const { count } = await supabase
                        .from('messages')
                        .select('id', { count: 'exact', head: true })
                        .eq('chat_id', chat.id)
                        .eq('is_deleted', false)
                        .neq('sender_id', userId)
                        .gt('created_at', readTimestamp);
                    unreadCount = count || 0;
                } else if (readMap.size > 0) {
                    // message_reads table exists but user never read this chat
                    const { count } = await supabase
                        .from('messages')
                        .select('id', { count: 'exact', head: true })
                        .eq('chat_id', chat.id)
                        .eq('is_deleted', false)
                        .neq('sender_id', userId);
                    unreadCount = count || 0;
                }
            } catch {
                // Skip unread count on error
            }

            // Read per-user pin/mute from chat_participants
            const myParticipant = (chat.chat_participants || []).find((p) => p.user_id === userId) as { is_pinned?: boolean; is_muted?: boolean } | undefined;
            const isPinned = myParticipant?.is_pinned || false;
            const isMuted = myParticipant?.is_muted || false;

            // For private chats use other user's avatar; for groups/channels use chat avatar
            const chatAvatar = chat.type === 'private'
                ? (otherParticipants.length > 0 && otherParticipants[0].user ? otherParticipants[0].user.avatar : null)
                : (chat.avatar || null);

            return {
                id: chat.id,
                type: chat.type,
                title,
                description: chat.description || null,
                avatar: chatAvatar,
                createdAt: chat.created_at,
                lastMessage,
                unreadCount,
                participants,
                isPinned,
                isMuted,
            };
            } catch (chatErr: any) {
                console.error(`Error formatting chat ${chat.id}:`, chatErr?.message || chatErr);
                // Return a minimal chat object so one bad chat doesn't break the whole list
                return {
                    id: chat.id,
                    type: chat.type || 'private',
                    title: chat.name || 'Чат',
                    description: null,
                    avatar: null,
                    createdAt: chat.created_at,
                    lastMessage: null,
                    unreadCount: 0,
                    participants: [],
                    isPinned: false,
                    isMuted: false,
                };
            }
        }));

        // Filter out any null results (shouldn't happen with fallback, but just in case)
        const formattedChats = formattedChatsRaw.filter(Boolean);
        res.json(formattedChats);
    } catch (error: any) {
        console.error('Get chats error:', error?.message || error);
        if (error?.stack) console.error(error.stack);
        res.status(500).json({ error: 'Failed to get chats' });
    }
});

// Find or create private chat with a specific user
router.post('/private', authenticateToken, validateBody(createPrivateChatSchema), async (req: AuthRequest, res) => {
    try {
        const { userId: targetUserId } = req.body;
        const userId = req.user?.userId;

        if (!targetUserId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        if (targetUserId === userId) {
            return res.status(400).json({ error: 'Cannot create chat with yourself' });
        }

        // Find existing private chat between the two users (parallel)
        const [{ data: myChats }, { data: theirChats }] = await Promise.all([
            supabase.from('chat_participants').select('chat_id').eq('user_id', userId),
            supabase.from('chat_participants').select('chat_id').eq('user_id', targetUserId),
        ]);

        const myChatIds = (myChats || []).map(r => r.chat_id);
        const theirChatIds = (theirChats || []).map(r => r.chat_id);
        const commonChatIds = myChatIds.filter(id => theirChatIds.includes(id));

        let existingChat = null;
        if (commonChatIds.length > 0) {
            const { data: chats } = await supabase
                .from('chats')
                .select('id')
                .in('id', commonChatIds)
                .eq('type', 'private');

            if (chats && chats.length > 0) {
                existingChat = chats[0];
            }
        }

        let chatId: string;

        if (existingChat) {
            chatId = existingChat.id;
        } else {
            // Create new private chat
            const { data: newChat, error: chatError } = await supabase
                .from('chats')
                .insert({ type: 'private', created_by: userId })
                .select()
                .single();

            if (chatError || !newChat) {
                console.error('Create private chat error:', chatError);
                return res.status(500).json({ error: 'Failed to create chat' });
            }

            chatId = newChat.id;

            const { error: participantsError } = await supabase
                .from('chat_participants')
                .insert([
                    { chat_id: chatId, user_id: userId },
                    { chat_id: chatId, user_id: targetUserId },
                ]);

            if (participantsError) {
                console.error('Add participants error:', participantsError);
                await supabase.from('chats').delete().eq('id', chatId);
                return res.status(500).json({ error: 'Failed to add participants' });
            }

            // Auto-join both users to the new chat room for real-time
            joinUserToRoom(userId!, chatId);
            joinUserToRoom(targetUserId, chatId);
        }

        // Fetch full chat with participants
        const { data: chat, error } = await supabase
            .from('chats')
            .select(`
                id, name, type, created_at, updated_at, created_by,
                chat_participants(
                    user_id, joined_at,
                    users!chat_participants_user_id_fkey(id, username, first_name, last_name, avatar, is_online, last_seen)
                )
            `)
            .eq('id', chatId)
            .single();

        if (error || !chat) {
            return res.status(500).json({ error: 'Failed to fetch chat' });
        }

        const participants = (chat.chat_participants || []).map((p: any) => ({
            userId: p.user_id,
            chatId: chat.id,
            role: p.role || (chat.created_by === p.user_id ? 'owner' : 'member'),
            title: p.title || undefined,
            adminRights: p.admin_rights || undefined,
            isBanned: p.is_banned || false,
            joinedAt: p.joined_at,
            user: {
                id: p.users.id,
                username: p.users.username,
                firstName: p.users.first_name,
                lastName: p.users.last_name,
                avatar: p.users.avatar,
                isOnline: p.users.is_online,
                lastSeen: p.users.last_seen,
            }
        }));

        const otherParticipants = participants.filter((p: any) => p.userId !== userId);
        let title = chat.name;
        if (!title && otherParticipants.length > 0) {
            const other = otherParticipants[0].user;
            title = `${other.firstName || other.username} ${other.lastName || ''}`.trim();
        }

        res.json({
            id: chat.id,
            type: chat.type,
            title,
            avatar: null,
            createdAt: chat.created_at,
            lastMessage: null,
            unreadCount: 0,
            participants,
            isPinned: false,
            isMuted: false,
        });
    } catch (error) {
        console.error('Find/create private chat error:', error);
        res.status(500).json({ error: 'Failed to find or create private chat' });
    }
});

// Create new chat
router.post('/', authenticateToken, validateBody(createChatSchema), async (req: AuthRequest, res) => {
    try {
        const { name, title, type = 'private', participantIds, description, avatar } = req.body;
        const userId = req.user?.userId;

        // Private chats require exactly one other participant
        if (type === 'private') {
            if (!participantIds || participantIds.length !== 1) {
                return res.status(400).json({ error: 'Private chat requires exactly one other participant' });
            }
        }
        // Groups/channels can be created without participants (creator is added automatically)

        const chatTitle = title || name || null;

        // Создаем чат
        const insertData: Record<string, any> = {
            name: (type === 'group' || type === 'channel') ? chatTitle : null,
            type,
            created_by: userId,
        };
        if (description) insertData.description = description;
        if (avatar) insertData.avatar = avatar;

        const { data: chat, error: chatError } = await supabase
            .from('chats')
            .insert(insertData)
            .select()
            .single();

        if (chatError || !chat) {
            console.error('Create chat error:', chatError);
            return res.status(500).json({ error: chatError?.message || 'Failed to create chat', details: chatError?.code });
        }

        // Добавляем создателя + участников
        const participants = [
            { chat_id: chat.id, user_id: userId, role: 'owner' },
            ...(participantIds || []).map((id: string) => ({ chat_id: chat.id, user_id: id }))
        ];

        const { error: participantsError } = await supabase
            .from('chat_participants')
            .insert(participants);

        if (participantsError) {
            console.error('Add participants error:', participantsError);
            // Удаляем чат если не удалось добавить участников
            await supabase.from('chats').delete().eq('id', chat.id);
            return res.status(500).json({ error: 'Failed to add participants' });
        }

        // Auto-join all participants to the new chat room for real-time
        const allParticipantIds = [userId!, ...(participantIds || [])];
        for (const pid of allParticipantIds) {
            joinUserToRoom(pid, chat.id);
        }

        // Получаем данные участников для ответа
        const { data: participantData } = await supabase
            .from('chat_participants')
            .select(`
                user_id,
                joined_at,
                users!chat_participants_user_id_fkey(
                    id,
                    username,
                    first_name,
                    last_name,
                    avatar,
                    is_online,
                    last_seen
                )
            `)
            .eq('chat_id', chat.id);

        const formattedParticipants = (participantData || []).map((p: any) => ({
            userId: p.user_id,
            chatId: chat.id,
            role: p.role || (userId === p.user_id ? 'owner' : 'member'),
            title: p.title || undefined,
            adminRights: p.admin_rights || undefined,
            isBanned: p.is_banned || false,
            joinedAt: p.joined_at,
            user: {
                id: p.users.id,
                username: p.users.username,
                firstName: p.users.first_name,
                lastName: p.users.last_name,
                avatar: p.users.avatar,
                isOnline: p.users.is_online,
                lastSeen: p.users.last_seen,
            }
        }));

        // Для private чатов берем имя собеседника
        const otherParticipants = formattedParticipants.filter((p: any) => p.userId !== userId);
        let displayTitle = chatTitle;
        if (!displayTitle && type === 'private' && otherParticipants.length > 0) {
            const other = otherParticipants[0].user;
            displayTitle = `${other.firstName || other.username} ${other.lastName || ''}`.trim();
        }

        // Возвращаем Chat объект напрямую (без обертки)
        res.status(201).json({
            id: chat.id,
            type: chat.type,
            title: displayTitle,
            description: chat.description || null,
            avatar: chat.avatar || null,
            createdAt: chat.created_at,
            lastMessage: null,
            unreadCount: 0,
            participants: formattedParticipants,
            isPinned: false,
            isMuted: false,
        });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

// Get chat messages
router.get('/:chatId/messages', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const userId = req.user?.userId;

        // Проверяем что пользователь участник чата
        const { data: participant, error: participantError } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .eq('user_id', userId)
            .single();

        if (participantError || !participant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Получаем сообщения
        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select(`
                id,
                chat_id,
                content,
                type,
                file_url,
                reply_to_id,
                forwarded_from_id,
                forwarded_from_name,
                is_deleted,
                metadata,
                created_at,
                updated_at,
                sender_id,
                users!messages_sender_id_fkey(
                    id,
                    username,
                    first_name,
                    last_name,
                    avatar
                )
            `)
            .eq('chat_id', chatId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (messagesError) {
            console.error('Get messages error:', messagesError);
            return res.status(500).json({ error: 'Failed to get messages' });
        }

        // Reverse to chronological order (oldest first) for the client
        if (messages) messages.reverse();

        // Fetch reactions for all messages in batch
        const messageIds = (messages || []).map((m: any) => m.id);
        const reactionsMap = new Map<string, Array<{ emoji: string; userIds: string[] }>>();
        if (messageIds.length > 0) {
            const { data: reactions } = await supabase
                .from('message_reactions')
                .select('message_id, emoji, user_id')
                .in('message_id', messageIds);

            if (reactions) {
                const byMessage = new Map<string, Map<string, string[]>>();
                for (const r of reactions) {
                    if (!byMessage.has(r.message_id)) byMessage.set(r.message_id, new Map());
                    const emojiMap = byMessage.get(r.message_id)!;
                    if (!emojiMap.has(r.emoji)) emojiMap.set(r.emoji, []);
                    emojiMap.get(r.emoji)!.push(r.user_id);
                }
                for (const [msgId, emojiMap] of byMessage) {
                    reactionsMap.set(msgId, Array.from(emojiMap.entries()).map(([emoji, userIds]) => ({ emoji, userIds })));
                }
            }
        }

        // Build a lookup map for reply resolution
        const messageMap = new Map<string, any>();
        for (const msg of messages || []) {
            messageMap.set(msg.id, msg);
        }

        // Fetch missing reply targets not in current page
        const missingReplyIds = (messages || [])
            .filter(msg => msg.reply_to_id && !messageMap.has(msg.reply_to_id))
            .map(msg => msg.reply_to_id as string);

        if (missingReplyIds.length > 0) {
            const uniqueIds = [...new Set(missingReplyIds)];
            const { data: missingMessages } = await supabase
                .from('messages')
                .select(`
                    id,
                    content,
                    sender_id,
                    users!messages_sender_id_fkey(
                        id,
                        username,
                        first_name,
                        last_name,
                        avatar
                    )
                `)
                .in('id', uniqueIds);

            if (missingMessages) {
                for (const msg of missingMessages) {
                    messageMap.set(msg.id, msg);
                }
            }
        }

        // Форматируем под фронтенд Message type
        const formattedMessages = await Promise.all((messages || []).map(async (msg: any) => {
            let replyToMessage = undefined;
            if (msg.reply_to_id) {
                const replyMsg = messageMap.get(msg.reply_to_id);
                if (replyMsg) {
                    replyToMessage = {
                        id: replyMsg.id,
                        senderId: replyMsg.sender_id,
                        content: replyMsg.content,
                        senderName: replyMsg.users
                            ? (replyMsg.users.first_name || replyMsg.users.username)
                            : 'Unknown',
                    };
                }
            }
            const formatted: Record<string, unknown> = {
                id: msg.id,
                chatId: msg.chat_id,
                senderId: msg.sender_id,
                type: msg.type,
                content: msg.content,
                mediaUrl: msg.file_url,
                replyTo: msg.reply_to_id,
                replyToMessage,
                timestamp: msg.created_at,
                status: 'sent',
                isEdited: msg.updated_at !== msg.created_at,
                isPinned: false,
                metadata: msg.metadata || undefined,
                sender: msg.users ? {
                    id: msg.users.id,
                    username: msg.users.username,
                    firstName: msg.users.first_name,
                    lastName: msg.users.last_name,
                    avatar: msg.users.avatar
                } : null
            };
            if (msg.forwarded_from_name) {
                formatted.forwardedFrom = {
                    id: msg.forwarded_from_id || undefined,
                    name: msg.forwarded_from_name,
                };
            }
            // Attach reactions
            const msgReactions = reactionsMap.get(msg.id);
            if (msgReactions && msgReactions.length > 0) {
                formatted.reactions = msgReactions;
            }
            // Parse metadata for special types (location, contact, poll)
            const meta = msg.metadata as Record<string, any> | null;
            if (meta) {
                if (msg.type === 'location' && meta.latitude !== undefined) {
                    formatted.locationData = {
                        latitude: meta.latitude,
                        longitude: meta.longitude,
                        address: meta.address,
                    };
                }
                if (msg.type === 'contact' && meta.userId) {
                    formatted.contactData = {
                        userId: meta.userId,
                        username: meta.username,
                        firstName: meta.firstName,
                        lastName: meta.lastName,
                        avatar: meta.avatar,
                    };
                }
                if (msg.type === 'poll' && meta.pollId) {
                    try {
                        const pollData = await fetchPollData(meta.pollId, userId!);
                        if (pollData) formatted.pollData = pollData;
                    } catch { /* skip poll fetch errors */ }
                }
            }
            return formatted;
        }));

        res.json(formattedMessages);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Send message
router.post('/:chatId/messages', authenticateToken, messageSendLimiter, validateBody(sendMessageSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const { content, type = 'text', fileUrl, replyToId, forwardedFromId, forwardedFromName, metadata } = req.body;
        const userId = req.user?.userId;

        if (!content && !fileUrl) {
            return res.status(400).json({ error: 'Content or file is required' });
        }

        // Проверяем что пользователь участник чата
        const { data: participant, error: participantError } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .eq('user_id', userId)
            .single();

        if (participantError || !participant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Создаем сообщение
        const now = new Date().toISOString();
        const insertData: Record<string, unknown> = {
            chat_id: chatId,
            sender_id: userId,
            content: content || '',
            type,
            created_at: now,
            updated_at: now,
        };
        if (fileUrl) insertData.file_url = fileUrl;
        if (replyToId) insertData.reply_to_id = replyToId;
        if (forwardedFromId) insertData.forwarded_from_id = forwardedFromId;
        if (forwardedFromName) insertData.forwarded_from_name = forwardedFromName;
        if (metadata) insertData.metadata = metadata;

        const messageSelect = `
            id,
            chat_id,
            content,
            type,
            file_url,
            reply_to_id,
            forwarded_from_id,
            forwarded_from_name,
            metadata,
            created_at,
            updated_at,
            sender_id,
            users!messages_sender_id_fkey(
                id,
                username,
                first_name,
                last_name,
                avatar
            )
        `;

        let { data: message, error: messageError } = await supabase
            .from('messages')
            .insert(insertData)
            .select(messageSelect)
            .single();

        // Retry with 'text' type if DB constraint rejects the type (voice/sticker/file/audio)
        if (messageError?.message?.includes('messages_type_check')) {
            console.warn(`[DB] Type '${type}' rejected by constraint. Retrying with 'text' fallback.`);
            console.warn('[DB] Fix: Run this SQL in Supabase SQL Editor to allow all types:');
            console.warn("ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;");
            console.warn("ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (type IN ('text','image','video','voice','sticker','file','audio'));");

            const originalType = type;
            insertData.type = 'text';

            const retry = await supabase
                .from('messages')
                .insert(insertData)
                .select(messageSelect)
                .single();
            message = retry.data;
            messageError = retry.error;

            // Override the type in the response so the client renders correctly
            if (message) {
                (message as { type: string }).type = originalType;
            }
        }

        if (messageError || !message) {
            console.error('Send message error:', messageError);
            return res.status(500).json({ error: 'Failed to send message', message: messageError?.message, details: messageError?.details });
        }

        // Fire-and-forget: update chat timestamp (no need to await)
        supabase
            .from('chats')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', chatId)
            .then(null, (err: any) => console.warn('Chat timestamp update failed:', err?.message));

        // Fetch reply target if this is a reply
        let replyToMessage: Record<string, unknown> | undefined;
        if (message.reply_to_id) {
            const { data: replyMsg } = await supabase
                .from('messages')
                .select('id, content, sender_id, users!messages_sender_id_fkey(id, username, first_name)')
                .eq('id', message.reply_to_id)
                .single();
            if (replyMsg) {
                replyToMessage = {
                    id: replyMsg.id,
                    senderId: replyMsg.sender_id,
                    content: replyMsg.content,
                    senderName: (replyMsg as any).users
                        ? ((replyMsg as any).users.first_name || (replyMsg as any).users.username)
                        : 'Unknown',
                };
            }
        }

        // Форматируем под фронтенд Message type
        const formattedMessage: Record<string, unknown> = {
            id: message.id,
            chatId: message.chat_id,
            senderId: message.sender_id,
            type: message.type,
            content: message.content,
            mediaUrl: message.file_url,
            replyTo: message.reply_to_id,
            replyToMessage,
            timestamp: message.created_at,
            status: 'sent',
            isEdited: false,
            metadata: (message as any).metadata || undefined,
            sender: message.users ? {
                id: message.users.id,
                username: message.users?.username,
                firstName: message.users?.first_name,
                lastName: message.users?.last_name,
                avatar: message.users?.avatar
            } : null
        };
        if (message.forwarded_from_name) {
            formattedMessage.forwardedFrom = {
                id: message.forwarded_from_id || undefined,
                name: message.forwarded_from_name,
            };
        }
        // Parse metadata for special types
        const meta = (message as any).metadata;
        if (meta) {
            if (message.type === 'location' && meta.latitude !== undefined) {
                formattedMessage.locationData = {
                    latitude: meta.latitude,
                    longitude: meta.longitude,
                    address: meta.address,
                };
            }
            if (message.type === 'contact' && meta.userId) {
                formattedMessage.contactData = {
                    userId: meta.userId,
                    username: meta.username,
                    firstName: meta.firstName,
                    lastName: meta.lastName,
                    avatar: meta.avatar,
                };
            }
        }

        // Emit via Socket.io to all chat participants
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('message:new', formattedMessage);
            }
        } catch { /* socket not available */ }

        res.status(201).json(formattedMessage);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Edit message
router.patch('/:chatId/messages/:messageId', authenticateToken, validateBody(editMessageSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId, messageId } = req.params;
        const { content } = req.body;
        const userId = req.user?.userId;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Content is required' });
        }

        // Verify message exists and belongs to user
        const { data: message, error: msgError } = await supabase
            .from('messages')
            .select('id, sender_id, chat_id')
            .eq('id', messageId)
            .eq('chat_id', chatId)
            .single();

        if (msgError || !message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.sender_id !== userId) {
            return res.status(403).json({ error: 'Can only edit own messages' });
        }

        // Update message
        const { data: updated, error: updateError } = await supabase
            .from('messages')
            .update({
                content: content.trim(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', messageId)
            .select(`
                id,
                chat_id,
                content,
                type,
                file_url,
                reply_to_id,
                created_at,
                updated_at,
                sender_id,
                users!messages_sender_id_fkey(
                    id,
                    username,
                    first_name,
                    last_name,
                    avatar
                )
            `)
            .single();

        if (updateError || !updated) {
            console.error('Edit message error:', updateError);
            return res.status(500).json({ error: 'Failed to edit message', message: updateError?.message });
        }

        const formattedEdited = {
            id: updated.id,
            chatId: updated.chat_id,
            senderId: updated.sender_id,
            type: updated.type,
            content: updated.content,
            mediaUrl: updated.file_url,
            replyTo: updated.reply_to_id,
            timestamp: updated.created_at,
            status: 'sent',
            isEdited: true,
            sender: updated.users ? {
                id: (updated.users as any).id,
                username: (updated.users as any).username,
                firstName: (updated.users as any).first_name,
                lastName: (updated.users as any).last_name,
                avatar: (updated.users as any).avatar
            } : null
        };

        // Emit via Socket.io
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('message:edit', formattedEdited);
            }
        } catch { /* socket not available */ }

        res.json(formattedEdited);
    } catch (error) {
        console.error('Edit message error:', error);
        res.status(500).json({ error: 'Failed to edit message' });
    }
});

// Delete message (soft delete)
router.delete('/:chatId/messages/:messageId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId, messageId } = req.params;
        const userId = req.user?.userId;

        // Verify message exists and belongs to user
        const { data: message, error: msgError } = await supabase
            .from('messages')
            .select('id, sender_id, chat_id')
            .eq('id', messageId)
            .eq('chat_id', chatId)
            .single();

        if (msgError || !message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.sender_id !== userId) {
            // Check if user has admin right to delete others' messages
            const actor = await getParticipantInfo(chatId, userId!);
            if (!actor || !hasRight(actor, 'can_delete_messages')) {
                return res.status(403).json({ error: 'Can only delete own messages' });
            }
        }

        // Soft delete
        const { error: deleteError } = await supabase
            .from('messages')
            .update({ is_deleted: true })
            .eq('id', messageId);

        if (deleteError) {
            console.error('Delete message error:', deleteError);
            return res.status(500).json({ error: 'Failed to delete message' });
        }

        // Emit via Socket.io
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('message:delete', { chatId, messageId });
            }
        } catch { /* socket not available */ }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Pin a message
router.post('/:chatId/messages/:messageId/pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId, messageId } = req.params;
        const userId = req.user?.userId;

        // Verify participant + pin permission
        const actorInfo = await getParticipantInfo(chatId, userId!);
        if (!actorInfo) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // In private chats, both users can pin; in groups, need can_pin_messages
        const { data: chat } = await supabase
            .from('chats')
            .select('type')
            .eq('id', chatId)
            .single();

        if (chat?.type !== 'private' && !hasRight(actorInfo, 'can_pin_messages')) {
            return res.status(403).json({ error: 'No permission to pin messages' });
        }

        // Update message
        const { error } = await supabase
            .from('messages')
            .update({
                is_pinned: true,
                pinned_at: new Date().toISOString(),
                pinned_by: userId,
            })
            .eq('id', messageId)
            .eq('chat_id', chatId);

        if (error) {
            console.error('Pin message error:', error);
            return res.status(500).json({ error: 'Failed to pin message' });
        }

        // Emit via Socket.io
        try {
            const io = getIO(req);
            if (io) {
                // Fetch the pinned message to emit full data
                const { data: msg } = await supabase
                    .from('messages')
                    .select(`
                        id, chat_id, content, type, file_url, created_at, sender_id,
                        users!messages_sender_id_fkey(id, username, first_name, last_name, avatar)
                    `)
                    .eq('id', messageId)
                    .single();

                if (msg) {
                    const formatted = {
                        id: msg.id,
                        chatId: msg.chat_id,
                        senderId: msg.sender_id,
                        type: msg.type,
                        content: msg.content,
                        mediaUrl: msg.file_url,
                        timestamp: msg.created_at,
                        status: 'sent',
                        isEdited: false,
                        isPinned: true,
                        pinnedAt: new Date().toISOString(),
                        pinnedBy: userId,
                        sender: msg.users ? {
                            id: (msg.users as any).id,
                            username: (msg.users as any).username,
                            firstName: (msg.users as any).first_name,
                            lastName: (msg.users as any).last_name,
                            avatar: (msg.users as any).avatar,
                        } : null,
                    };
                    io.to(`chat:${chatId}`).emit('message:pin', { chatId, message: formatted });
                }
            }
        } catch { /* socket not available */ }

        res.json({ success: true });
    } catch (error) {
        console.error('Pin message error:', error);
        res.status(500).json({ error: 'Failed to pin message' });
    }
});

// Unpin a message
router.delete('/:chatId/messages/:messageId/pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId, messageId } = req.params;
        const userId = req.user?.userId;

        // Verify participant + unpin permission
        const actorInfo = await getParticipantInfo(chatId, userId!);
        if (!actorInfo) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // In private chats, both users can unpin; in groups, need can_pin_messages
        const { data: chatForUnpin } = await supabase
            .from('chats')
            .select('type')
            .eq('id', chatId)
            .single();

        if (chatForUnpin?.type !== 'private' && !hasRight(actorInfo, 'can_pin_messages')) {
            return res.status(403).json({ error: 'No permission to unpin messages' });
        }

        const { error } = await supabase
            .from('messages')
            .update({
                is_pinned: false,
                pinned_at: null,
                pinned_by: null,
            })
            .eq('id', messageId)
            .eq('chat_id', chatId);

        if (error) {
            console.error('Unpin message error:', error);
            return res.status(500).json({ error: 'Failed to unpin message' });
        }

        // Emit via Socket.io
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('message:unpin', { chatId, messageId });
            }
        } catch { /* socket not available */ }

        res.json({ success: true });
    } catch (error) {
        console.error('Unpin message error:', error);
        res.status(500).json({ error: 'Failed to unpin message' });
    }
});

// Unpin all messages in a chat
router.post('/:chatId/unpin-all', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.userId;

        // Verify participant + pin permission
        const actorInfo = await getParticipantInfo(chatId, userId!);
        if (!actorInfo) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // In private chats, both users can unpin; in groups, need can_pin_messages
        const { data: chat } = await supabase
            .from('chats')
            .select('type')
            .eq('id', chatId)
            .single();

        if (chat?.type !== 'private' && !hasRight(actorInfo, 'can_pin_messages')) {
            return res.status(403).json({ error: 'No permission to unpin messages' });
        }

        const { error } = await supabase
            .from('messages')
            .update({
                is_pinned: false,
                pinned_at: null,
                pinned_by: null,
            })
            .eq('chat_id', chatId)
            .eq('is_pinned', true);

        if (error) {
            console.error('Unpin all messages error:', error);
            return res.status(500).json({ error: 'Failed to unpin all messages' });
        }

        // Emit via Socket.io
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('message:unpin-all', { chatId });
            }
        } catch { /* socket not available */ }

        res.json({ success: true });
    } catch (error) {
        console.error('Unpin all messages error:', error);
        res.status(500).json({ error: 'Failed to unpin all messages' });
    }
});

// Get pinned messages for a chat
router.get('/:chatId/pinned', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.userId;

        // Verify participant
        const { data: participant } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .eq('user_id', userId)
            .single();

        if (!participant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Pin columns may not exist yet in DB — gracefully return empty
        try {
            const { data: messages, error } = await supabase
                .from('messages')
                .select(`
                    id, chat_id, content, type, file_url, created_at, updated_at, sender_id, is_pinned, pinned_at, pinned_by,
                    users!messages_sender_id_fkey(id, username, first_name, last_name, avatar)
                `)
                .eq('chat_id', chatId)
                .eq('is_pinned', true)
                .eq('is_deleted', false)
                .order('pinned_at', { ascending: false });

            if (error) {
                // If columns don't exist, return empty array
                console.warn('Get pinned messages — columns may not exist:', error.message);
                return res.json([]);
            }

            const formatted = (messages || []).map((msg: any) => ({
                id: msg.id,
                chatId: msg.chat_id,
                senderId: msg.sender_id,
                type: msg.type,
                content: msg.content,
                mediaUrl: msg.file_url,
                timestamp: msg.created_at,
                status: 'sent',
                isEdited: msg.updated_at !== msg.created_at,
                isPinned: true,
                pinnedAt: msg.pinned_at,
                pinnedBy: msg.pinned_by,
                sender: msg.users ? {
                    id: msg.users.id,
                    username: msg.users.username,
                    firstName: msg.users.first_name,
                    lastName: msg.users.last_name,
                    avatar: msg.users.avatar,
                } : null,
            }));

            res.json(formatted);
        } catch {
            // Fallback: columns don't exist yet
            res.json([]);
        }
    } catch (error) {
        console.error('Get pinned messages error:', error);
        res.status(500).json({ error: 'Failed to get pinned messages' });
    }
});

// Search messages in a chat
router.get('/:chatId/messages/search', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const query = (req.query.q as string || '').trim();
        const userId = req.user?.userId;

        if (!query) {
            return res.json([]);
        }

        // Verify participant
        const { data: participant } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .eq('user_id', userId)
            .single();

        if (!participant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                id, chat_id, content, type, file_url, created_at, updated_at, sender_id,
                users!messages_sender_id_fkey(id, username, first_name, last_name, avatar)
            `)
            .eq('chat_id', chatId)
            .eq('is_deleted', false)
            .ilike('content', `%${String(query).replace(/[%_\\]/g, '\\$&')}%`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Search messages error:', error);
            return res.status(500).json({ error: 'Failed to search messages' });
        }

        const formatted = (messages || []).map((msg: any) => ({
            id: msg.id,
            chatId: msg.chat_id,
            senderId: msg.sender_id,
            type: msg.type,
            content: msg.content,
            mediaUrl: msg.file_url,
            timestamp: msg.created_at,
            status: 'sent',
            isEdited: msg.updated_at !== msg.created_at,
            sender: msg.users ? {
                id: msg.users.id,
                username: msg.users.username,
                firstName: msg.users.first_name,
                lastName: msg.users.last_name,
                avatar: msg.users.avatar,
            } : null,
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Search messages error:', error);
        res.status(500).json({ error: 'Failed to search messages' });
    }
});

// Get shared media/files/links for a chat
router.get('/:chatId/media', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const mediaType = req.query.type as string || 'image'; // image, video, file, voice
        const userId = req.user?.userId;

        // Verify participant
        const { data: participant } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .eq('user_id', userId)
            .single();

        if (!participant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Build filter based on type
        let query = supabase
            .from('messages')
            .select(`
                id, chat_id, content, type, file_url, created_at, sender_id,
                users!messages_sender_id_fkey(id, username, first_name, last_name, avatar)
            `)
            .eq('chat_id', chatId)
            .eq('is_deleted', false)
            .not('file_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(100);

        if (mediaType === 'image') {
            query = query.eq('type', 'image');
        } else if (mediaType === 'video') {
            query = query.eq('type', 'video');
        } else if (mediaType === 'file') {
            query = query.eq('type', 'file');
        } else if (mediaType === 'voice') {
            query = query.eq('type', 'voice');
        }

        const { data: messages, error } = await query;

        if (error) {
            console.error('Get media error:', error);
            return res.status(500).json({ error: 'Failed to get media' });
        }

        const formatted = (messages || []).map((msg: any) => ({
            id: msg.id,
            chatId: msg.chat_id,
            senderId: msg.sender_id,
            type: msg.type,
            content: msg.content,
            mediaUrl: msg.file_url,
            timestamp: msg.created_at,
            status: 'sent',
            isEdited: false,
            sender: msg.users ? {
                id: msg.users.id,
                username: msg.users.username,
                firstName: msg.users.first_name,
                lastName: msg.users.last_name,
                avatar: msg.users.avatar,
            } : null,
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Get media error:', error);
        res.status(500).json({ error: 'Failed to get media' });
    }
});

// Delete a chat
router.delete('/:chatId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.userId;

        // Verify participant
        const { data: participant } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .eq('user_id', userId)
            .single();

        if (!participant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Remove the user from the chat (leave chat)
        const { error: leaveError } = await supabase
            .from('chat_participants')
            .delete()
            .eq('chat_id', chatId)
            .eq('user_id', userId);

        if (leaveError) {
            console.error('Leave chat error:', leaveError);
            return res.status(500).json({ error: 'Failed to delete chat' });
        }

        // Check if any participants remain
        const { data: remaining } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .limit(1);

        // If no participants remain, delete the chat entirely
        if (!remaining || remaining.length === 0) {
            await supabase.from('messages').delete().eq('chat_id', chatId);
            await supabase.from('chats').delete().eq('id', chatId);
        }

        // Emit via Socket.io
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('chat:delete', { chatId, userId });
            }
        } catch { /* socket not available */ }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});

// Mark messages as read
router.post('/:chatId/read', authenticateToken, validateBody(markReadSchema), async (req: AuthRequest, res) => {
    const { chatId } = req.params;
    const { messageId } = req.body;
    const userId = req.user?.userId;

    if (!messageId) {
        return res.status(400).json({ error: 'messageId is required' });
    }

    // Best-effort upsert — never return 500 for read-tracking
    try {
        const { error } = await supabase
            .from('message_reads')
            .upsert(
                {
                    user_id: userId,
                    chat_id: chatId,
                    last_read_message_id: messageId,
                    read_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,chat_id' }
            );

        if (error) {
            console.warn('Mark read warning (non-fatal):', error.message);
        }
    } catch (err) {
        console.warn('Mark read warning (non-fatal):', err);
    }

    // Emit via Socket.io
    try {
        const io = getIO(req);
        if (io) {
            io.to(`chat:${chatId}`).emit('message:read', { userId, chatId, messageId });
        }
    } catch { /* socket not available */ }

    res.json({ success: true });
});

// Toggle pin chat (per-user)
router.post('/:chatId/pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.userId;

        // Try to update is_pinned column; if it doesn't exist, just return success
        const { error } = await supabase
            .from('chat_participants')
            .update({ is_pinned: true })
            .eq('chat_id', chatId)
            .eq('user_id', userId);

        if (error) {
            console.warn('Pin chat — column may not exist:', error.message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Pin chat error:', error);
        res.status(500).json({ error: 'Failed to pin chat' });
    }
});

router.delete('/:chatId/pin', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.userId;

        const { error } = await supabase
            .from('chat_participants')
            .update({ is_pinned: false })
            .eq('chat_id', chatId)
            .eq('user_id', userId);

        if (error) {
            console.warn('Unpin chat — column may not exist:', error.message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Unpin chat error:', error);
        res.status(500).json({ error: 'Failed to unpin chat' });
    }
});

// Toggle mute chat (per-user)
router.post('/:chatId/mute', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.userId;

        const { error } = await supabase
            .from('chat_participants')
            .update({ is_muted: true })
            .eq('chat_id', chatId)
            .eq('user_id', userId);

        if (error) {
            console.warn('Mute chat — column may not exist:', error.message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Mute chat error:', error);
        res.status(500).json({ error: 'Failed to mute chat' });
    }
});

router.delete('/:chatId/mute', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.userId;

        const { error } = await supabase
            .from('chat_participants')
            .update({ is_muted: false })
            .eq('chat_id', chatId)
            .eq('user_id', userId);

        if (error) {
            console.warn('Unmute chat — column may not exist:', error.message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Unmute chat error:', error);
        res.status(500).json({ error: 'Failed to unmute chat' });
    }
});

// Clear chat messages (soft delete all messages for this chat)
router.post('/:chatId/clear', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.userId;

        // Verify participant has admin rights (delete_messages) or is owner
        const actorInfo = await getParticipantInfo(chatId, userId!);
        if (!actorInfo) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (actorInfo.role !== 'owner' && !hasRight(actorInfo, 'can_delete_messages')) {
            return res.status(403).json({ error: 'Admin permission required to clear chat' });
        }

        // Soft delete all messages in this chat
        const { error } = await supabase
            .from('messages')
            .update({ is_deleted: true })
            .eq('chat_id', chatId);

        if (error) {
            console.error('Clear chat error:', error);
            return res.status(500).json({ error: 'Failed to clear chat' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Clear chat error:', error);
        res.status(500).json({ error: 'Failed to clear chat' });
    }
});

// Add members to a group/channel chat
router.post('/:chatId/members', authenticateToken, validateBody(addMembersSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const { userIds } = req.body; // array of user IDs to add
        const userId = req.user?.userId;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'userIds array is required' });
        }

        // Verify caller is participant with invite permission
        const actorInfo = await getParticipantInfo(chatId, userId!);
        if (!actorInfo) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!hasRight(actorInfo, 'can_invite_users')) {
            return res.status(403).json({ error: 'No permission to add members' });
        }

        // Verify this is a group or channel
        const { data: chat } = await supabase
            .from('chats')
            .select('id, type')
            .eq('id', chatId)
            .single();

        if (!chat || chat.type === 'private') {
            return res.status(400).json({ error: 'Can only add members to groups and channels' });
        }

        // Get existing participants to avoid duplicates
        const { data: existing } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId);

        const existingIds = new Set((existing || []).map(p => p.user_id));
        const newUserIds = userIds.filter((id: string) => !existingIds.has(id));

        if (newUserIds.length === 0) {
            return res.json({ success: true, added: 0 });
        }

        // Insert new participants
        const { error: insertError } = await supabase
            .from('chat_participants')
            .insert(newUserIds.map((uid: string) => ({ chat_id: chatId, user_id: uid })));

        if (insertError) {
            console.error('Add members error:', insertError);
            return res.status(500).json({ error: 'Failed to add members' });
        }

        // Auto-join new users to the chat room for real-time
        for (const uid of newUserIds) {
            joinUserToRoom(uid, chatId);
        }

        // Notify existing chat members about new participants via socket
        try {
            const io = getIO(req);
            if (io) {
                // Fetch new participant data
                const { data: newParticipants } = await supabase
                    .from('users')
                    .select('id, username, first_name, last_name, avatar, is_online')
                    .in('id', newUserIds);

                if (newParticipants) {
                    for (const u of newParticipants) {
                        io.to(`chat:${chatId}`).emit('chat:member-added', {
                            chatId,
                            participant: {
                                userId: u.id,
                                chatId,
                                role: 'member',
                                joinedAt: new Date().toISOString(),
                                user: {
                                    id: u.id,
                                    username: u.username,
                                    firstName: u.first_name,
                                    lastName: u.last_name,
                                    avatar: u.avatar,
                                    isOnline: u.is_online,
                                },
                            },
                        });
                    }
                }
            }
        } catch { /* socket not available */ }

        res.json({ success: true, added: newUserIds.length });
    } catch (error) {
        console.error('Add members error:', error);
        res.status(500).json({ error: 'Failed to add members' });
    }
});

// Get chat participants (for group info)
router.get('/:chatId/participants', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user?.userId;

        // Verify participant
        const { data: participant } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .eq('user_id', userId)
            .single();

        if (!participant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get chat info
        const { data: chat } = await supabase
            .from('chats')
            .select('id, name, type, description, avatar, created_at, created_by')
            .eq('id', chatId)
            .single();

        // Get all participants with user data
        const { data: participants, error } = await supabase
            .from('chat_participants')
            .select(`
                user_id, joined_at,
                users!chat_participants_user_id_fkey(id, username, first_name, last_name, avatar, is_online, last_seen)
            `)
            .eq('chat_id', chatId);

        if (error) {
            console.error('Get participants error:', error);
            return res.status(500).json({ error: 'Failed to get participants' });
        }

        const formatted = (participants || []).map((p: any) => ({
            userId: p.user_id,
            chatId,
            role: p.role || (chat?.created_by === p.user_id ? 'owner' : 'member'),
            title: p.title || undefined,
            adminRights: p.admin_rights || undefined,
            isBanned: p.is_banned || false,
            joinedAt: p.joined_at,
            user: p.users ? {
                id: p.users.id,
                username: p.users.username,
                firstName: p.users.first_name,
                lastName: p.users.last_name,
                avatar: p.users.avatar,
                isOnline: p.users.is_online,
                lastSeen: p.users.last_seen,
            } : null,
        }));

        res.json({
            chatId,
            name: chat?.name,
            type: chat?.type,
            description: chat?.description || null,
            avatar: chat?.avatar || null,
            createdAt: chat?.created_at,
            participants: formatted,
        });
    } catch (error) {
        console.error('Get participants error:', error);
        res.status(500).json({ error: 'Failed to get participants' });
    }
});

// ============================================================
// Reactions
// ============================================================

// Toggle reaction on a message
router.post('/:chatId/messages/:messageId/reactions', authenticateToken, validateBody(reactionSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId, messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user?.userId!;

        // Verify participant
        const { data: participant } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .eq('user_id', userId)
            .single();

        if (!participant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check if reaction already exists (toggle)
        const { data: existing } = await supabase
            .from('message_reactions')
            .select('id')
            .eq('message_id', messageId)
            .eq('user_id', userId)
            .eq('emoji', emoji)
            .single();

        let action: 'add' | 'remove';

        if (existing) {
            await supabase
                .from('message_reactions')
                .delete()
                .eq('message_id', messageId)
                .eq('user_id', userId)
                .eq('emoji', emoji);
            action = 'remove';
        } else {
            await supabase
                .from('message_reactions')
                .insert({ message_id: messageId, user_id: userId, emoji });
            action = 'add';
        }

        // Emit socket event
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('message:reaction', {
                    messageId,
                    chatId,
                    emoji,
                    userId,
                    action,
                });
            }
        } catch { /* socket not available */ }

        res.json({ success: true, action });
    } catch (error) {
        console.error('Reaction toggle error:', error);
        res.status(500).json({ error: 'Failed to toggle reaction' });
    }
});

// ============================================================
// Admin Rights Management
// ============================================================

// Promote/Demote member
router.put('/:chatId/members/:userId/role', authenticateToken, validateBody(updateMemberRoleSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId, userId: targetUserId } = req.params;
        const { role, title, adminRights } = req.body;
        const actorId = req.user?.userId;

        const actor = await getParticipantInfo(chatId, actorId!);
        if (!actor) return res.status(403).json({ error: 'Нет доступа' });
        if (actor.is_banned) return res.status(403).json({ error: 'Вы заблокированы' });
        if (actorId === targetUserId) return res.status(400).json({ error: 'Нельзя изменить свою роль' });

        const target = await getParticipantInfo(chatId, targetUserId);
        if (!target) return res.status(404).json({ error: 'Пользователь не найден в чате' });

        if (!canPromote(actor, target)) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        // Admins cannot grant rights they don't have
        if (actor.role === 'admin' && adminRights && actor.admin_rights) {
            for (const [key, value] of Object.entries(adminRights)) {
                if (value === true && !(actor.admin_rights as any)[key]) {
                    return res.status(403).json({ error: `Нельзя дать право '${key}', которого у вас нет` });
                }
            }
        }

        const updateData: Record<string, unknown> = { role };
        if (role === 'admin') {
            updateData.admin_rights = adminRights || {};
            updateData.title = title || null;
        } else {
            updateData.admin_rights = null;
            updateData.title = null;
        }

        const { error } = await supabase
            .from('chat_participants')
            .update(updateData)
            .eq('chat_id', chatId)
            .eq('user_id', targetUserId);

        if (error) {
            console.error('Update role error:', error);
            return res.status(500).json({ error: 'Не удалось обновить роль' });
        }

        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('member:role-changed', {
                    chatId,
                    userId: targetUserId,
                    role,
                    title: role === 'admin' ? (title || null) : null,
                    adminRights: role === 'admin' ? (adminRights || {}) : null,
                    changedBy: actorId,
                });
            }
        } catch { /* socket not available */ }

        res.json({ success: true });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ error: 'Не удалось обновить роль' });
    }
});

// Set custom admin title
router.put('/:chatId/members/:userId/title', authenticateToken, validateBody(updateMemberTitleSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId, userId: targetUserId } = req.params;
        const { title } = req.body;
        const actorId = req.user?.userId;

        const actor = await getParticipantInfo(chatId, actorId!);
        if (!actor) return res.status(403).json({ error: 'Нет доступа' });

        if (!hasRight(actor, 'can_promote_members')) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        const { error } = await supabase
            .from('chat_participants')
            .update({ title })
            .eq('chat_id', chatId)
            .eq('user_id', targetUserId);

        if (error) {
            return res.status(500).json({ error: 'Не удалось обновить титул' });
        }

        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('member:title-changed', {
                    chatId, userId: targetUserId, title,
                });
            }
        } catch { /* socket not available */ }

        res.json({ success: true });
    } catch (error) {
        console.error('Update title error:', error);
        res.status(500).json({ error: 'Не удалось обновить титул' });
    }
});

// Kick/Ban member (use ?ban=true query param for ban)
router.delete('/:chatId/members/:userId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId, userId: targetUserId } = req.params;
        const ban = req.query.ban === 'true';
        const actorId = req.user?.userId;

        if (actorId === targetUserId) {
            return res.status(400).json({ error: 'Нельзя удалить самого себя' });
        }

        const actor = await getParticipantInfo(chatId, actorId!);
        if (!actor) return res.status(403).json({ error: 'Нет доступа' });

        if (!hasRight(actor, 'can_ban_users')) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        const target = await getParticipantInfo(chatId, targetUserId);
        if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

        if (!outranks(actor, target)) {
            return res.status(403).json({ error: 'Нельзя удалить пользователя с равной или более высокой ролью' });
        }

        if (ban) {
            await supabase
                .from('chat_participants')
                .update({
                    is_banned: true,
                    banned_at: new Date().toISOString(),
                    banned_by: actorId,
                })
                .eq('chat_id', chatId)
                .eq('user_id', targetUserId);
        } else {
            await supabase
                .from('chat_participants')
                .delete()
                .eq('chat_id', chatId)
                .eq('user_id', targetUserId);
        }

        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('member:removed', {
                    chatId,
                    userId: targetUserId,
                    reason: ban ? 'banned' : 'kicked',
                    removedBy: actorId,
                });
            }
        } catch { /* socket not available */ }

        res.json({ success: true });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: 'Не удалось удалить участника' });
    }
});

// ---- Update chat info (name, description, avatar) ----

router.patch('/:chatId', authenticateToken, validateBody(updateChatSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const { name, description, avatar } = req.body;
        const userId = req.user?.userId;

        // Permission check: owner or admin with can_change_info
        const actorInfo = await getParticipantInfo(chatId, userId!);
        if (!actorInfo) return res.status(403).json({ error: 'Нет доступа к этому чату' });
        if (!hasRight(actorInfo, 'can_change_info')) {
            return res.status(403).json({ error: 'Нет прав на изменение информации о чате' });
        }

        // Build update object
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (avatar !== undefined) updateData.avatar = avatar;

        const { data: updated, error } = await supabase
            .from('chats')
            .update(updateData)
            .eq('id', chatId)
            .select('id, name, description, avatar, type, updated_at')
            .single();

        if (error || !updated) {
            return res.status(500).json({ error: 'Не удалось обновить информацию о чате' });
        }

        // Broadcast to all participants
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('chat:updated', {
                    chatId,
                    name: updated.name,
                    description: updated.description,
                    avatar: updated.avatar,
                    updatedBy: userId,
                });
            }
        } catch { /* socket not available */ }

        res.json({
            id: updated.id,
            name: updated.name,
            description: updated.description,
            avatar: updated.avatar,
        });
    } catch (error) {
        console.error('Update chat error:', error);
        res.status(500).json({ error: 'Не удалось обновить информацию о чате' });
    }
});

export default router;
