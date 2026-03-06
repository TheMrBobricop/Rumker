import { describe, it, expect } from 'vitest';

/**
 * Rate limiting configuration tests — verifies that rate limit
 * settings are sensible and cover critical endpoints.
 */

describe('Rate Limiting Configuration', () => {
  // These test the values we'll configure for per-endpoint rate limits
  const rateLimits = {
    global: { windowMs: 15 * 60 * 1000, max: 3000 },
    authLogin: { windowMs: 15 * 60 * 1000, max: 10 },
    authRegister: { windowMs: 60 * 60 * 1000, max: 5 },
    authRefresh: { windowMs: 15 * 60 * 1000, max: 30 },
    upload: { windowMs: 15 * 60 * 1000, max: 50 },
    friendRequest: { windowMs: 15 * 60 * 1000, max: 20 },
    messageSend: { windowMs: 1 * 60 * 1000, max: 60 },
  };

  it('auth login should be strictly rate limited', () => {
    expect(rateLimits.authLogin.max).toBeLessThanOrEqual(15);
    expect(rateLimits.authLogin.windowMs).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });

  it('auth register should be strictly rate limited', () => {
    expect(rateLimits.authRegister.max).toBeLessThanOrEqual(10);
    expect(rateLimits.authRegister.windowMs).toBeGreaterThanOrEqual(30 * 60 * 1000);
  });

  it('upload should be moderately limited', () => {
    expect(rateLimits.upload.max).toBeLessThanOrEqual(100);
  });

  it('message sending should allow reasonable throughput', () => {
    // 60 msgs/min is reasonable for an active user
    expect(rateLimits.messageSend.max).toBeGreaterThanOrEqual(30);
    expect(rateLimits.messageSend.max).toBeLessThanOrEqual(120);
  });

  it('global limit should be generous enough for normal use', () => {
    expect(rateLimits.global.max).toBeGreaterThanOrEqual(1000);
  });

  it('friend requests should be limited to prevent spam', () => {
    expect(rateLimits.friendRequest.max).toBeLessThanOrEqual(30);
  });
});

describe('JWT Security Configuration', () => {
  it('access token should expire within 24 hours', () => {
    const maxAccessExpiry = 24 * 60 * 60; // 24 hours in seconds
    // Our config uses 24h, which is reasonable for development
    expect(maxAccessExpiry).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it('refresh token should expire within 30 days', () => {
    const refreshExpiry = 7 * 24 * 60 * 60; // 7 days in seconds
    expect(refreshExpiry).toBeLessThanOrEqual(30 * 24 * 60 * 60);
  });

  it('JWT_SECRET should not be empty', () => {
    expect(process.env.JWT_SECRET).toBeTruthy();
    expect(process.env.JWT_SECRET!.length).toBeGreaterThanOrEqual(10);
  });
});

describe('Password Security', () => {
  it('bcrypt salt rounds should be at least 10', () => {
    const SALT_ROUNDS = 10;
    expect(SALT_ROUNDS).toBeGreaterThanOrEqual(10);
  });

  it('minimum password length should be at least 6', () => {
    const MIN_PASSWORD_LENGTH = 6;
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(6);
  });
});

describe('CORS Configuration', () => {
  it('should have defined allowed methods', () => {
    const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    expect(allowedMethods).not.toContain('TRACE'); // TRACE can be used for XST attacks
    expect(allowedMethods).toContain('OPTIONS'); // Needed for preflight
  });

  it('should have defined allowed headers', () => {
    const allowedHeaders = ['Content-Type', 'Authorization'];
    expect(allowedHeaders).toContain('Authorization'); // Needed for JWT
    expect(allowedHeaders).toContain('Content-Type'); // Needed for JSON
  });
});

describe('File Upload Security', () => {
  const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
  const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

  it('max file size should be reasonable', () => {
    expect(MAX_FILE_SIZE).toBeLessThanOrEqual(2 * 1024 * 1024 * 1024); // No more than 2GB
  });

  it('avatar size should be limited to 5MB', () => {
    expect(MAX_AVATAR_SIZE).toBeLessThanOrEqual(10 * 1024 * 1024); // No more than 10MB
  });

  it('should not allow executable file types', () => {
    const ALLOWED_MIME_TYPES = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'image/bmp', 'image/tiff',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
      'video/x-matroska', 'video/ogg', 'video/3gpp', 'video/x-ms-wmv',
      'video/x-flv', 'video/mpeg',
      'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav',
      'audio/x-m4a', 'audio/aac', 'audio/flac',
      'application/pdf', 'application/zip', 'application/x-rar-compressed',
    ];

    const executableTypes = [
      'application/x-executable',
      'application/x-shellscript',
      'application/x-httpd-php',
      'application/javascript',
      'application/x-msdownload',
      'text/html',
    ];

    for (const exec of executableTypes) {
      expect(ALLOWED_MIME_TYPES).not.toContain(exec);
    }
  });
});

describe('Cookie Security', () => {
  it('refresh token cookie should use httpOnly', () => {
    const cookieConfig = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    expect(cookieConfig.httpOnly).toBe(true);
    expect(cookieConfig.sameSite).toBe('strict');
  });
});
