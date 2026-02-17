import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Helper: format a user row from snake_case to camelCase
function formatUser(u: any) {
    return {
        id: u.id,
        username: u.username,
        firstName: u.first_name,
        lastName: u.last_name,
        avatar: u.avatar,
        isOnline: u.is_online,
        lastSeen: u.last_seen,
    };
}

// Get all friends (accepted friend requests)
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        const { data: rows, error } = await supabase
            .from('friend_requests')
            .select(`
                id,
                sender_id,
                receiver_id,
                status,
                updated_at,
                sender:users!friend_requests_sender_id_fkey(id, username, first_name, last_name, avatar, is_online, last_seen),
                receiver:users!friend_requests_receiver_id_fkey(id, username, first_name, last_name, avatar, is_online, last_seen)
            `)
            .eq('status', 'accepted')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

        if (error) {
            console.error('Get friends error:', error);
            return res.status(500).json({ error: 'Failed to get friends' });
        }

        const friendList = (rows || []).map((row: any) => {
            const isSender = row.sender_id === userId;
            const friendUser = isSender ? row.receiver : row.sender;
            return {
                id: row.id,
                friend: formatUser(friendUser),
                since: row.updated_at,
            };
        });

        res.json({ friends: friendList });
    } catch (error) {
        console.error('Get friends error:', error);
        res.status(500).json({ error: 'Failed to get friends' });
    }
});

