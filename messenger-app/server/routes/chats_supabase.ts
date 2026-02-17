import { Router } from 'express';
import type { Application } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

function getIO(req: AuthRequest) {
    return (req.app as Application).get('io');
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

        // Получаем чаты с участниками
        const { data: chats, error } = await supabase
            .from('chats')
            .select(`
                id,
                name,
                type,
                created_at,
                updated_at,
                created_by,
                chat_participants(
                    user_id,
                    joined_at,
                    users(
                        id,
                        username,
                        first_name,
                        last_name,
                        avatar,
                        is_online,
                        last_seen
                    )
                )
            `)
            .in('id', chatIds)
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Get chats error:', error);
            return res.status(500).json({ error: 'Failed to get chats' });
        }

        // Fetch last message per chat
        const lastMessageMap = new Map<string, any>();
        for (const chatId of chatIds) {
            try {
                const { data: msgs } = await supabase
                    .from('messages')
                    .select(`
                        id, chat_id, content, type, file_url, created_at, sender_id, is_deleted,
                        users(id, username, first_name, last_name, avatar)
                    `)
                    .eq('chat_id', chatId)
                    .eq('is_deleted', false)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (msgs && msgs.length > 0) {
                    lastMessageMap.set(chatId, msgs[0]);
                }
            } catch { /* skip */ }
        }

        // Try to fetch read status (table may not exist)
        const readMap = new Map<string, string>();
        try {
            const { data: readRows } = await supabase
                .from('message_reads')
                .select('chat_id, last_read_message_id')
                .eq('user_id', userId)
                .in('chat_id', chatIds);

            if (readRows) {
                for (const row of readRows) {
                    readMap.set(row.chat_id, row.last_read_message_id);
                }
            }
        } catch {
            // message_reads table may not exist yet — skip unread counts
        }

        // Форматируем данные под фронтенд Chat type
        const formattedChats = await Promise.all((chats || []).map(async (chat: any) => {
            const participants = (chat.chat_participants || []).map((p: any) => ({
                userId: p.user_id,
                chatId: chat.id,
                role: chat.created_by === p.user_id ? 'owner' : 'member',
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

            // Для private чатов берем имя собеседника как title
            const otherParticipants = participants.filter((p: any) => p.userId !== userId);
            let title = chat.name;
            if (!title && chat.type === 'private' && otherParticipants.length > 0) {
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
                        id: rawLastMsg.users.id,
                        username: rawLastMsg.users.username,
                        firstName: rawLastMsg.users.first_name,
                        lastName: rawLastMsg.users.last_name,
                        avatar: rawLastMsg.users.avatar,
                    } : null,
                };
            }

            // Calculate unread count (graceful — defaults to 0 on any error)
            let unreadCount = 0;
            try {
                const lastReadId = readMap.get(chat.id);
                if (lastReadId) {
                    const { data: readMsg } = await supabase
                        .from('messages')
                        .select('created_at')
                        .eq('id', lastReadId)
                        .single();
                    if (readMsg) {
                        const { count } = await supabase
                            .from('messages')
                            .select('id', { count: 'exact', head: true })
                            .eq('chat_id', chat.id)
                            .eq('is_deleted', false)
                            .neq('sender_id', userId)
                            .gt('created_at', readMsg.created_at);
                        unreadCount = count || 0;
                    }
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

            return {
                id: chat.id,
                type: chat.type,
                title,
                avatar: otherParticipants.length > 0 ? otherParticipants[0].user.avatar : null,
                createdAt: chat.created_at,
                lastMessage,
                unreadCount,
                participants,
                isPinned: false,
                isMuted: false,
            };
        }));

        res.json(formattedChats);
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Failed to get chats' });
    }
});

