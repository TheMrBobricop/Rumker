
import { Router } from 'express';
import authRouter from './auth.js';
import chatsRouter from './chats_supabase.js';
import usersRouter from './users_supabase.js';
import friendsRouter from './friends.js';
import uploadRouter from './upload.js';
import voiceChannelsRouter from './voiceChannels.js';
import pollsRouter from './polls.js';
import soundboardRouter from './soundboard.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

// Routes
router.use('/auth', authRouter);
router.use('/chats', chatsRouter);
router.use('/users', usersRouter);
router.use('/friends', friendsRouter);
router.use('/upload', uploadRouter);
router.use('/voice-channels', voiceChannelsRouter);
router.use('/polls', pollsRouter);
router.use('/soundboard', soundboardRouter);

// Health Check
router.get('/health', async (req, res) => {
    const { error } = await supabase
        .from('users')
        .select('id')
        .limit(1);

    if (error) {
        const message = [error.message, error.details].filter(Boolean).join(' | ');
        return res.status(503).json({
            status: 'degraded',
            db: 'unreachable',
            error: message || 'Database check failed',
            time: new Date().toISOString(),
        });
    }

    res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
});

export default router;
