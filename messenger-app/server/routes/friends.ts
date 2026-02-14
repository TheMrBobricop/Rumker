import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});

// Get all friends (accepted friend requests)
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        // Get accepted friend requests where user is either sender or receiver
        const friends = await prisma.friendRequest.findMany({
            where: {
                OR: [
                    { senderId: userId, status: 'accepted' },
                    { receiverId: userId, status: 'accepted' },
                ],
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        isOnline: true,
                        lastSeen: true,
                    },
                },
                receiver: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        isOnline: true,
                        lastSeen: true,
                    },
                },
            },
        });

        // Map to return the other user (not the current user)
        const friendList = friends.map((friend: typeof friends[0]) => {
            const isSender = friend.senderId === userId;
            return {
                id: friend.id,
                friend: isSender ? friend.receiver : friend.sender,
                since: friend.updatedAt,
            };
        });

        res.json({ friends: friendList });
    } catch (error) {
        console.error('Get friends error:', error);
        res.status(500).json({ error: 'Failed to get friends' });
    }
});

// Get pending friend requests
router.get('/requests', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        const requests = await prisma.friendRequest.findMany({
            where: {
                receiverId: userId,
                status: 'pending',
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        isOnline: true,
                        lastSeen: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        res.json({ requests });
    } catch (error) {
        console.error('Get friend requests error:', error);
        res.status(500).json({ error: 'Failed to get friend requests' });
    }
});

// Send friend request
router.post('/request', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const senderId = req.user?.userId;
        const { username, message } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        // Find user by username
        const receiver = await prisma.user.findUnique({
            where: { username },
        });

        if (!receiver) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (receiver.id === senderId) {
            return res.status(400).json({ error: 'Cannot send friend request to yourself' });
        }

        // Check if request already exists
        const existingRequest = await prisma.friendRequest.findFirst({
            where: {
                OR: [
                    { senderId, receiverId: receiver.id },
                    { senderId: receiver.id, receiverId: senderId },
                ],
            },
        });

        if (existingRequest) {
            if (existingRequest.status === 'accepted') {
                return res.status(400).json({ error: 'You are already friends' });
            }
            if (existingRequest.status === 'pending') {
                return res.status(400).json({ error: 'Friend request already sent' });
            }
        }

        // Create friend request
        const friendRequest = await prisma.friendRequest.create({
            data: {
                senderId,
                receiverId: receiver.id,
                message: message || null,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    },
                },
                receiver: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    },
                },
            },
        });

        res.status(201).json({
            message: 'Friend request sent successfully',
            request: friendRequest,
        });
    } catch (error) {
        console.error('Send friend request error:', error);
        res.status(500).json({ error: 'Failed to send friend request' });
    }
});

// Accept friend request
router.post('/accept/:requestId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const { requestId } = req.params;

        const friendRequest = await prisma.friendRequest.findFirst({
            where: {
                id: requestId,
                receiverId: userId,
                status: 'pending',
            },
        });

        if (!friendRequest) {
            return res.status(404).json({ error: 'Friend request not found' });
        }

        // Update request status
        const updated = await prisma.friendRequest.update({
            where: { id: requestId },
            data: { status: 'accepted' },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        isOnline: true,
                        lastSeen: true,
                    },
                },
            },
        });

        // Also add to contacts
        if (friendRequest.senderId && userId) {
            await prisma.contact.create({
                data: {
                    userId: friendRequest.senderId,
                    contactId: userId,
                },
            });

            await prisma.contact.create({
                data: {
                    userId,
                    contactId: friendRequest.senderId,
                },
            });
        }

        res.json({
            message: 'Friend request accepted',
            friend: updated.sender,
        });
    } catch (error) {
        console.error('Accept friend request error:', error);
        res.status(500).json({ error: 'Failed to accept friend request' });
    }
});

// Reject friend request
router.post('/reject/:requestId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const { requestId } = req.params;

        const friendRequest = await prisma.friendRequest.findFirst({
            where: {
                id: requestId,
                receiverId: userId,
                status: 'pending',
            },
        });

        if (!friendRequest) {
            return res.status(404).json({ error: 'Friend request not found' });
        }

        await prisma.friendRequest.update({
            where: { id: requestId },
            data: { status: 'rejected' },
        });

        res.json({ message: 'Friend request rejected' });
    } catch (error) {
        console.error('Reject friend request error:', error);
        res.status(500).json({ error: 'Failed to reject friend request' });
    }
});

// Remove friend
router.delete('/:friendId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const { friendId } = req.params;

        // Delete friend request
        await prisma.friendRequest.deleteMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: friendId, status: 'accepted' },
                    { senderId: friendId, receiverId: userId, status: 'accepted' },
                ],
            },
        });

        // Delete contacts
        await prisma.contact.deleteMany({
            where: {
                OR: [
                    { userId, contactId: friendId },
                    { userId: friendId, contactId: userId },
                ],
            },
        });

        res.json({ message: 'Friend removed successfully' });
    } catch (error) {
        console.error('Remove friend error:', error);
        res.status(500).json({ error: 'Failed to remove friend' });
    }
});

// Cancel sent friend request
router.delete('/request/:requestId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const { requestId } = req.params;

        const friendRequest = await prisma.friendRequest.findFirst({
            where: {
                id: requestId,
                senderId: userId,
                status: 'pending',
            },
        });

        if (!friendRequest) {
            return res.status(404).json({ error: 'Friend request not found' });
        }

        await prisma.friendRequest.delete({
            where: { id: requestId },
        });

        res.json({ message: 'Friend request cancelled' });
    } catch (error) {
        console.error('Cancel friend request error:', error);
        res.status(500).json({ error: 'Failed to cancel friend request' });
    }
});

// Get sent friend requests
router.get('/sent-requests', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        const requests = await prisma.friendRequest.findMany({
            where: {
                senderId: userId,
                status: 'pending',
            },
            include: {
                receiver: {
                    select: {
                        id: true,
                        username: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        isOnline: true,
                        lastSeen: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        res.json({ requests });
    } catch (error) {
        console.error('Get sent requests error:', error);
        res.status(500).json({ error: 'Failed to get sent requests' });
    }
});

export default router;
