// ========================================
// Security Utilities
// ========================================

/**
 * Sanitize HTML to prevent XSS attacks
 */
export function sanitizeHtml(input: string): string {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

/**
 * Escape special characters for safe display
 */
export function escapeHtml(str: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return str.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate phone number format
 */
export function isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/[\s-()]/g, ''));
}

/**
 * Validate username (alphanumeric, underscores, 3-32 chars)
 */
export function isValidUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_]{3,32}$/;
    return usernameRegex.test(username);
}

/**
 * Rate limiter for client-side actions
 */
export class RateLimiter {
    private timestamps: number[] = [];
    private readonly maxRequests: number;
    private readonly windowMs: number;

    constructor(maxRequests: number, windowMs: number) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    canProceed(): boolean {
        const now = Date.now();
        this.timestamps = this.timestamps.filter(
            (t) => now - t < this.windowMs
        );

        if (this.timestamps.length < this.maxRequests) {
            this.timestamps.push(now);
            return true;
        }

        return false;
    }

    reset(): void {
        this.timestamps = [];
    }
}

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) =>
        byte.toString(16).padStart(2, '0')
    ).join('');
}

/**
 * Validate file type for uploads
 */
export function isAllowedFileType(
    file: File,
    allowedTypes: string[]
): boolean {
    return allowedTypes.some((type) => {
        if (type.endsWith('/*')) {
            const category = type.split('/')[0];
            return file.type.startsWith(category + '/');
        }
        return file.type === type;
    });
}

/**
 * Validate file size
 */
export function isAllowedFileSize(
    file: File,
    maxSizeMB: number
): boolean {
    return file.size <= maxSizeMB * 1024 * 1024;
}

/**
 * Content Security Policy nonce generator
 */
export function generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
}
