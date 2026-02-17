
import express from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeSocket } from './socket/index.js';
import { runStartupMigrations } from './lib/migrate.js';

// Загружаем переменные окружения
dotenv.config();

// Загрузка конфигурации безопасности
const CLIENT_URL = process.env.VITE_CLIENT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 3000;

// Инициализация Express
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
const io = initializeSocket(httpServer);
app.set('io', io);

// --- Блокировка и защита (Фаза 2.2) ---

// 1. Helmet для HTTP заголовков безопасности
app.use(helmet());
app.use(
    helmet.contentSecurityPolicy({
        // Настройка специфична для проекта, разрешаем загрузку ресурсов с нашего сервера и сокета
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Для разработки React с HMR
            imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
            mediaSrc: ["'self'", "blob:", "https://*.supabase.co"],
            connectSrc: ["'self'", CLIENT_URL, 'ws://localhost:3000', 'ws://localhost:3001', 'ws://localhost:5173', "https://*.supabase.co"],
        },
    })
);

// 2. CORS - ограничиваем доступ только с нашего клиента
const allowedOrigins = [
    CLIENT_URL,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://localhost:5178',
];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
                return callback(null, true);
            }
            callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// 3. Rate Limiting - защита от брутфорс атак (временно отключено для теста)
// const limiter = rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 минут
//     max: 100, // Лимит 100 запросов с одного IP
//     message: 'Too many requests from this IP, please try again after 15 minutes',
//     standardHeaders: true, // Возвращает `RateLimit-*` заголовки
//     legacyHeaders: false, // Отключает `X-RateLimit-*` заголовки
// });
// app.use('/api', limiter); // Применяем лимит ко всем API запросам

// --- Middleware ---
app.use(express.json({ limit: '100mb' })); // Парсинг JSON (увеличенный лимит для больших запросов)
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser()); // Парсинг кук

// --- Статические файлы (локальные загрузки) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// --- API Роуты ---
import routes from './routes/index.js';
app.use('/api', routes);

// Глобальный обработчик ошибок
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Global error:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// Запуск сервера
if (process.env.NODE_ENV !== 'test') {
    runStartupMigrations().catch(() => {});
    httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Socket.io ready`);
    });
}

export default app;
