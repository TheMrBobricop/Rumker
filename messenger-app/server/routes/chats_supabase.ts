import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Типы для данных из Supabase
interface User {
    id: string;
    username: string;
    first_name: string;
    last_name: string | null;
    avatar: string | null;
    is_online: boolean;
    last_seen: string;
}

interface ChatParticipant {
    user_id: string;
    joined_at: string;
    last_read_at: string;
    users: User;
}

interface Chat {
    id: string;
    name: string | null;
    type: 'private' | 'group';
    created_at: string;
    updated_at: string;
    created_by: string;
    chat_participants: ChatParticipant[];
}

interface Message {
    id: string;
    content: string;
    type: 'text' | 'image' | 'file' | 'audio';
    file_url: string | null;
    reply_to_id: string | null;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
    sender_id: string;
    users: {
        id: string;
        username: string;
        first_name: string;
        last_name: string | null;
        avatar: string | null;
    };
}

// Get all chats for current user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        // Получаем все чаты где пользователь участник
        const { data: chats, error } = await supabase
            .from('chats')
            .select(`
                id,
                name,
                type,
                created_at,
                updated_at,
                created_by,
                chat_participants!inner(
                    user_id,
                    joined_at,
                    last_read_at,
                    users!inner(
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
            .eq('chat_participants.user_id', userId)
            .order('chats.updated_at', { ascending: false });

        if (error) {
            console.error('Get chats error:', error);
            return res.status(500).json({ error: 'Failed to get chats' });
        }

        // Форматируем данные
        const formattedChats = chats?.data?.map((chat: any) => {
            const otherParticipants = chat.chat_participants?.filter((p: any) => p.user_id !== userId) || [];
            const lastMessage = getLastMessage(chat.id); // TODO: получить последнее сообщение
            
            return {
                id: chat.id,
                name: chat.name || getChatName(otherParticipants),
                type: chat.type,
                createdAt: chat.created_at,
                updatedAt: chat.updated_at,
                createdBy: chat.created_by,
                participants: otherParticipants.map((p: any) => ({
                    id: p.users.id,
                    username: p.users.username,
                    firstName: p.users.first_name,
                    lastName: p.users.last_name,
                    avatar: p.users.avatar,
                    isOnline: p.users.is_online,
                    lastSeen: p.users.last_seen,
                    joinedAt: p.joined_at,
                    lastReadAt: p.last_read_at
                })),
                unreadCount: getUnreadCount(userId, chat.id), // TODO: посчитать непрочитанные
                lastMessage: lastMessage
            };
        }) || [];

        res.json({ chats: formattedChats });
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Failed to get chats' });
    }
});

// Create new chat
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { name, type = 'private', participantIds } = req.body;
        const userId = req.user?.userId;

        if (!participantIds || participantIds.length === 0) {
            return res.status(400).json({ error: 'Participants are required' });
        }

        if (type === 'private' && participantIds.length > 1) {
            return res.status(400).json({ error: 'Private chat can have only 2 participants' });
        }

        // Создаем чат
        const { data: chat, error: chatError } = await supabase
            .from('chats')
            .insert({
                name: type === 'group' ? name : null,
                type,
                created_by: userId
            })
            .select()
            .single();

        if (chatError || !chat) {
            console.error('Create chat error:', chatError);
            return res.status(500).json({ error: 'Failed to create chat' });
        }

        // Добавляем создателя в участники
        const participants = [
            { chat_id: chat.id, user_id: userId },
            ...participantIds.map((id: string) => ({ chat_id: chat.id, user_id: id }))
        ];

        const { error: participantsError } = await supabase
            .from('chat_participants')
            .insert(participants);

        if (participantsError) {
            console.error('Add participants error:', participantsError);
            return res.status(500).json({ error: 'Failed to add participants' });
        }

        res.status(201).json({ 
            chat: {
                id: chat.id,
                name: chat.name,
                type: chat.type,
                createdAt: chat.created_at,
                updatedAt: chat.updated_at
            }
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
        const { page = 1, limit = 50 } = req.query;
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
        const offset = (Number(page) - 1) * Number(limit);
        
        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select(`
                id,
                content,
                type,
                file_url,
                reply_to_id,
                is_deleted,
                created_at,
                updated_at,
                sender_id,
                users!inner(
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
            .range(offset, Number(limit));

        if (messagesError) {
            console.error('Get messages error:', messagesError);
            return res.status(500).json({ error: 'Failed to get messages' });
        }

        // Форматируем сообщения
        const formattedMessages = messages?.data?.map((msg: Message) => ({
            id: msg.id,
            content: msg.content,
            type: msg.type,
            fileUrl: msg.file_url,
            replyToId: msg.reply_to_id,
            isDeleted: msg.is_deleted,
            createdAt: msg.created_at,
            updatedAt: msg.updated_at,
            sender: {
                id: msg.users.id,
                username: msg.users.username,
                firstName: msg.users.first_name,
                lastName: msg.users.last_name,
                avatar: msg.users.avatar
            }
        })) || [];

        res.json({ 
            messages: formattedMessages,
            hasMore: messages.length === Number(limit),
            page: Number(page)
        });
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
        const { data: message, error: messageError } = await supabase
            .from('messages')
            .insert({
                chat_id: chatId,
                sender_id: userId,
                content,
                type,
                file_url: fileUrl,
                reply_to_id: replyToId
            })
            .select(`
                id,
                content,
                type,
                file_url,
                reply_to_id,
                created_at,
                updated_at,
                sender_id,
                users!inner(
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

        // Форматируем ответ
        const formattedMessage = {
            id: message.id,
            content: message.content,
            type: message.type,
            fileUrl: message.file_url,
            replyToId: message.reply_to_id,
            isDeleted: message.is_deleted,
            createdAt: message.created_at,
            updatedAt: message.updated_at,
            sender: {
                id: message.users.id,
                username: message.users.username,
                firstName: message.users.first_name,
                lastName: message.users.last_name,
                avatar: message.users.avatar
            }
        };

        // TODO: Отправить через WebSocket реалтайм
        // io.to(chatId).emit('new_message', formattedMessage);

        res.status(201).json({ message: formattedMessage });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Вспомогательные функции
function getChatName(participants: ChatParticipant[]): string {
    if (participants.length === 1) {
        const user = participants[0].users;
        return `${user.first_name || user.username} ${user.last_name || ''}`.trim();
    }
    return participants.map(p => p.users.first_name || p.users.username).join(', ');
}

function getLastMessage(chatId: string): any {
    // TODO: реализовать получение последнего сообщения
    return null;
}

function getUnreadCount(userId: string, chatId: string): number {
    // TODO: посчитать непрочитанные сообщения
    return 0;
}

export default router;
