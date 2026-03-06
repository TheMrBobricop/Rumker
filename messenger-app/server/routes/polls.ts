import { Router } from 'express';
import type { Application } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { validateBody, createPollSchema, voteSchema } from '../lib/validation.js';

const router = Router();

function getIO(req: AuthRequest) {
    return (req.app as Application).get('io');
}

// Helper: fetch poll with options and vote counts
async function fetchPoll(pollId: string, userId?: string) {
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

    // Current user's votes
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
        options: (options || []).map(o => ({
            id: o.id,
            text: o.text,
            voterCount: (votesByOption.get(o.id) || []).length,
            voters: poll.is_anonymous ? undefined : votesByOption.get(o.id) || [],
        })),
    };
}

// Create poll (creates message + poll + options)
router.post('/', authenticateToken, validateBody(createPollSchema), async (req: AuthRequest, res) => {
    try {
        const { chatId, question, options, isAnonymous, isMultipleChoice } = req.body;
        const userId = req.user?.userId;

        if (!chatId || !question || !options || !Array.isArray(options) || options.length < 2) {
            return res.status(400).json({ error: 'chatId, question, and at least 2 options are required' });
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

        // Create the message
        const now = new Date().toISOString();
        const { data: message, error: msgError } = await supabase
            .from('messages')
            .insert({
                chat_id: chatId,
                sender_id: userId,
                content: question,
                type: 'poll',
                created_at: now,
                updated_at: now,
            })
            .select(`
                id, chat_id, content, type, created_at, sender_id,
                users!messages_sender_id_fkey(id, username, first_name, last_name, avatar)
            `)
            .single();

        if (msgError || !message) {
            console.error('Create poll message error:', msgError);
            return res.status(500).json({ error: 'Failed to create poll message' });
        }

        // Create the poll
        const { data: poll, error: pollError } = await supabase
            .from('polls')
            .insert({
                message_id: message.id,
                chat_id: chatId,
                question,
                is_anonymous: isAnonymous || false,
                is_multiple_choice: isMultipleChoice || false,
                created_by: userId,
            })
            .select()
            .single();

        if (pollError || !poll) {
            console.error('Create poll error:', pollError);
            return res.status(500).json({ error: 'Failed to create poll' });
        }

        // Create options
        const optionInserts = options.map((text: string, i: number) => ({
            poll_id: poll.id,
            text,
            position: i,
        }));

        const { data: createdOptions, error: optError } = await supabase
            .from('poll_options')
            .insert(optionInserts)
            .select();

        if (optError) {
            console.error('Create poll options error:', optError);
        }

        // Update message metadata + chat timestamp in parallel
        await Promise.all([
            supabase.from('messages').update({ metadata: { pollId: poll.id } }).eq('id', message.id),
            supabase.from('chats').update({ updated_at: now }).eq('id', chatId),
        ]);

        const pollData = {
            id: poll.id,
            question: poll.question,
            isAnonymous: poll.is_anonymous,
            isMultipleChoice: poll.is_multiple_choice,
            isClosed: false,
            createdBy: userId,
            totalVotes: 0,
            votedOptionIds: [],
            options: (createdOptions || []).map(o => ({
                id: o.id,
                text: o.text,
                voterCount: 0,
                voters: [],
            })),
        };

        const formattedMessage = {
            id: message.id,
            chatId: message.chat_id,
            senderId: message.sender_id,
            type: 'poll',
            content: question,
            timestamp: message.created_at,
            status: 'sent',
            isEdited: false,
            pollData,
            sender: message.users ? {
                id: (message.users as any).id,
                username: (message.users as any).username,
                firstName: (message.users as any).first_name,
                lastName: (message.users as any).last_name,
                avatar: (message.users as any).avatar,
            } : null,
        };

        // Emit via socket
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${chatId}`).emit('message:new', formattedMessage);
            }
        } catch { /* socket not available */ }

        res.status(201).json(formattedMessage);
    } catch (error) {
        console.error('Create poll error:', error);
        res.status(500).json({ error: 'Failed to create poll' });
    }
});

// Vote on a poll
router.post('/:pollId/vote', authenticateToken, validateBody(voteSchema), async (req: AuthRequest, res) => {
    try {
        const { pollId } = req.params;
        const { optionIds } = req.body;
        const userId = req.user?.userId;

        if (!optionIds || !Array.isArray(optionIds) || optionIds.length === 0) {
            return res.status(400).json({ error: 'optionIds array is required' });
        }

        // Get poll
        const { data: poll } = await supabase
            .from('polls')
            .select('id, chat_id, is_closed, is_multiple_choice')
            .eq('id', pollId)
            .single();

        if (!poll) {
            return res.status(404).json({ error: 'Poll not found' });
        }

        // Verify user is a participant of the poll's chat
        const { data: participant } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', poll.chat_id)
            .eq('user_id', userId)
            .single();

        if (!participant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (poll.is_closed) {
            return res.status(400).json({ error: 'Poll is closed' });
        }

        if (!poll.is_multiple_choice && optionIds.length > 1) {
            return res.status(400).json({ error: 'This poll allows only one vote' });
        }

        // Remove existing votes by this user for this poll
        await supabase
            .from('poll_votes')
            .delete()
            .eq('poll_id', pollId)
            .eq('user_id', userId);

        // Insert new votes
        const voteInserts = optionIds.map((optionId: string) => ({
            poll_id: pollId,
            option_id: optionId,
            user_id: userId,
        }));

        const { error: voteError } = await supabase
            .from('poll_votes')
            .insert(voteInserts);

        if (voteError) {
            console.error('Vote error:', voteError);
            return res.status(500).json({ error: 'Failed to vote' });
        }

        // Fetch updated poll data
        const updatedPoll = await fetchPoll(pollId, userId);

        // Emit poll update via socket
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${poll.chat_id}`).emit('poll:update', {
                    pollId,
                    chatId: poll.chat_id,
                    pollData: updatedPoll,
                });
            }
        } catch { /* socket not available */ }

        res.json(updatedPoll);
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Failed to vote' });
    }
});

// Close a poll
router.post('/:pollId/close', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { pollId } = req.params;
        const userId = req.user?.userId;

        const { data: poll } = await supabase
            .from('polls')
            .select('id, chat_id, created_by')
            .eq('id', pollId)
            .single();

        if (!poll) {
            return res.status(404).json({ error: 'Poll not found' });
        }

        if (poll.created_by !== userId) {
            return res.status(403).json({ error: 'Only the poll creator can close it' });
        }

        await supabase
            .from('polls')
            .update({ is_closed: true, updated_at: new Date().toISOString() })
            .eq('id', pollId);

        const updatedPoll = await fetchPoll(pollId, userId);

        // Emit poll update
        try {
            const io = getIO(req);
            if (io) {
                io.to(`chat:${poll.chat_id}`).emit('poll:update', {
                    pollId,
                    chatId: poll.chat_id,
                    pollData: updatedPoll,
                });
            }
        } catch { /* socket not available */ }

        res.json(updatedPoll);
    } catch (error) {
        console.error('Close poll error:', error);
        res.status(500).json({ error: 'Failed to close poll' });
    }
});

// Get poll results
router.get('/:pollId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { pollId } = req.params;
        const userId = req.user?.userId;

        const pollData = await fetchPoll(pollId, userId);
        if (!pollData) {
            return res.status(404).json({ error: 'Poll not found' });
        }

        res.json(pollData);
    } catch (error) {
        console.error('Get poll error:', error);
        res.status(500).json({ error: 'Failed to get poll' });
    }
});

export default router;
