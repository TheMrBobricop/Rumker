// Side-effect import: load .env before any other module initializes.
import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'url';
import { initializeSocket } from './socket/index.js';
import { runStartupMigrations } from './lib/migrate.js';

const CLIENT_URL = process.env.VITE_CLIENT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io (open origins in beta, same-origin in production build).
const io = initializeSocket(httpServer);
app.set('io', io);

// Trust first proxy (Vite dev server, nginx, etc.) so X-Forwarded-For works.
app.set('trust proxy', 1);

// Security middleware.
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:', 'https://*.supabase.co', 'https://*'],
                mediaSrc: ["'self'", 'blob:', 'https://*.supabase.co'],
                connectSrc: ["'self'", 'ws:', 'wss:', 'https://*.supabase.co', 'https://*'],
            },
        },
        crossOriginEmbedderPolicy: false,
    })
);

const ALLOWED_ORIGINS = [
    CLIENT_URL,
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
].filter(Boolean);

const ALLOWED_ORIGIN_PATTERNS = [
    /^https?:\/\/.*\.ngrok-free\.app$/,
    /^https?:\/\/.*\.ngrok\.io$/,
    /^https?:\/\/.*\.loca\.lt$/,
];

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
            if (ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) return callback(null, true);
            callback(null, false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// Core middleware.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkSupabaseDns() {
    const rawUrl = process.env.SUPABASE_URL;
    if (!rawUrl) return;

    try {
        const host = new URL(rawUrl).hostname;
        await dns.lookup(host);
    } catch {
        console.error('[Supabase] SUPABASE_URL host is unreachable. Check project URL in messenger-app/.env');
    }
}

import routes from './routes/index.js';
app.use('/api', routes);

// Frontend static serving.
const distPath = path.resolve(__dirname, '../dist');
const hasDist = fs.existsSync(distPath);
const SHOULD_SERVE_STATIC = hasDist && (IS_PRODUCTION || process.env.SERVE_STATIC !== 'false');

if (SHOULD_SERVE_STATIC) {
    app.use(
        express.static(distPath, {
            setHeaders: (res, filePath) => {
                if (filePath.endsWith('index.html')) {
                    res.setHeader('Cache-Control', 'no-store, max-age=0');
                }
            },
        })
    );

    app.use((req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
            return next();
        }
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.sendFile(path.join(distPath, 'index.html'));
    });

    console.log('Serving frontend from dist/');
} else if (!IS_PRODUCTION && hasDist) {
    console.log('Skipping dist/ static serving in dev mode (set SERVE_STATIC=false to disable by choice).');
}

// Global error handler.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Global error:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') {
    checkSupabaseDns().catch(() => {});
    runStartupMigrations().catch(() => {});
    httpServer.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`\n=== Rumker Server v1.1 ===`);
        console.log(`Server running on http://0.0.0.0:${PORT}`);
        console.log('Socket.io ready');
        console.log('Routes: /api/auth/me, /api/chats/:chatId/members, /api/friends');
        console.log(`Started at: ${new Date().toISOString()}`);
        if (SHOULD_SERVE_STATIC && hasDist) {
            console.log(`Open in browser: http://localhost:${PORT}`);
        } else {
            console.log(`Frontend dev server: ${CLIENT_URL}`);
        }
        console.log('========================\n');
    });
}

export default app;
