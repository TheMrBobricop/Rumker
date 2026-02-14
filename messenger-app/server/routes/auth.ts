import { Router } from 'express';
import { z } from 'zod';
import { telegramService } from '../services/telegram.js';
import { generateToken, generateRefreshToken } from '../middleware/auth.js';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL || 'file:./dev.db'
});

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

        // Сохраняем/Обновляем пользователя в нашей БД
        // Используем upsert, чтобы создать если нет, или обновить если есть
        const user = await prisma.user.upsert({
            where: { telegramId: me.id.toString() },
            update: {
                username: me.username,
                firstName: me.firstName,
                lastName: me.lastName,
                avatar: '', // TODO: Загрузить аватарку и сохранить
                lastSeen: new Date(),
                telegramSession: sessionString, // ! ВАЖНО: Храним сессию (в продакшене шифровать!)
            },
            create: {
                telegramId: me.id.toString(),
                username: me.username || `user${me.id}`,
                email: null, // Telegram вход не дает email
                password: '', // Пароля нет
                firstName: me.firstName,
                lastName: me.lastName,
                telegramSession: sessionString,
                isTelegramLinked: true,
            },
        });

        // Генерируем наши JWT токены для API
        const accessToken = generateToken({ userId: user.id, username: user.username });
        const refreshToken = generateRefreshToken({ userId: user.id });

        // Сохраняем рефреш сессию
        await prisma.session.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            },
        });

        // Отправляем токены клиенту (refresh в httpOnly cookie)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName
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

        const existingUser = await prisma.user.findFirst({
            where: { OR: [{ email }, { username }] },
        });

        if (existingUser) {
            return res.status(400).json({ error: 'User with this email or username already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: passwordHash, // Используем хеш пароля
                firstName: username, // Default firstName
            },
        });

        // Generate tokens
        const accessToken = generateToken({ userId: user.id, username: user.username });
        const refreshToken = generateRefreshToken({ userId: user.id });

        // Save session
        await prisma.session.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName
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

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate tokens
        const accessToken = generateToken({ userId: user.id, username: user.username });
        const refreshToken = generateRefreshToken({ userId: user.id });

        // Save session logic (can be extracted to helper function)
        await prisma.session.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName
            }
        });

    } catch (error: any) {
        console.error('Login Error:', error);
        res.status(400).json({ error: error.message || 'Login failed' });
    }
});

export default router;
