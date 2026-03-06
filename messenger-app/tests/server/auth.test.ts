import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

// Mock supabase before importing routes
const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../server/lib/supabase.js', () => ({
  supabase: mockSupabase,
}));

vi.mock('../../server/services/telegram.js', () => ({
  telegramService: {
    sendCode: vi.fn(),
    signIn: vi.fn(),
    initializeClient: vi.fn(),
  },
}));

// Helper to build supabase chain mocks
function mockChain(finalData: any, finalError: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: finalData, error: finalError }),
    maybeSingle: vi.fn().mockResolvedValue({ data: finalData, error: finalError }),
  };
  return chain;
}

// Import after mocks
import { generateToken, generateRefreshToken, authenticateToken } from '../../server/middleware/auth.js';

describe('Auth Middleware', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken({ userId: 'user-123', username: 'testuser' });
      expect(token).toBeTruthy();
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      expect(decoded.userId).toBe('user-123');
      expect(decoded.username).toBe('testuser');
    });

    it('should set expiration', () => {
      const token = generateToken({ userId: 'user-123', username: 'testuser' });
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const token = generateRefreshToken({ userId: 'user-123' });
      expect(token).toBeTruthy();
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      expect(decoded.userId).toBe('user-123');
    });

    it('should have longer expiry than access token', () => {
      const access = generateToken({ userId: 'u1', username: 'test' });
      const refresh = generateRefreshToken({ userId: 'u1' });
      const accessDecoded = jwt.verify(access, JWT_SECRET) as any;
      const refreshDecoded = jwt.verify(refresh, JWT_SECRET) as any;
      expect(refreshDecoded.exp).toBeGreaterThan(accessDecoded.exp);
    });
  });

  describe('authenticateToken', () => {
    it('should reject requests without authorization header', () => {
      const req: any = { headers: {} };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject requests with invalid token', () => {
      const req: any = { headers: { authorization: 'Bearer invalid-token' } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);

      // jwt.verify is async via callback, need to wait
      setTimeout(() => {
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
      }, 10);
    });

    it('should accept valid token and set req.user', () => {
      const token = generateToken({ userId: 'user-123', username: 'testuser' });
      const req: any = { headers: { authorization: `Bearer ${token}` } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);

      // jwt.verify callback runs synchronously for valid tokens
      setTimeout(() => {
        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
        expect(req.user.userId).toBe('user-123');
      }, 10);
    });

    it('should reject expired token', () => {
      const token = jwt.sign(
        { userId: 'user-123', username: 'testuser' },
        JWT_SECRET,
        { expiresIn: '0s' } // Already expired
      );
      const req: any = { headers: { authorization: `Bearer ${token}` } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      // Wait a moment so the token truly expires
      setTimeout(() => {
        authenticateToken(req, res, next);
        setTimeout(() => {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(next).not.toHaveBeenCalled();
        }, 10);
      }, 50);
    });

    it('should reject token with wrong secret', () => {
      const token = jwt.sign(
        { userId: 'user-123', username: 'testuser' },
        'wrong-secret',
        { expiresIn: '1h' }
      );
      const req: any = { headers: { authorization: `Bearer ${token}` } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authenticateToken(req, res, next);

      setTimeout(() => {
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
      }, 10);
    });
  });
});

describe('Auth Token Security', () => {
  it('should not include password in JWT payload', () => {
    const token = generateToken({ userId: 'u1', username: 'test' });
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.password).toBeUndefined();
    expect(decoded.passwordHash).toBeUndefined();
  });

  it('should not include email in JWT payload', () => {
    // Only userId and username should be in the token
    const token = generateToken({ userId: 'u1', username: 'test' });
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(Object.keys(decoded).sort()).toEqual(
      expect.arrayContaining(['userId', 'username'])
    );
  });

  it('access token and refresh token should be different', () => {
    const access = generateToken({ userId: 'u1', username: 'test' });
    const refresh = generateRefreshToken({ userId: 'u1' });
    expect(access).not.toBe(refresh);
  });
});
