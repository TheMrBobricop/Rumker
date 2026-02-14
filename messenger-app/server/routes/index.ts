
import { Router } from 'express';
import authRouter from './auth.js';
import chatsRouter from './chats.js';
import usersRouter from './users.js';
import friendsRouter from './friends.js';

const router = Router();

// Routes
router.use('/auth', authRouter);
router.use('/chats', chatsRouter);
router.use('/users', usersRouter);
router.use('/friends', friendsRouter);

// Health Check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

export default router;
