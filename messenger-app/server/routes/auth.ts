import { Router } from 'express';
import { telegramService } from '../services/telegram.js';
import { generateToken, generateRefreshToken, verifyRefreshToken, authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/** Hash a refresh token with SHA-256 for secure storage */
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}
import { registerSchema, loginEmailSchema, sendCodeSchema, signInSchema, checkPasswordSchema, validateBody } from '../lib/validation.js';
import { loginLimiter, registerLimiter, refreshLimiter, telegramAuthLimiter } from '../lib/security.js';

const router = Router();

// 1. Отправка кода
router.post('/telegram/send-code', telegramAuthLimiter, validateBody(sendCodeSchema), async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        // В реальном продакшене `userId` должен быть сессионным или временным идентификатором
        // Для простоты используем номер телефона как временный ID сессии
        const formattedPhone = phoneNumber.replace(/\D/g, '');

        const { phoneCodeHash } = await telegramService.sendCode(formattedPhone, phoneNumber);

        res.json({ phoneCodeHash });
    } catch (error: unknown) {
        console.error('Send Code Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to send code';
        res.status(400).json({ error: errorMessage });
    }
});

// 2. Вход по коду
router.post('/telegram/sign-in', telegramAuthLimiter, validateBody(signInSchema), async (req, res) => {
    try {
        const { phoneNumber, phoneCodeHash, phoneCode } = req.body;
        const formattedPhone = phoneNumber.replace(/\D/g, '');

        // Выполняем вход через gram.js
        // TODO: Поддержка 2FA пароля (если error.message === 'SESSION_PASSWORD_NEEDED')
        const { sessionString } = await telegramService.signIn(formattedPhone, phoneNumber, phoneCodeHash, phoneCode);

        // Получаем инфо о пользователе через клиент
        const client = await telegramService.initializeClient(formattedPhone, sessionString);
        const me = await client.getMe() as unknown as { id: number; username?: string; firstName?: string; lastName?: string };

        if (!me) throw new Error('Failed to get user info');

        // Сохраняем/Обновляем пользователя в Supabase
        const telegramId = me.id.toString();
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, username, first_name, last_name, telegram_session')
            .eq('telegram_id', telegramId)
            .single();

        let user;
        if (existingUser) {
            const { data: updated } = await supabase
                .from('users')
                .update({
                    username: me.username || existingUser.username,
                    first_name: me.firstName,
                    last_name: me.lastName,
                    last_seen: new Date().toISOString(),
                    telegram_session: sessionString,
                })
                .eq('id', existingUser.id)
                .select()
                .single();
            user = updated || existingUser;
        } else {
            const { data: created, error: createErr } = await supabase
                .from('users')
                .insert({
                    telegram_id: telegramId,
                    username: me.username || `user${me.id}`,
                    password: '',
                    first_name: me.firstName,
                    last_name: me.lastName,
                    telegram_session: sessionString,
                    is_telegram_linked: true,
                })
                .select()
                .single();
            if (createErr || !created) {
                throw new Error('Failed to create user');
            }
            user = created;
        }

        // Генерируем наши JWT токены для API
        const accessToken = generateToken({ userId: user.id, username: user.username });
        const refreshToken = generateRefreshToken({ userId: user.id });

        // Сохраняем рефреш сессию в Supabase
        await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                token_hash: hashToken(refreshToken),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });

        // Отправляем токены клиенту (refresh в httpOnly cookie)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
            }
        });

    } catch (error: unknown) {
        console.error('Sign In Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to sign in';
        const errorObj = error as { errorMessage?: string; message?: string };
        if (errorObj.errorMessage === 'SESSION_PASSWORD_NEEDED') {
            return res.status(401).json({ error: '2FA_REQUIRED', message: 'Two-factor authentication is enabled' });
        }
        res.status(400).json({ error: errorMessage });
    }
});

// 3. Проверка 2FA пароля
router.post('/telegram/check-password', telegramAuthLimiter, validateBody(checkPasswordSchema), async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const formattedPhone = phoneNumber.replace(/\D/g, '');

        const { sessionString } = await telegramService.checkPassword(formattedPhone, password);

        // Получаем инфо о пользователе
        const client = await telegramService.initializeClient(formattedPhone, sessionString);
        const me = await client.getMe() as unknown as { id: number; username?: string; firstName?: string; lastName?: string };

        if (!me) throw new Error('Failed to get user info');

        // Сохраняем/Обновляем пользователя в Supabase
        const telegramId = me.id.toString();
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, username, first_name, last_name, telegram_session')
            .eq('telegram_id', telegramId)
            .single();

        let user;
        if (existingUser) {
            const { data: updated } = await supabase
                .from('users')
                .update({
                    username: me.username || existingUser.username,
                    first_name: me.firstName,
                    last_name: me.lastName,
                    last_seen: new Date().toISOString(),
                    telegram_session: sessionString,
                })
                .eq('id', existingUser.id)
                .select()
                .single();
            user = updated || existingUser;
        } else {
            const { data: created, error: createErr } = await supabase
                .from('users')
                .insert({
                    telegram_id: telegramId,
                    username: me.username || `user${me.id}`,
                    password: '',
                    first_name: me.firstName,
                    last_name: me.lastName,
                    telegram_session: sessionString,
                    is_telegram_linked: true,
                })
                .select()
                .single();
            if (createErr || !created) throw new Error('Failed to create user');
            user = created;
        }

        const accessToken = generateToken({ userId: user.id, username: user.username });
        const refreshToken = generateRefreshToken({ userId: user.id });

        await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                token_hash: hashToken(refreshToken),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
            }
        });
    } catch (error: unknown) {
        console.error('Check Password Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Неверный пароль';
        res.status(400).json({ error: errorMessage });
    }
});