// Find or create private chat with a specific user
router.post('/private', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { userId: targetUserId } = req.body;
        const userId = req.user?.userId;

        if (!targetUserId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        if (targetUserId === userId) {
            return res.status(400).json({ error: 'Cannot create chat with yourself' });
        }

        // Find existing private chat between the two users
        const { data: myChats } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', userId);

        const { data: theirChats } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', targetUserId);

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
        }

        // Fetch full chat with participants
        const { data: chat, error } = await supabase
            .from('chats')
            .select(`
                id, name, type, created_at, updated_at, created_by,
                chat_participants(
                    user_id, joined_at,
                    users(id, username, first_name, last_name, avatar, is_online, last_seen)
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
            role: chat.created_by === p.user_id ? 'owner' : 'member',
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
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { name, title, type = 'private', participantIds } = req.body;
        const userId = req.user?.userId;

        if (!participantIds || participantIds.length === 0) {
            return res.status(400).json({ error: 'Participants are required' });
        }

        if (type === 'private' && participantIds.length > 1) {
            return res.status(400).json({ error: 'Private chat can have only 2 participants' });
        }

        const chatTitle = title || name || null;

        // Создаем чат
        const { data: chat, error: chatError } = await supabase
            .from('chats')
            .insert({
                name: type === 'group' ? chatTitle : null,
                type,
                created_by: userId
            })
            .select()
            .single();

        if (chatError || !chat) {
            console.error('Create chat error:', chatError);
            return res.status(500).json({ error: 'Failed to create chat' });
        }

        // Добавляем создателя + участников
        const participants = [
            { chat_id: chat.id, user_id: userId },
            ...participantIds.map((id: string) => ({ chat_id: chat.id, user_id: id }))
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

        // Получаем данные участников для ответа
        const { data: participantData } = await supabase
            .from('chat_participants')
            .select(`
                user_id,
                joined_at,
                users(
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
            role: userId === p.user_id ? 'owner' : 'member',
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
            avatar: null,
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
                is_deleted,
                created_at,
                updated_at,
                sender_id,
                users(
                    id,
                    username,
                    first_name,
                    last_name,
                    avatar
                )
            `)
            .eq('chat_id', chatId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true })
            .range(offset, offset + limit - 1);

        if (messagesError) {
            console.error('Get messages error:', messagesError);
            return res.status(500).json({ error: 'Failed to get messages' });
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
                    users(
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
        const formattedMessages = (messages || []).map((msg: any) => {
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
            return {
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
                sender: msg.users ? {
                    id: msg.users.id,
                    username: msg.users.username,
                    firstName: msg.users.first_name,
                    lastName: msg.users.last_name,
                    avatar: msg.users.avatar
                } : null
            };
        });

        res.json(formattedMessages);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Send message
router.post('/:chatId/messages', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const { content, type = 'text', fileUrl, replyToId } = req.body;
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
        const insertData: Record<string, unknown> = {
            chat_id: chatId,
            sender_id: userId,
            content: content || '',
            type,
        };
        if (fileUrl) insertData.file_url = fileUrl;
        if (replyToId) insertData.reply_to_id = replyToId;

        const { data: message, error: messageError } = await supabase
            .from('messages')
            .insert(insertData)
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
                users(
                    id,
                    username,
                    first_name,
                    last_name,
                    avatar
                )
            `)
            .single();

        if (messageError || !message) {
            console.error('Send message error:', messageError);
            return res.status(500).json({ error: 'Failed to send message' });
        }

        // Обновляем время последнего сообщения в чате
        await supabase
            .from('chats')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', chatId);

        // Форматируем под фронтенд Message type
        const formattedMessage = {
            id: message.id,
            chatId: message.chat_id,
            senderId: message.sender_id,
            type: message.type,
            content: message.content,
            mediaUrl: message.file_url,
            replyTo: message.reply_to_id,
            timestamp: message.created_at,
            status: 'sent',
            isEdited: false,
            sender: message.users ? {
                id: message.users.id,
                username: message.users.username,
                firstName: message.users.first_name,
                lastName: message.users.last_name,
                avatar: message.users.avatar
            } : null
        };

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
router.patch('/:chatId/messages/:messageId', authenticateToken, async (req: AuthRequest, res) => {
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
                users(
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
            return res.status(500).json({ error: 'Failed to edit message' });
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
            return res.status(403).json({ error: 'Can only delete own messages' });
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

// Mark messages as read
router.post('/:chatId/read', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { chatId } = req.params;
        const { messageId } = req.body;
        const userId = req.user?.userId;

        if (!messageId) {
            return res.status(400).json({ error: 'messageId is required' });
        }

        // Upsert to message_reads
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
            console.error('Mark read error:', error);
            return res.status(500).json({ error: 'Failed to mark as read' });
        }

        // Emit via Socket.io
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('message:read', { userId, chatId, messageId });
            }
        } catch { /* socket not available */ }

        res.json({ success: true });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

export default router;
