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

// Search users by username
router.get('/search', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { query } = req.query;
        
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const searchQuery = typeof query === 'string' ? query.toLowerCase() : '';

        const users = await prisma.user.findMany({
            where: {
                username: {
                    contains: searchQuery,
                },
                id: {
                    not: req.user?.userId, // Exclude current user
                },
            },
            select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
                bio: true,
                isOnline: true,
                lastSeen: true,
            },
            take: 20, // Limit results
        });

        res.json({ users });
    } catch (error) {
        console.error('User search error:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// Get user by username
router.get('/:username', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { username } = req.params;
        if (typeof username !== 'string') {
            return res.status(400).json({ error: 'Invalid username' });
        }

        const user = await prisma.user.findUnique({
            where: { username },
            select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
                bio: true,
                isOnline: true,
                lastSeen: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Get current user profile
router.get('/me/profile', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user?.userId },
            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
                bio: true,
                phone: true,
                isOnline: true,
                lastSeen: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update user profile
router.patch('/me/profile', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { firstName, lastName, bio, avatar } = req.body;

        const user = await prisma.user.update({
            where: { id: req.user?.userId },
            data: {
                firstName,
                lastName,
                bio,
                avatar,
            },
            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
                bio: true,
                phone: true,
            },
        });

        res.json({ user });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

export default router;
