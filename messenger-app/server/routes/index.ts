
import { Router } from 'express';
import authRouter from './auth.js';
import chatsRouter from './chats_supabase.js';
import usersRouter from './users_supabase.js';
import friendsRouter from './friends.js';
import uploadRouter from './upload.js';

const router = Router();

// Routes
router.use('/auth', authRouter);
router.use('/chats', chatsRouter);
router.use('/users', usersRouter);
router.use('/friends', friendsRouter);
router.use('/upload', uploadRouter);

// Health Check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

export default router;
