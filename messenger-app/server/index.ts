// Side-effect import: загружает .env ПЕРЕД всеми остальными модулями
import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeSocket } from './socket/index.js';
import { runStartupMigrations } from './lib/migrate.js';

// Загрузка конфигурации безопасности
const CLIENT_URL = process.env.VITE_CLIENT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Инициализация Express
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io (allow any origin for beta — same-origin in production build)
const io = initializeSocket(httpServer);
app.set('io', io);

// Trust first proxy (Vite dev server, nginx, etc.) so X-Forwarded-For works
app.set('trust proxy', 1);

// --- Блокировка и защита ---

// 1. Helmet для HTTP заголовков безопасности
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind injects inline styles
                imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co", "https://*"],
                mediaSrc: ["'self'", "blob:", "https://*.supabase.co"],
                connectSrc: ["'self'", "ws:", "wss:", "https://*.supabase.co", "https://*"],
            },
        },
        // В production-режиме Express раздает статику — нужно разрешить inline стили и скрипты
        crossOriginEmbedderPolicy: false,
    })
);

// 2. CORS — разрешаем известные источники + ngrok туннели для разработки
const ALLOWED_ORIGINS = [
    CLIENT_URL,
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
].filter(Boolean);

// Паттерны для dev-туннелей (ngrok, localtunnel и т.п.)
const ALLOWED_ORIGIN_PATTERNS = [
    /^https?:\/\/.*\.ngrok-free\.app$/,
    /^https?:\/\/.*\.ngrok\.io$/,
    /^https?:\/\/.*\.loca\.lt$/,
];

app.use(
    cors({
        origin: (origin, callback) => {
            // Разрешаем запросы без Origin (мобильные клиенты, curl, server-to-server)
            if (!origin) return callback(null, true);
            if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
            if (ALLOWED_ORIGIN_PATTERNS.some(p => p.test(origin))) return callback(null, true);
            // Не бросаем Error — это вызывает 500. Просто отклоняем origin.
            callback(null, false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// 3. Rate Limiting — мягкий лимит для бета
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000, // 3000 запросов за 15 мин (socket reconnects + API вместе набирают много)
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// --- Middleware ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// --- Статические файлы (локальные загрузки) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- API Роуты ---
import routes from './routes/index.js';
app.use('/api', routes);

// --- Production: раздаём собранный фронтенд ---
const distPath = path.resolve(__dirname, '../dist');
if (fs.existsSync(distPath)) {
    // Serve static assets (JS, CSS, images)
    app.use(express.static(distPath));

    // SPA catch-all: все не-API пути → index.html (Express 5 syntax)
    app.use((req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
            return next();
        }
        res.sendFile(path.join(distPath, 'index.html'));
    });

    console.log('Serving production frontend from dist/');
}

// Глобальный обработчик ошибок
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Global error:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// Запуск сервера
if (process.env.NODE_ENV !== 'test') {
    runStartupMigrations().catch(() => {});
    httpServer.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`\n=== Rumker Server v1.1 ===`);
        console.log(`Server running on http://0.0.0.0:${PORT}`);
        console.log(`Socket.io ready`);
        console.log(`Routes: /api/auth/me, /api/chats/:chatId/members, /api/friends`);
        console.log(`Started at: ${new Date().toISOString()}`);
        if (fs.existsSync(distPath)) {
            console.log(`Open in browser: http://localhost:${PORT}`);
        }
        console.log(`========================\n`);
    });
}

export default app;
