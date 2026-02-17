import { Router } from 'express';
import { z } from 'zod';
import { telegramService } from '../services/telegram.js';
import { generateToken, generateRefreshToken } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import bcrypt from 'bcryptjs';

const router = Router();

// Валидация входных данных
const sendCodeSchema = z.object({
    phoneNumber: z.string().min(5),
});

const signInSchema = z.object({
    phoneNumber: z.string().min(5),
    phoneCodeHash: z.string().min(1),
    phoneCode: z.string().min(1),
    password: z.string().optional(), // 2FA пароль (если есть)
});

// 1. Отправка кода
router.post('/telegram/send-code', async (req, res) => {
    try {
        const { phoneNumber } = sendCodeSchema.parse(req.body);

        // В реальном продакшене `userId` должен быть сессионным или временным идентификатором
        // Для простоты используем номер телефона как временный ID сессии
        const formattedPhone = phoneNumber.replace(/\D/g, '');

        const { phoneCodeHash } = await telegramService.sendCode(formattedPhone, phoneNumber);

        res.json({ phoneCodeHash });
    } catch (error: any) {
        console.error('Send Code Error:', error);
        res.status(400).json({ error: error.message || 'Failed to send code' });
    }
});

// 2. Вход по коду
router.post('/telegram/sign-in', async (req, res) => {
    try {
        const { phoneNumber, phoneCodeHash, phoneCode, password } = signInSchema.parse(req.body);
        const formattedPhone = phoneNumber.replace(/\D/g, '');

        // Выполняем вход через gram.js
        // TODO: Поддержка 2FA пароля (если error.message === 'SESSION_PASSWORD_NEEDED')
        const { sessionString } = await telegramService.signIn(formattedPhone, phoneNumber, phoneCodeHash, phoneCode);

        // Получаем инфо о пользователе через клиент
        const client = await telegramService.initializeClient(formattedPhone, sessionString);
        const me = await client.getMe() as any; // any, так как типы gram.js иногда сложные

        if (!me) throw new Error('Failed to get user info');

        // Сохраняем/Обновляем пользователя в Supabase
        const telegramId = me.id.toString();
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
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
                token: refreshToken,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });

        // Отправляем токены клиенту (refresh в httpOnly cookie)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
            }
        });

    } catch (error: any) {
        console.error('Sign In Error:', error);
        if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
            return res.status(401).json({ error: '2FA_REQUIRED', message: 'Two-factor authentication is enabled' });
        }
        res.status(400).json({ error: error.message || 'Failed to sign in' });
    }
});

// --- Email Authentication ---

const registerSchema = z.object({
    username: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(6),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

const loginEmailSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

// Регистрация через Email
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = registerSchema.parse(req.body);

        // Проверяем существующего пользователя
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('*')
            .or(`email.eq.${email},username.eq.${username}`)
            .single();

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Check user error:', checkError);
            return res.status(500).json({ error: 'Database error' });
        }

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
                token: refreshToken,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });

        if (sessionError) {
            console.error('Session save error:', sessionError);
        }

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });

    } catch (error: any) {
        console.error('Registration Error:', error);
        res.status(400).json({ error: error.message || 'Registration failed' });
    }
});

// Вход через Email
router.post('/login', async (req, res) => {
    try {
        const { email, password } = loginEmailSchema.parse(req.body);

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
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
                token: refreshToken,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });

        if (sessionError) {
            console.error('Session save error:', sessionError);
        }

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });

    } catch (error: any) {
        console.error('Login Error:', error);
        res.status(400).json({ error: error.message || 'Login failed' });
    }
});

// Обновление access token
router.post('/refresh', async (req, res) => {
    try {
        // Берём refreshToken из cookie или из body
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token required' });
        }

        // Verify refresh token
        let payload: any;
        try {
            const jwt = await import('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';
            payload = jwt.default.verify(refreshToken, JWT_SECRET);
        } catch {
            return res.status(403).json({ error: 'Invalid refresh token' });
        }

        // Check session exists in DB
        const { data: session, error: sessionError } = await supabase
            .from('sessions')
            .select('*')
            .eq('token', refreshToken)
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

        // Generate new tokens
        const newAccessToken = generateToken({ userId: user.id, username: user.username });
        const newRefreshToken = generateRefreshToken({ userId: user.id });

        // Update session in DB
        await supabase
            .from('sessions')
            .update({
                token: newRefreshToken,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq('id', session.id);

        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
            }
        });
    } catch (error: any) {
        console.error('Refresh Error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

export default router;
