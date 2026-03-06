
import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Separate secrets for access and refresh tokens
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set.');
    process.exit(1);
}

if (!process.env.JWT_REFRESH_SECRET) {
    console.warn('WARNING: JWT_REFRESH_SECRET not set — falling back to JWT_SECRET. Set a separate secret in production!');
}

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        username: string;
        role: string;
    };
}

export const authenticateToken = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
        if (err) {
            console.error('JWT Verification Error:', err.message);
            return res.status(403).json({ message: 'Invalid or expired token' });
        }

        // Reject refresh tokens used as access tokens
        if (decoded.type === 'refresh') {
            return res.status(403).json({ message: 'Invalid token type' });
        }

        req.user = decoded as AuthRequest['user'];
        next();
    });
};

export const generateToken = (payload: object) => {
    return jwt.sign({ ...payload, type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
};

export const generateRefreshToken = (payload: object) => {
    return jwt.sign({ ...payload, type: 'refresh' }, JWT_REFRESH_SECRET!, { expiresIn: '7d' });
};

export const verifyRefreshToken = (token: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        jwt.verify(token, JWT_REFRESH_SECRET!, (err, decoded: any) => {
            if (err) return reject(err);
            if (decoded.type !== 'refresh') return reject(new Error('Invalid token type'));
            resolve(decoded);
        });
    });
};
