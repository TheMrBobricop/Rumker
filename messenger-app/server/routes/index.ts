
import { Router } from 'express';
import authRouter from './auth.js';
import chatsRouter from './chats_supabase.js';
import usersRouter from './users_supabase.js';
import friendsRouter from './friends.js';
import uploadRouter from './upload.js';
import voiceChannelsRouter from './voiceChannels.js';
import pollsRouter from './polls.js';
import soundboardRouter from './soundboard.js';

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
router.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

export default router;
