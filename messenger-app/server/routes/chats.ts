import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { telegramService } from '../services/telegram.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL || 'file:./dev.db'
});

// Validation schemas
const createChatSchema = z.object({
    type: z.enum(['private', 'group', 'channel']),
    title: z.string().optional(),
    participantIds: z.array(z.string()).optional(),
});

const sendMessageSchema = z.object({
    chatId: z.string(),
    content: z.string().min(1).max(4096),
    type: z.enum(['text', 'image', 'video', 'voice', 'file']).default('text'),
    replyToId: z.string().optional(),
});

// GET /api/chats - Get all chats for current user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const chats = await prisma.chat.findMany({
            where: {
                participants: {
                    some: {
                        userId: userId
                    }
                }
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                firstName: true,
                                lastName: true,
                                avatar: true,
                                isOnline: true,
                                lastSeen: true,
                            }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: {
                            select: {
                                id: true,
                                username: true,
                                firstName: true,
                                avatar: true,
                            }
                        }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        // Format response
        const formattedChats = chats.map(chat => ({
            id: chat.id,
            type: chat.type,
            title: chat.title,
            avatar: chat.avatar,
            participants: chat.participants,
            lastMessage: chat.messages[0] || null,
            unreadCount: 0, // TODO: Calculate unread count
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        }));

        res.json(formattedChats);
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Failed to fetch chats' });
    }
});

// GET /api/chats/:id/messages - Get messages for a chat
router.get('/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const chatId = req.params.id as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify user is participant
        const participant = await prisma.chatParticipant.findFirst({
            where: { chatId, userId }
        });

        if (!participant) {
            return res.status(403).json({ error: 'Not a participant of this chat' });
        }

        const messages = await prisma.message.findMany({
            where: { chatId },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    }
                },
                replyTo: {
                    include: {
                        sender: {
                            select: {
                                id: true,
                                username: true,
                                firstName: true,
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        });

        res.json(messages.reverse());
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// POST /api/chats/:id/messages - Send message to chat
router.post('/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const chatId = req.params.id as string;
        const { content, type, replyToId } = sendMessageSchema.parse(req.body);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify user is participant
        const participant = await prisma.chatParticipant.findFirst({
            where: { chatId, userId }
        });

        if (!participant) {
            return res.status(403).json({ error: 'Not a participant of this chat' });
        }

        // Create message
        const message = await prisma.message.create({
            data: {
                chatId,
                senderId: userId,
                content,
                type,
                replyToId,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    }
                },
                replyTo: {
                    include: {
                        sender: {
                            select: {
                                id: true,
                                username: true,
                                firstName: true,
                            }
                        }
                    }
                }
            }
        });

        // Update chat updatedAt
        await prisma.chat.update({
            where: { id: chatId },
            data: { updatedAt: new Date() }
        });

        res.status(201).json(message);
    } catch (error) {
        console.error('Send message error:', error);
        const message = error instanceof Error ? error.message : 'Failed to send message';
        res.status(400).json({ error: message });
    }
});

// POST /api/chats - Create new chat
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const { type, title, participantIds } = createChatSchema.parse(req.body);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Create chat with participants
        const chat = await prisma.chat.create({
            data: {
                type,
                title,
                creatorId: userId,
                participants: {
                    create: [
                        { userId, role: 'owner' },
                        ...(participantIds || []).map(id => ({
                            userId: id,
                            role: 'member' as const
                        }))
                    ]
                }
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                firstName: true,
                                lastName: true,
                                avatar: true,
                            }
                        }
                    }
                }
            }
        });

        res.status(201).json(chat);
    } catch (error) {
        console.error('Create chat error:', error);
        const message = error instanceof Error ? error.message : 'Failed to create chat';
        res.status(400).json({ error: message });
    }
});

// GET /api/chats/sync/telegram - Sync Telegram dialogs
router.get('/sync/telegram', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Get user's Telegram session
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user?.telegramSession) {
            return res.status(400).json({ error: 'Telegram not connected' });
        }

        // Initialize Telegram client (will connect if not already connected)
        await telegramService.initializeClient(userId, user.telegramSession);

        // Get dialogs from Telegram
        const dialogs = await telegramService.getDialogs(userId, 50);

        // TODO: Sync dialogs with local database
        // For now, return raw dialogs
        res.json({
            success: true,
            dialogs: dialogs,
            message: 'Telegram sync started'
        });
    } catch (error) {
        console.error('Telegram sync error:', error);
        const message = error instanceof Error ? error.message : 'Failed to sync with Telegram';
        res.status(500).json({ error: message });
    }
});

export default router;
