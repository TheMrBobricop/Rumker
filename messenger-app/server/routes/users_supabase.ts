import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { validateBody, updateProfileSchema } from '../lib/validation.js';

const router = Router();

// Sanitize a string for use inside PostgREST filter values.
// Escapes characters that have special meaning in PostgREST syntax.
function sanitizeFilterValue(val: string): string {
    return val.replace(/[\\%_"',().*]/g, '');
}

// Search users by username
router.get('/search', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const query = typeof req.query.query === 'string' ? req.query.query : '';

        let request = supabase
            .from('users')
            .select(`
                id,
                username,
                first_name,
                last_name,
                avatar,
                bio,
                is_online,
                last_seen
            `)
            .neq('id', req.user?.userId)
            .limit(20);

        if (query) {
            let q = query.toLowerCase().trim();
            if (q.startsWith('@')) q = q.slice(1);
            q = sanitizeFilterValue(q);
            if (q.length === 0) {
                return res.json({ users: [] });
            }
            request = request.or(`username.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
        }

        const { data: users, error } = await request;

        if (error) {
            console.error('Supabase search error:', error);
            return res.status(500).json({ error: 'Failed to search users' });
        }

        // Преобразуем snake_case в camelCase для frontend
        const formattedUsers = users?.map(user => ({
            id: user.id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            bio: user.bio,
            isOnline: user.is_online,
            lastSeen: user.last_seen
        })) || [];

        res.json({ users: formattedUsers });
    } catch (error) {
        console.error('User search error:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// Get user by ID
router.get('/id/:userId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { userId } = req.params;
        if (typeof userId !== 'string') {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select(`
                id,
                username,
                first_name,
                last_name,
                avatar,
                bio,
                phone,
                is_online,
                last_seen
            `)
            .eq('id', userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const formattedUser = {
            id: user.id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            bio: user.bio,
            phone: user.phone,
            isOnline: user.is_online,
            lastSeen: user.last_seen
        };

        res.json({ user: formattedUser });
    } catch (error) {
        console.error('Get user by ID error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Get current user profile (MUST be before /:username to avoid matching "me" as username)
router.get('/me/profile', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select(`
                id,
                username,
                email,
                first_name,
                last_name,
                avatar,
                bio,
                phone,
                is_online,
                last_seen
            `)
            .eq('id', req.user?.userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const formattedUser = {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            bio: user.bio,
            phone: user.phone,
            isOnline: user.is_online,
            lastSeen: user.last_seen
        };

        res.json({ user: formattedUser });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Get user by username (AFTER /me/profile to prevent "me" matching as username)
router.get('/:username', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { username } = req.params;
        if (typeof username !== 'string') {
            return res.status(400).json({ error: 'Invalid username' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select(`
                id,
                username,
                first_name,
                last_name,
                avatar,
                bio,
                is_online,
                last_seen
            `)
            .eq('username', username)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const formattedUser = {
            id: user.id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            bio: user.bio,
            isOnline: user.is_online,
            lastSeen: user.last_seen
        };

        res.json({ user: formattedUser });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Update user profile
router.patch('/me/profile', authenticateToken, validateBody(updateProfileSchema), async (req: AuthRequest, res) => {
    try {
        const { firstName, lastName, bio, avatar } = req.body;

        const { data: user, error } = await supabase
            .from('users')
            .update({
                first_name: firstName,
                last_name: lastName,
                bio,
                avatar,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.user?.userId)
            .select(`
                id,
                username,
                email,
                first_name,
                last_name,
                avatar,
                bio,
                phone
            `)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const formattedUser = {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            bio: user.bio,
            phone: user.phone
        };

        res.json({ user: formattedUser });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

export default router;