// Get pending friend requests (received)
router.get('/requests', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        const { data: rows, error } = await supabase
            .from('friend_requests')
            .select(`
                id,
                sender_id,
                receiver_id,
                status,
                message,
                created_at,
                sender:users!friend_requests_sender_id_fkey(id, username, first_name, last_name, avatar, is_online, last_seen)
            `)
            .eq('receiver_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Get friend requests error:', error);
            return res.status(500).json({ error: 'Failed to get friend requests' });
        }

        const requests = (rows || []).map((row: any) => ({
            id: row.id,
            senderId: row.sender_id,
            receiverId: row.receiver_id,
            status: row.status,
            message: row.message,
            createdAt: row.created_at,
            sender: formatUser(row.sender),
        }));

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
        const { data: receiver, error: findError } = await supabase
            .from('users')
            .select('id, username')
            .eq('username', username)
            .single();

        if (findError || !receiver) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (receiver.id === senderId) {
            return res.status(400).json({ error: 'Cannot send friend request to yourself' });
        }

        // Check existing request
        const { data: existing } = await supabase
            .from('friend_requests')
            .select('id, status')
            .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiver.id}),and(sender_id.eq.${receiver.id},receiver_id.eq.${senderId})`)
            .limit(1);

        if (existing && existing.length > 0) {
            if (existing[0].status === 'accepted') {
                return res.status(400).json({ error: 'You are already friends' });
            }
            if (existing[0].status === 'pending') {
                return res.status(400).json({ error: 'Friend request already sent' });
            }
        }

        // Create friend request
        const { data: created, error: createError } = await supabase
            .from('friend_requests')
            .insert({
                sender_id: senderId,
                receiver_id: receiver.id,
                message: message || null,
            })
            .select(`
                id,
                sender_id,
                receiver_id,
                status,
                message,
                created_at,
                sender:users!friend_requests_sender_id_fkey(id, username, first_name, last_name, avatar),
                receiver:users!friend_requests_receiver_id_fkey(id, username, first_name, last_name, avatar)
            `)
            .single();

        if (createError || !created) {
            console.error('Create friend request error:', createError);
            return res.status(500).json({ error: 'Failed to send friend request' });
        }

        res.status(201).json({
            message: 'Friend request sent successfully',
            request: {
                id: created.id,
                senderId: created.sender_id,
                receiverId: created.receiver_id,
                status: created.status,
                sender: formatUser(created.sender),
                receiver: formatUser(created.receiver),
            },
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

        // Verify request exists and belongs to user
        const { data: request, error: findError } = await supabase
            .from('friend_requests')
            .select('id, sender_id, receiver_id, status')
            .eq('id', requestId)
            .eq('receiver_id', userId)
            .eq('status', 'pending')
            .single();

        if (findError || !request) {
            return res.status(404).json({ error: 'Friend request not found' });
        }

        // Update status
        const { error: updateError } = await supabase
            .from('friend_requests')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        if (updateError) {
            console.error('Accept friend request error:', updateError);
            return res.status(500).json({ error: 'Failed to accept friend request' });
        }

        // Add to contacts
        await supabase.from('contacts').insert([
            { user_id: request.sender_id, contact_id: userId },
            { user_id: userId, contact_id: request.sender_id },
        ]);

        // Get sender info for response
        const { data: sender } = await supabase
            .from('users')
            .select('id, username, first_name, last_name, avatar, is_online, last_seen')
            .eq('id', request.sender_id)
            .single();

        res.json({
            message: 'Friend request accepted',
            friend: sender ? formatUser(sender) : null,
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

        const { data: request, error: findError } = await supabase
            .from('friend_requests')
            .select('id')
            .eq('id', requestId)
            .eq('receiver_id', userId)
            .eq('status', 'pending')
            .single();

        if (findError || !request) {
            return res.status(404).json({ error: 'Friend request not found' });
        }

        await supabase
            .from('friend_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        res.json({ message: 'Friend request rejected' });
    } catch (error) {
        console.error('Reject friend request error:', error);
        res.status(500).json({ error: 'Failed to reject friend request' });
    }
});

// Cancel sent friend request (must be before /:friendId to avoid route conflict)
router.delete('/request/:requestId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const { requestId } = req.params;

        const { data: request, error: findError } = await supabase
            .from('friend_requests')
            .select('id')
            .eq('id', requestId)
            .eq('sender_id', userId)
            .eq('status', 'pending')
            .single();

        if (findError || !request) {
            return res.status(404).json({ error: 'Friend request not found' });
        }

        await supabase
            .from('friend_requests')
            .delete()
            .eq('id', requestId);

        res.json({ message: 'Friend request cancelled' });
    } catch (error) {
        console.error('Cancel friend request error:', error);
        res.status(500).json({ error: 'Failed to cancel friend request' });
    }
});

// Remove friend
router.delete('/:friendId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const { friendId } = req.params;

        // Delete friend request
        await supabase
            .from('friend_requests')
            .delete()
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${friendId},status.eq.accepted),and(sender_id.eq.${friendId},receiver_id.eq.${userId},status.eq.accepted)`);

        // Delete contacts
        await supabase
            .from('contacts')
            .delete()
            .or(`and(user_id.eq.${userId},contact_id.eq.${friendId}),and(user_id.eq.${friendId},contact_id.eq.${userId})`);

        res.json({ message: 'Friend removed successfully' });
    } catch (error) {
        console.error('Remove friend error:', error);
        res.status(500).json({ error: 'Failed to remove friend' });
    }
});

// Get sent friend requests
router.get('/sent-requests', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        const { data: rows, error } = await supabase
            .from('friend_requests')
            .select(`
                id,
                sender_id,
                receiver_id,
                status,
                created_at,
                receiver:users!friend_requests_receiver_id_fkey(id, username, first_name, last_name, avatar, is_online, last_seen)
            `)
            .eq('sender_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Get sent requests error:', error);
            return res.status(500).json({ error: 'Failed to get sent requests' });
        }

        const requests = (rows || []).map((row: any) => ({
            id: row.id,
            senderId: row.sender_id,
            receiverId: row.receiver_id,
            status: row.status,
            createdAt: row.created_at,
            receiver: formatUser(row.receiver),
        }));

        res.json({ requests });
    } catch (error) {
        console.error('Get sent requests error:', error);
        res.status(500).json({ error: 'Failed to get sent requests' });
    }
});

export default router;
