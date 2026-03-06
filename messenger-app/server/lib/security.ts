import rateLimit from 'express-rate-limit';

/**
 * Per-endpoint rate limiters for security-sensitive routes.
 * These are stricter than the global rate limit.
 */

// Auth: login — prevent brute force
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 min
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth: register — prevent mass account creation
export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 registrations per hour
    message: { error: 'Too many registration attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth: refresh — moderate limit
export const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Too many refresh attempts.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Upload — prevent abuse
export const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50, // 50 uploads per 15 min
    message: { error: 'Too many uploads. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Friend requests — prevent spam
export const friendRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many friend requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Message sending — allow reasonable throughput
export const messageSendLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 messages per minute
    message: { error: 'Sending messages too fast. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Telegram auth — prevent abuse of SMS codes
export const telegramAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many code requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Sanitize a filename by removing dangerous characters.
 * Used for uploaded files to prevent path traversal.
 */
export function sanitizeFilename(name: string): string {
    return name
        .replace(/[\\/\0]/g, '')     // Remove path separators and null bytes
        .replace(/\.\./g, '')         // Remove directory traversal
        .replace(/[<>:"|?*]/g, '')    // Remove Windows-invalid chars
        .trim()
        || 'unnamed';                 // Fallback if empty after sanitization
}

/**
 * Validate that a string is a valid UUID v4.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(val: string): boolean {
    return UUID_REGEX.test(val);
}
