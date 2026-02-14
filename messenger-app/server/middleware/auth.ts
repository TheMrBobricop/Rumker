
import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// На серверной стороне нужен доступ к process.env, но в браузере он может не быть доступен.
// В production env переменные должны быть установлены.
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';

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

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) {
            console.error('JWT Verification Error:', err.message);
            return res.status(403).json({ message: 'Invalid or expired token' });
        }

        req.user = user as AuthRequest['user'];
        next();
    });
};

export const generateToken = (payload: object) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' }); // Access token на 15 минут
};

export const generateRefreshToken = (payload: object) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }); // Refresh token на 7 дней
};
