import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { validateBody, createVoiceChannelSchema, updateVoiceChannelSchema, renameCategorySchema, deleteCategorySchema, reorderCategoriesSchema, reorderChannelsSchema } from '../lib/validation.js';
import { getParticipantInfo } from '../lib/permissions.js';

/** Verify the user is a participant of the chat. Returns true if authorized. */
async function requireChatMember(chatId: string, userId: string, res: any): Promise<boolean> {
    const info = await getParticipantInfo(chatId, userId);
    if (!info) {
        res.status(403).json({ error: 'Access denied' });
        return false;
    }
    return true;
}

const router = Router();

// GET /voice-channels/all — list all voice channels across user's group chats
router.get('/all', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        // Get all group chats the user participates in
        const { data: participations, error: pErr } = await supabase
            .from('chat_participants')
            .select('chat_id, chats:chat_id ( id, name, type, avatar )')
            .eq('user_id', userId);

        if (pErr) {
            return res.status(500).json({ error: pErr.message });
        }

        // Include both group and private chats for voice channels
        const groupChats = (participations || [])
            .filter((p: any) => p.chats?.id)
            .map((p: any) => p.chats);

        if (groupChats.length === 0) {
            return res.json([]);
        }

        const chatIds = groupChats.map((c: any) => c.id);

        // Load all voice channels for these chats
        const { data: channels, error: chErr } = await supabase
            .from('voice_channels')
            .select(`
                id, chat_id, name, description, position, category,
                max_participants, is_locked, created_by, created_at,
                voice_channel_participants (
                    user_id, is_muted, is_deafened, joined_at,
                    users:user_id ( id, username, first_name, last_name, avatar )
                )
            `)
            .in('chat_id', chatIds)
            .order('position');

        if (chErr) {
            return res.status(500).json({ error: chErr.message });
        }

        // Group channels by chatId, include chat info
        const result = groupChats.map((chat: any) => ({
            chatId: chat.id,
            chatName: chat.name,
            chatAvatar: chat.avatar,
            channels: (channels || [])
                .filter((ch: any) => ch.chat_id === chat.id)
                .map((ch: any) => ({
                    id: ch.id,
                    chatId: ch.chat_id,
                    name: ch.name,
                    description: ch.description,
                    position: ch.position,
                    category: ch.category || 'general',
                    maxParticipants: ch.max_participants,
                    isLocked: ch.is_locked,
                    createdBy: ch.created_by,
                    createdAt: ch.created_at,
                    participants: (ch.voice_channel_participants || []).map((p: any) => ({
                        userId: p.user_id,
                        username: p.users?.username || '',
                        firstName: p.users?.first_name || '',
                        lastName: p.users?.last_name || '',
                        avatar: p.users?.avatar || '',
                        isMuted: p.is_muted,
                        isDeafened: p.is_deafened,
                        isSpeaking: false,
                    })),
                })),
        })).filter((g: any) => g.channels.length > 0);

        res.json(result);
    } catch (err) {
        console.error('[VoiceChannels] GET /all error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /voice-channels?chatId=xxx — list channels for a chat, with participants
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const chatId = req.query.chatId as string;
        const userId = req.user?.userId;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        if (!(await requireChatMember(chatId, userId!, res))) return;

        const { data: channels, error } = await supabase
            .from('voice_channels')
            .select(`
                id, chat_id, name, description, position, category,
                max_participants, is_locked, created_by, created_at,
                voice_channel_participants (
                    user_id, is_muted, is_deafened, joined_at,
                    users:user_id ( id, username, first_name, last_name, avatar )
                )
            `)
            .eq('chat_id', chatId)
            .order('position');

        if (error) {
            console.error('[VoiceChannels] GET error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Transform to frontend-friendly shape
        const result = (channels || []).map((ch: any) => ({
            id: ch.id,
            chatId: ch.chat_id,
            name: ch.name,
            description: ch.description,
            position: ch.position,
            category: ch.category || 'general',
            maxParticipants: ch.max_participants,
            isLocked: ch.is_locked,
            createdBy: ch.created_by,
            createdAt: ch.created_at,
            participants: (ch.voice_channel_participants || []).map((p: any) => ({
                userId: p.user_id,
                username: p.users?.username || '',
                firstName: p.users?.first_name || '',
                lastName: p.users?.last_name || '',
                avatar: p.users?.avatar || '',
                isMuted: p.is_muted,
                isDeafened: p.is_deafened,
                isSpeaking: false,
            })),
        }));

        res.json(result);
    } catch (err) {
        console.error('[VoiceChannels] GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /voice-channels — create a channel
router.post('/', authenticateToken, validateBody(createVoiceChannelSchema), async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const { chatId, name, description, category, maxParticipants, isLocked } = req.body;

        if (!chatId || !name) {
            return res.status(400).json({ error: 'chatId and name are required' });
        }

        if (!(await requireChatMember(chatId, userId!, res))) return;

        // Get max position for ordering
        const { data: existing } = await supabase
            .from('voice_channels')
            .select('position')
            .eq('chat_id', chatId)
            .order('position', { ascending: false })
            .limit(1);

        const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

        const { data: channel, error } = await supabase
            .from('voice_channels')
            .insert({
                chat_id: chatId,
                name,
                description: description || null,
                position: nextPosition,
                category: category || 'general',
                max_participants: maxParticipants || 50,
                is_locked: isLocked || false,
                created_by: userId,
            })
            .select()
            .single();

        if (error) {
            console.error('[VoiceChannels] POST error:', error);
            return res.status(500).json({ error: error.message });
        }

        res.status(201).json({
            id: channel.id,
            chatId: channel.chat_id,
            name: channel.name,
            description: channel.description,
            position: channel.position,
            category: channel.category,
            maxParticipants: channel.max_participants,
            isLocked: channel.is_locked,
            createdBy: channel.created_by,
            createdAt: channel.created_at,
            participants: [],
        });
    } catch (err) {
        console.error('[VoiceChannels] POST error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Category routes MUST be before /:channelId to avoid wildcard matching "categories" ---

// PATCH /voice-channels/categories/rename — rename a category (batch update all channels with old name)
router.patch('/categories/rename', authenticateToken, validateBody(renameCategorySchema), async (req: AuthRequest, res) => {
    try {
        const { chatId, oldName, newName } = req.body;
        const userId = req.user?.userId;
        if (!chatId || !oldName || !newName) {
            return res.status(400).json({ error: 'chatId, oldName, and newName are required' });
        }

        if (!(await requireChatMember(chatId, userId!, res))) return;

        const { data, error } = await supabase
            .from('voice_channels')
            .update({ category: newName })
            .eq('chat_id', chatId)
            .eq('category', oldName)
            .select();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ updated: data?.length || 0 });
    } catch (err) {
        console.error('[VoiceChannels] PATCH /categories/rename error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /voice-channels/categories/reorder — set position of channels within a category
router.patch('/categories/reorder', authenticateToken, validateBody(reorderCategoriesSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId, categoryOrder } = req.body;
        const userId = req.user?.userId;
        if (!chatId || !Array.isArray(categoryOrder)) {
            return res.status(400).json({ error: 'chatId and categoryOrder are required' });
        }

        if (!(await requireChatMember(chatId, userId!, res))) return;

        for (const item of categoryOrder) {
            const basePos = item.position * 100;
            const { data: channels } = await supabase
                .from('voice_channels')
                .select('id, position')
                .eq('chat_id', chatId)
                .eq('category', item.category)
                .order('position');

            if (channels) {
                for (let i = 0; i < channels.length; i++) {
                    await supabase
                        .from('voice_channels')
                        .update({ position: basePos + i })
                        .eq('id', channels[i].id);
                }
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[VoiceChannels] PATCH /categories/reorder error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /voice-channels/categories/delete — delete a category and all its channels
router.post('/categories/delete', authenticateToken, validateBody(deleteCategorySchema), async (req: AuthRequest, res) => {
    try {
        const { chatId, category } = req.body;
        const userId = req.user?.userId;
        if (!chatId || !category) {
            return res.status(400).json({ error: 'chatId and category are required' });
        }

        if (!(await requireChatMember(chatId, userId!, res))) return;

        const { data: channels } = await supabase
            .from('voice_channels')
            .select('id')
            .eq('chat_id', chatId)
            .eq('category', category);

        const channelIds = (channels || []).map((c: any) => c.id);

        if (channelIds.length > 0) {
            await supabase
                .from('voice_channel_participants')
                .delete()
                .in('channel_id', channelIds);

            await supabase
                .from('voice_channels')
                .delete()
                .in('id', channelIds);
        }

        res.json({ success: true, deleted: channelIds.length });
    } catch (err) {
        console.error('[VoiceChannels] DELETE /categories error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /voice-channels/reorder — reorder channels (drag-and-drop)
router.patch('/reorder', authenticateToken, validateBody(reorderChannelsSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId, channels } = req.body;
        const userId = req.user?.userId;

        if (!(await requireChatMember(chatId, userId!, res))) return;

        // Batch update positions and categories
        const updates = channels.map((ch: { id: string; position: number; category: string }) =>
            supabase
                .from('voice_channels')
                .update({ position: ch.position, category: ch.category })
                .eq('id', ch.id)
                .eq('chat_id', chatId)
        );

        await Promise.all(updates);
        res.json({ success: true });
    } catch (err) {
        console.error('[VoiceChannels] PATCH /reorder error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Wildcard routes AFTER category routes ---

// PATCH /voice-channels/:channelId — update name/description
router.patch('/:channelId', authenticateToken, validateBody(updateVoiceChannelSchema), async (req: AuthRequest, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user?.userId;
        const { name, description } = req.body;

        // Verify membership via channel's chat
        const { data: ch } = await supabase.from('voice_channels').select('chat_id').eq('id', channelId).single();
        if (!ch || !(await requireChatMember(ch.chat_id, userId!, res))) return;

        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;

        const { data, error } = await supabase
            .from('voice_channels')
            .update(updates)
            .eq('id', channelId)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /voice-channels/:channelId — delete a channel
router.delete('/:channelId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user?.userId;

        // Verify membership via channel's chat
        const { data: ch } = await supabase.from('voice_channels').select('chat_id').eq('id', channelId).single();
        if (!ch || !(await requireChatMember(ch.chat_id, userId!, res))) return;

        await supabase
            .from('voice_channel_participants')
            .delete()
            .eq('channel_id', channelId);

        const { error } = await supabase
            .from('voice_channels')
            .delete()
            .eq('id', channelId);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
