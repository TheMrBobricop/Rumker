import { Router, type Response } from 'express';
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
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const REFRESH_COOKIE_SAME_SITE: 'lax' | 'none' = IS_PRODUCTION ? 'none' : 'lax';
const IS_DEV = process.env.NODE_ENV !== 'production';

type SupabaseErrorLike = {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
} | null | undefined;

function setRefreshCookie(res: any, refreshToken: string) {
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: REFRESH_COOKIE_SAME_SITE,
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}

function formatSupabaseError(error: SupabaseErrorLike): string {
    if (!error) return 'Unknown database error';
    const chunks = [error.message, error.details, error.hint, error.code].filter(Boolean);
    return chunks.join(' | ') || 'Unknown database error';
}

function isSupabaseUnavailable(error: SupabaseErrorLike): boolean {
    const text = formatSupabaseError(error).toLowerCase();
    return (
        text.includes('fetch failed') ||
        text.includes('enotfound') ||
        text.includes('econnrefused') ||
        text.includes('etimedout') ||
        text.includes('network')
    );
}

function respondSupabaseError(res: Response, error: SupabaseErrorLike, fallbackMessage = 'Database request failed') {
    const unavailable = isSupabaseUnavailable(error);
    const details = formatSupabaseError(error);
    return res.status(unavailable ? 503 : 500).json({
        error: unavailable ? 'Database is temporarily unavailable' : fallbackMessage,
        ...(IS_DEV ? { details } : {}),
    });
}

// 1. пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ
router.post('/telegram/send-code', telegramAuthLimiter, validateBody(sendCodeSchema), async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        // пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ `userId` пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
        // пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ ID пїЅпїЅпїЅпїЅпїЅпїЅ
        const formattedPhone = phoneNumber.replace(/\D/g, '');

        const { phoneCodeHash } = await telegramService.sendCode(formattedPhone, phoneNumber);

        res.json({ phoneCodeHash });
    } catch (error: unknown) {
        console.error('Send Code Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to send code';
        res.status(400).json({ error: errorMessage });
    }
});

// 2. пїЅпїЅпїЅпїЅ пїЅпїЅ пїЅпїЅпїЅпїЅ
router.post('/telegram/sign-in', telegramAuthLimiter, validateBody(signInSchema), async (req, res) => {
    try {
        const { phoneNumber, phoneCodeHash, phoneCode } = req.body;
        const formattedPhone = phoneNumber.replace(/\D/g, '');

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ gram.js
        // TODO: пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ 2FA пїЅпїЅпїЅпїЅпїЅпїЅ (пїЅпїЅпїЅпїЅ error.message === 'SESSION_PASSWORD_NEEDED')
        const { sessionString } = await telegramService.signIn(formattedPhone, phoneNumber, phoneCodeHash, phoneCode);

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ
        const client = await telegramService.initializeClient(formattedPhone, sessionString);
        const me = await client.getMe() as unknown as { id: number; username?: string; firstName?: string; lastName?: string };

        if (!me) throw new Error('Failed to get user info');

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ/пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅ Supabase
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

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ JWT пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ API
        const accessToken = generateToken({ userId: user.id, username: user.username });
        const refreshToken = generateRefreshToken({ userId: user.id });

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅ Supabase
        await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                token_hash: hashToken(refreshToken),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ (refresh пїЅ httpOnly cookie)
        setRefreshCookie(res, refreshToken);

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

// 3. пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ 2FA пїЅпїЅпїЅпїЅпїЅпїЅ
router.post('/telegram/check-password', telegramAuthLimiter, validateBody(checkPasswordSchema), async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const formattedPhone = phoneNumber.replace(/\D/g, '');

        const { sessionString } = await telegramService.checkPassword(formattedPhone, password);

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ
        const client = await telegramService.initializeClient(formattedPhone, sessionString);
        const me = await client.getMe() as unknown as { id: number; username?: string; firstName?: string; lastName?: string };

        if (!me) throw new Error('Failed to get user info');

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ/пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅ Supabase
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

        setRefreshCookie(res, refreshToken);

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
        const errorMessage = error instanceof Error ? error.message : 'пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ';
        res.status(400).json({ error: errorMessage });
    }
});

// --- Email Authentication ---

// пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ Email
router.post('/register', registerLimiter, validateBody(registerSchema), async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedUsername = String(username).trim();

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ (parallel queries)
        const [byEmailResult, byUsernameResult] = await Promise.all([
            supabase.from('users').select('id').ilike('email', normalizedEmail).limit(1).maybeSingle(),
            supabase.from('users').select('id').eq('username', normalizedUsername).limit(1).maybeSingle(),
        ]);

        if (byEmailResult.error || byUsernameResult.error) {
            return respondSupabaseError(res, byEmailResult.error || byUsernameResult.error, 'Failed to validate account data');
        }

        const byEmail = byEmailResult.data;
        const byUsername = byUsernameResult.data;

        const existingUser = byEmail || byUsername;

        if (existingUser) {
            return res.status(400).json({ error: 'User with this email or username already exists' });
        }

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅ Supabase
        const { data: user, error: createError } = await supabase
            .from('users')
            .insert({
                username: normalizedUsername,
                email: normalizedEmail,
                password: passwordHash,
                first_name: normalizedUsername,
            })
            .select()
            .single();

        if (createError) {
            console.error('Create user error:', createError);
            return respondSupabaseError(res, createError, 'Failed to create user');
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
            if (isSupabaseUnavailable(sessionError)) {
                return respondSupabaseError(res, sessionError, 'Failed to create session');
            }
        }

        setRefreshCookie(res, refreshToken);

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
        res.status(500).json({
            error: 'Registration failed',
            ...(IS_DEV ? { details: errorMessage } : {}),
        });
    }
});

// пїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ Email
router.post('/login', loginLimiter, validateBody(loginEmailSchema), async (req, res) => {
    try {
        const { email, password, userId } = req.body as { email?: string; password: string; userId?: string };
        const normalizedLogin = String(email || '').normalize('NFKC').trim().toLowerCase();
        const fields = 'id, username, email, password, first_name, last_name';

        const candidates: any[] = [];
        if (userId) {
            const byIdRes = await supabase
                .from('users')
                .select(fields)
                .eq('id', userId)
                .limit(1);
            if (byIdRes.error) {
                return respondSupabaseError(res, byIdRes.error, 'Failed to fetch user');
            }
            if (byIdRes.data?.length) {
                candidates.push(...byIdRes.data);
            }
        }

        if (normalizedLogin) {
            const [byEmailRes, byUsernameRes] = await Promise.all([
                supabase
                    .from('users')
                    .select(fields)
                    .ilike('email', normalizedLogin)
                    .limit(10),
                supabase
                    .from('users')
                    .select(fields)
                    .eq('username', normalizedLogin)
                    .limit(10),
            ]);

            if (byEmailRes.error || byUsernameRes.error) {
                return respondSupabaseError(res, byEmailRes.error || byUsernameRes.error, 'Failed to fetch user');
            }

            const byEmail = byEmailRes.data || [];
            const byUsername = byUsernameRes.data || [];
            candidates.push(...byEmail, ...byUsername);
        }

        const dedupedCandidates = [...new Map(candidates.map((u: any) => [u.id, u])).values()];

        if (dedupedCandidates.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        let user = null as any;
        let hasPasswordless = false;

        for (const candidate of dedupedCandidates) {
            if (!candidate.password) {
                hasPasswordless = true;
                continue;
            }

            let isValid = false;
            try {
                isValid = await bcrypt.compare(password, candidate.password);
            } catch {
                isValid = false;
            }

            // Legacy migration: if a historical plain password slipped in, rehash on successful login.
            const isLegacyPlain = !isValid && candidate.password === password;
            if (isLegacyPlain) {
                const salt = await bcrypt.genSalt(10);
                const passwordHash = await bcrypt.hash(password, salt);
                const { error: updateErr } = await supabase.from('users').update({ password: passwordHash }).eq('id', candidate.id);
                if (updateErr && isSupabaseUnavailable(updateErr)) {
                    return respondSupabaseError(res, updateErr, 'Failed to update user password');
                }
                isValid = true;
            }

            if (isValid) {
                user = candidate;
                break;
            }
        }

        if (!user) {
            if (hasPasswordless) {
                return res.status(401).json({ error: 'Use Telegram login for this account' });
            }
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
            if (isSupabaseUnavailable(sessionError)) {
                return respondSupabaseError(res, sessionError, 'Failed to create session');
            }
        }

        setRefreshCookie(res, refreshToken);

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
        res.status(500).json({
            error: 'Login failed',
            ...(IS_DEV ? { details: errorMessage } : {}),
        });
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

        if (error) {
            if (isSupabaseUnavailable(error)) {
                return respondSupabaseError(res, error, 'Failed to load user');
            }
            return res.status(500).json({ error: 'Failed to load user' });
        }

        if (!user) {
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

// Logout пїЅ invalidate session and clear cookie
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
            secure: IS_PRODUCTION,
            sameSite: REFRESH_COOKIE_SAME_SITE,
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
});

// пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ access token
router.post('/refresh', refreshLimiter, async (req, res) => {
    try {
        // пїЅпїЅпїЅпїЅ refreshToken пїЅпїЅ cookie пїЅпїЅпїЅ пїЅпїЅ body
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

        if (sessionError) {
            if (isSupabaseUnavailable(sessionError)) {
                return respondSupabaseError(res, sessionError, 'Failed to validate session');
            }
            return res.status(403).json({ error: 'Session not found' });
        }

        if (!session) {
            return res.status(403).json({ error: 'Session not found' });
        }

        // Get user
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, username, email, first_name, last_name')
            .eq('id', payload.userId)
            .single();

        if (userError) {
            if (isSupabaseUnavailable(userError)) {
                return respondSupabaseError(res, userError, 'Failed to load user');
            }
            return res.status(500).json({ error: 'Failed to load user' });
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate only a new access token пїЅ do NOT rotate the refresh token
        // Rotating causes race conditions: if the response is lost, the client
        // still holds the old token which no longer exists in DB в†’ forced logout.
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