// --- Email Authentication ---

// Регистрация через Email
router.post('/register', registerLimiter, validateBody(registerSchema), async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Проверяем существующего пользователя (parallel queries)
        const [{ data: byEmail }, { data: byUsername }] = await Promise.all([
            supabase.from('users').select('id').eq('email', email).limit(1).maybeSingle(),
            supabase.from('users').select('id').eq('username', username).limit(1).maybeSingle(),
        ]);

        const existingUser = byEmail || byUsername;

        if (existingUser) {
            return res.status(400).json({ error: 'User with this email or username already exists' });
        }

        // Создаем хеш пароля
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Создаем пользователя в Supabase
        const { data: user, error: createError } = await supabase
            .from('users')
            .insert({
                username,
                email,
                password: passwordHash,
                first_name: username,
            })
            .select()
            .single();

        if (createError) {
            console.error('Create user error:', createError);
            return res.status(500).json({ error: 'Failed to create user' });
        }

        // Generate tokens
        const accessToken = generateToken({ userId: user.id, username: user.username });
        const refreshToken = generateRefreshToken({ userId: user.id });

        // Save session to Supabase
        const { error: sessionError } = await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                token_hash: hashToken(refreshToken),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });

        if (sessionError) {
            console.error('Session save error:', sessionError);
        }

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });

    } catch (error: unknown) {
        console.error('Registration Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Registration failed';
        res.status(400).json({ error: errorMessage });
    }
});

// Вход через Email
router.post('/login', loginLimiter, validateBody(loginEmailSchema), async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, email, password, first_name, last_name')
            .eq('email', email)
            .single();
            
        if (error || !user || !user.password) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate tokens
        const accessToken = generateToken({ userId: user.id, username: user.username });
        const refreshToken = generateRefreshToken({ userId: user.id });

        // Save session to Supabase
        const { error: sessionError } = await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                token_hash: hashToken(refreshToken),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });

        if (sessionError) {
            console.error('Session save error:', sessionError);
        }

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });

    } catch (error: unknown) {
        console.error('Login Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Login failed';
        res.status(400).json({ error: errorMessage });
    }
});

// Get current user info (token check)
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, email, first_name, last_name, bio, avatar, phone, last_seen, is_online')
            .eq('id', userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            bio: user.bio,
            avatar: user.avatar,
            phone: user.phone,
            lastSeen: user.last_seen,
            isOnline: user.is_online,
        });
    } catch (error: unknown) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

// Logout — invalidate session and clear cookie
router.post('/logout', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const refreshToken = req.cookies?.refreshToken;

        if (refreshToken && userId) {
            // Delete this specific session
            await supabase
                .from('sessions')
                .delete()
                .eq('token_hash', hashToken(refreshToken))
                .eq('user_id', userId);
        }

        // Clear the refresh token cookie
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
});

// Обновление access token
router.post('/refresh', refreshLimiter, async (req, res) => {
    try {
        // Берём refreshToken из cookie или из body
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token required' });
        }

        // Verify refresh token with dedicated secret
        let payload: { userId: string; username: string };
        try {
            payload = await verifyRefreshToken(refreshToken) as { userId: string; username: string };
        } catch {
            return res.status(403).json({ error: 'Invalid refresh token' });
        }

        // Check session exists in DB
        const { data: session, error: sessionError } = await supabase
            .from('sessions')
            .select('id')
            .eq('token_hash', hashToken(refreshToken))
            .eq('user_id', payload.userId)
            .single();

        if (sessionError || !session) {
            return res.status(403).json({ error: 'Session not found' });
        }

        // Get user
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, username, email, first_name, last_name')
            .eq('id', payload.userId)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate only a new access token — do NOT rotate the refresh token
        // Rotating causes race conditions: if the response is lost, the client
        // still holds the old token which no longer exists in DB → forced logout.
        const newAccessToken = generateToken({ userId: user.id, username: user.username });

        res.json({
            accessToken: newAccessToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
            }
        });
    } catch (error: unknown) {
        console.error('Refresh Error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

export default router;
