import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';

// userId -> Set<socketId>
const onlineUsers = new Map<string, Set<string>>();

let io: Server | null = null;

export function initializeSocket(httpServer: HttpServer): Server {
    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || origin.startsWith('http://localhost:')) {
                    return callback(null, true);
                }
                callback(new Error('Not allowed by CORS'));
            },
            credentials: true,
        },
    });

    // JWT auth middleware on handshake
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };
            (socket as any).userId = decoded.userId;
            (socket as any).username = decoded.username;
            next();
        } catch {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket: Socket) => {
        const userId = (socket as any).userId as string;

        // Track online status
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }
        onlineUsers.get(userId)!.add(socket.id);

        // Broadcast online status
        socket.broadcast.emit('user:online', { userId, isOnline: true });

        // --- Room management ---
        socket.on('chat:join', (chatId: string) => {
            socket.join(`chat:${chatId}`);
        });

        socket.on('chat:leave', (chatId: string) => {
            socket.leave(`chat:${chatId}`);
        });

        // --- Typing indicators ---
        socket.on('typing:start', (data: { chatId: string }) => {
            socket.to(`chat:${data.chatId}`).emit('typing:start', {
                userId,
                chatId: data.chatId,
            });
        });

        socket.on('typing:stop', (data: { chatId: string }) => {
            socket.to(`chat:${data.chatId}`).emit('typing:stop', {
                userId,
                chatId: data.chatId,
            });
        });

        // --- Read receipts ---
        socket.on('message:read', (data: { chatId: string; messageId: string }) => {
            socket.to(`chat:${data.chatId}`).emit('message:read', {
                userId,
                chatId: data.chatId,
                messageId: data.messageId,
            });
        });

        // --- Disconnect ---
        socket.on('disconnect', () => {
            const sockets = onlineUsers.get(userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    onlineUsers.delete(userId);
                    socket.broadcast.emit('user:online', { userId, isOnline: false });
                }
            }
        });
    });

    return io;
}

export function getIO(): Server {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
}

export function isUserOnline(userId: string): boolean {
    return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}
