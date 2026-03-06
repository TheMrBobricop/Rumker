import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';

// userId -> Set<socketId>
const onlineUsers = new Map<string, Set<string>>();

// In-memory cache: channelId -> chatId (voice channels change rarely)
const channelChatIdCache = new Map<string, { chatId: string; expiresAt: number }>();
const CHANNEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── In-memory call state ──
interface CallParticipant {
    userId: string;
    username: string;
    firstName?: string;
    avatar?: string;
    isMuted: boolean;
}

interface ActiveCall {
    callId: string;
    chatId: string;
    type: 'private' | 'group';
    initiatorId: string;
    participants: Map<string, CallParticipant>;
    startedAt: string;
    timeoutTimer?: ReturnType<typeof setTimeout>;
}

const activeCalls = new Map<string, ActiveCall>();
// Reverse index: userId -> callId for O(1) lookup
const userCallMap = new Map<string, string>();

/** Find a call that a given user is currently participating in */
function findCallByUser(userId: string): ActiveCall | undefined {
    const callId = userCallMap.get(userId);
    if (callId) {
        const call = activeCalls.get(callId);
        if (call && call.participants.has(userId)) return call;
        userCallMap.delete(userId); // stale entry
    }
    return undefined;
}

let io: Server | null = null;

/** Return the shared supabase client (static import — .env loaded by dotenv/config in server/index.ts) */
function getSupabase() {
    return supabase;
}

/** Get chat_id for a voice channel with caching */
async function getChannelChatId(channelId: string): Promise<string | null> {
    const cached = channelChatIdCache.get(channelId);
    if (cached && cached.expiresAt > Date.now()) return cached.chatId;

    const { data } = await getSupabase()
        .from('voice_channels')
        .select('chat_id')
        .eq('id', channelId)
        .single();

    if (data?.chat_id) {
        channelChatIdCache.set(channelId, { chatId: data.chat_id, expiresAt: Date.now() + CHANNEL_CACHE_TTL });
        return data.chat_id;
    }
    return null;
}

/** Auto-join a socket to all chat rooms the user participates in */
async function autoJoinAllRooms(socket: Socket, userId: string): Promise<void> {
    try {
        const { data, error } = await getSupabase()
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', userId);

        if (error) {
            console.error('[Socket] Failed to fetch user chats for auto-join:', error.message);
            return;
        }

        if (data) {
            for (const row of data) {
                socket.join(`chat:${row.chat_id}`);
            }
            console.log(`[Socket] Auto-joined user ${userId} to ${data.length} chat rooms`);
        }
    } catch (err) {
        console.error('[Socket] autoJoinAllRooms error:', err);
    }
    // Also join personal room for P2P signaling
    socket.join(`user:${userId}`);
}

/** Join a user (all their sockets) to a specific chat room — used by routes when creating chats */
export function joinUserToRoom(userId: string, chatId: string): void {
    if (!io) return;
    const socketIds = onlineUsers.get(userId);
    if (!socketIds) return;
    for (const sid of socketIds) {
        const socket = io.sockets.sockets.get(sid);
        if (socket) {
            socket.join(`chat:${chatId}`);
        }
    }
}

export function initializeSocket(httpServer: HttpServer): Server {
    const CLIENT_URL = process.env.VITE_CLIENT_URL || 'http://localhost:5173';
    const ALLOWED_ORIGINS = [CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'].filter(Boolean);
    const ALLOWED_ORIGIN_PATTERNS = [
        /^https?:\/\/.*\.ngrok-free\.app$/,
        /^https?:\/\/.*\.ngrok\.io$/,
        /^https?:\/\/.*\.loca\.lt$/,
    ];

    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);
                if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
                if (ALLOWED_ORIGIN_PATTERNS.some(p => p.test(origin))) return callback(null, true);
                callback(null, false);
            },
            credentials: true,
            methods: ['GET', 'POST'],
        },
    });

    // JWT auth middleware on handshake
    io.use((socket, next) => {
        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
            return next(new Error('Server misconfiguration: JWT_SECRET not set'));
        }
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

    io.on('connection', async (socket: Socket) => {
        const userId = (socket as any).userId as string;
        const username = (socket as any).username as string;

        // Track online status
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }
        onlineUsers.get(userId)!.add(socket.id);

        // Auto-join all chat rooms + cache user info in parallel
        const [, userResult] = await Promise.all([
            autoJoinAllRooms(socket, userId),
            getSupabase().from('users').select('id, username, first_name, last_name, avatar').eq('id', userId).single(),
        ]);

        // Cache user info on socket for reuse in voice/call handlers
        const userInfo = userResult?.data;
        if (userInfo) {
            (socket as any).userInfo = userInfo;
        }

        // Broadcast online status
        socket.broadcast.emit('user:online', { userId, isOnline: true });

        // --- Room management (manual join for newly created chats) ---
        // Проверяем членство перед добавлением в комнату
        socket.on('chat:join', async (chatId: string) => {
            try {
                const { data } = await getSupabase()
                    .from('chat_participants')
                    .select('user_id')
                    .eq('chat_id', chatId)
                    .eq('user_id', userId)
                    .maybeSingle();
                if (data) {
                    socket.join(`chat:${chatId}`);
                }
            } catch (err) {
                console.error('[Socket] chat:join membership check error:', err);
            }
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

        // --- Voice Channels ---
        socket.on('voice:join', async (data: { channelId: string }) => {
            try {
                const chatId = await getChannelChatId(data.channelId);
                if (!chatId) return;

                // Remove from other channels + upsert into new one in parallel
                await Promise.all([
                    getSupabase().from('voice_channel_participants').delete().eq('user_id', userId).neq('channel_id', data.channelId),
                    getSupabase().from('voice_channel_participants').upsert({
                        channel_id: data.channelId,
                        user_id: userId,
                        is_muted: false,
                        is_deafened: false,
                    }, { onConflict: 'channel_id,user_id' }),
                ]);

                // Use cached user info from socket
                const user = (socket as any).userInfo;

                // Notify OTHER users in the chat room
                socket.to(`chat:${chatId}`).emit('voice:user:joined', {
                    channelId: data.channelId,
                    chatId,
                    userId,
                    username: user?.username || '',
                    firstName: user?.first_name || '',
                    avatar: user?.avatar || '',
                });

                // Fetch ALL current participants and send to the joining user
                const { data: participants } = await getSupabase()
                    .from('voice_channel_participants')
                    .select('user_id, is_muted, is_deafened, users(id, username, first_name, last_name, avatar)')
                    .eq('channel_id', data.channelId);

                const participantList = (participants || []).map((p: any) => ({
                    userId: p.user_id,
                    username: p.users?.username || '',
                    firstName: p.users?.first_name || '',
                    avatar: p.users?.avatar || '',
                    isMuted: p.is_muted || false,
                    isDeafened: p.is_deafened || false,
                }));

                socket.emit('voice:participants:sync', {
                    channelId: data.channelId,
                    participants: participantList,
                });
            } catch (err) {
                console.error('[Socket] voice:join error:', err);
            }
        });

        socket.on('voice:leave', async (data: { channelId: string }) => {
            try {
                const chatId = await getChannelChatId(data.channelId);

                await getSupabase()
                    .from('voice_channel_participants')
                    .delete()
                    .eq('channel_id', data.channelId)
                    .eq('user_id', userId);

                if (chatId) {
                    socket.to(`chat:${chatId}`).emit('voice:user:left', {
                        channelId: data.channelId,
                        chatId,
                        userId,
                    });
                }
            } catch (err) {
                console.error('[Socket] voice:leave error:', err);
            }
        });

        socket.on('voice:mute', async (data: { channelId: string; muted: boolean }) => {
            try {
                const [, chatId] = await Promise.all([
                    getSupabase().from('voice_channel_participants').update({ is_muted: data.muted }).eq('channel_id', data.channelId).eq('user_id', userId),
                    getChannelChatId(data.channelId),
                ]);

                if (chatId) {
                    socket.to(`chat:${chatId}`).emit('voice:user:updated', {
                        channelId: data.channelId,
                        userId,
                        isMuted: data.muted,
                    });
                }
            } catch (err) {
                console.error('[Socket] voice:mute error:', err);
            }
        });

        socket.on('voice:deafen', async (data: { channelId: string; deafened: boolean }) => {
            try {
                const [, chatId] = await Promise.all([
                    getSupabase().from('voice_channel_participants').update({ is_deafened: data.deafened }).eq('channel_id', data.channelId).eq('user_id', userId),
                    getChannelChatId(data.channelId),
                ]);

                if (chatId) {
                    socket.to(`chat:${chatId}`).emit('voice:user:updated', {
                        channelId: data.channelId,
                        userId,
                        isDeafened: data.deafened,
                    });
                }
            } catch (err) {
                console.error('[Socket] voice:deafen error:', err);
            }
        });

        socket.on('voice:speaking', async (data: { channelId: string; speaking: boolean }) => {
            try {
                const chatId = await getChannelChatId(data.channelId);

                if (chatId) {
                    socket.to(`chat:${chatId}`).emit('voice:user:speaking', {
                        channelId: data.channelId,
                        userId,
                        isSpeaking: data.speaking,
                    });
                }
            } catch {
                // Fallback to broadcast if DB lookup fails
                socket.broadcast.emit('voice:user:speaking', {
                    channelId: data.channelId,
                    userId,
                    isSpeaking: data.speaking,
                });
            }
        });

        // Voice channel text chat — ephemeral messages (not persisted)
        socket.on('voice:chat:message', async (data: { channelId: string; content: string }) => {
            try {
                if (!data.content?.trim()) return;

                const chatId = await getChannelChatId(data.channelId);
                const user = (socket as any).userInfo;

                if (chatId) {
                    socket.to(`chat:${chatId}`).emit('voice:chat:message', {
                        channelId: data.channelId,
                        userId,
                        username: user?.first_name || user?.username || 'User',
                        content: data.content.trim().slice(0, 500),
                    });
                }
            } catch (err) {
                console.error('[Socket] voice:chat:message error:', err);
            }
        });

        // WebRTC signaling relay
        socket.on('voice:offer', (data: { targetUserId: string; offer: any }) => {
            io?.to(`user:${data.targetUserId}`).emit('voice:offer', {
                fromUserId: userId,
                offer: data.offer,
            });
        });

        socket.on('voice:answer', (data: { targetUserId: string; answer: any }) => {
            io?.to(`user:${data.targetUserId}`).emit('voice:answer', {
                fromUserId: userId,
                answer: data.answer,
            });
        });

        socket.on('voice:ice-candidate', (data: { targetUserId: string; candidate: any }) => {
            io?.to(`user:${data.targetUserId}`).emit('voice:ice-candidate', {
                fromUserId: userId,
                candidate: data.candidate,
            });
        });

        // ── Soundboard ──
        const soundboardCooldowns = new Map<string, number>();

        socket.on('soundboard:play', async (data: { channelId: string; soundId: string; soundName: string; soundUrl?: string; isDefault: boolean }) => {
            const cooldownKey = `${userId}:${data.channelId}`;
            const lastPlay = soundboardCooldowns.get(cooldownKey) || 0;
            if (Date.now() - lastPlay < 3000) return; // 3s cooldown

            soundboardCooldowns.set(cooldownKey, Date.now());

            const chatId = await getChannelChatId(data.channelId);
            if (!chatId) return;

            const userInfo = (socket as any).userInfo;
            socket.to(`chat:${chatId}`).emit('soundboard:played', {
                channelId: data.channelId,
                userId,
                username: userInfo?.first_name || userInfo?.username || username,
                soundId: data.soundId,
                soundName: data.soundName,
                soundUrl: data.soundUrl,
                isDefault: data.isDefault,
            });
        });

        // ── Screen share tracking ──
        socket.on('voice:screen:start', async (data: { channelId: string }) => {
            const chatId = await getChannelChatId(data.channelId);
            if (!chatId) return;
            const userInfo = (socket as any).userInfo;
            socket.to(`chat:${chatId}`).emit('voice:screen:started', {
                channelId: data.channelId,
                userId,
                username: userInfo?.first_name || userInfo?.username || username,
            });
        });

        socket.on('voice:screen:stop', async (data: { channelId: string }) => {
            const chatId = await getChannelChatId(data.channelId);
            if (!chatId) return;
            socket.to(`chat:${chatId}`).emit('voice:screen:stopped', {
                channelId: data.channelId,
                userId,
            });
        });

        // ── Voice Admin Actions ──
        socket.on('voice:admin:mute', async (data: { channelId: string; targetUserId: string; muted: boolean }) => {
            const chatId = await getChannelChatId(data.channelId);
            if (!chatId) return;

            // Check admin rights
            const { data: participant } = await getSupabase()
                .from('chat_participants')
                .select('role, admin_rights')
                .eq('chat_id', chatId)
                .eq('user_id', userId)
                .single();

            if (!participant || (participant.role !== 'owner' && participant.role !== 'admin')) return;

            // Update in DB
            await getSupabase()
                .from('voice_channel_participants')
                .update({ is_muted: data.muted })
                .eq('channel_id', data.channelId)
                .eq('user_id', data.targetUserId);

            // Notify target user to force-mute
            io?.to(`user:${data.targetUserId}`).emit('voice:admin:server-muted', {
                channelId: data.channelId,
                muted: data.muted,
                mutedBy: userId,
            });

            // Broadcast to room
            io?.to(`chat:${chatId}`).emit('voice:user:updated', {
                channelId: data.channelId,
                userId: data.targetUserId,
                isMuted: data.muted,
                isServerMuted: true,
            });
        });

        socket.on('voice:admin:deafen', async (data: { channelId: string; targetUserId: string; deafened: boolean }) => {
            const chatId = await getChannelChatId(data.channelId);
            if (!chatId) return;

            const { data: participant } = await getSupabase()
                .from('chat_participants')
                .select('role, admin_rights')
                .eq('chat_id', chatId)
                .eq('user_id', userId)
                .single();

            if (!participant || (participant.role !== 'owner' && participant.role !== 'admin')) return;

            await getSupabase()
                .from('voice_channel_participants')
                .update({ is_deafened: data.deafened })
                .eq('channel_id', data.channelId)
                .eq('user_id', data.targetUserId);

            io?.to(`user:${data.targetUserId}`).emit('voice:admin:server-deafened', {
                channelId: data.channelId,
                deafened: data.deafened,
            });

            io?.to(`chat:${chatId}`).emit('voice:user:updated', {
                channelId: data.channelId,
                userId: data.targetUserId,
                isDeafened: data.deafened,
            });
        });

        socket.on('voice:admin:disconnect', async (data: { channelId: string; targetUserId: string }) => {
            const chatId = await getChannelChatId(data.channelId);
            if (!chatId) return;

            const { data: participant } = await getSupabase()
                .from('chat_participants')
                .select('role, admin_rights')
                .eq('chat_id', chatId)
                .eq('user_id', userId)
                .single();

            if (!participant || (participant.role !== 'owner' && participant.role !== 'admin')) return;

            // Remove from DB
            await getSupabase()
                .from('voice_channel_participants')
                .delete()
                .eq('channel_id', data.channelId)
                .eq('user_id', data.targetUserId);

            // Notify target user
            io?.to(`user:${data.targetUserId}`).emit('voice:admin:disconnected', {
                channelId: data.channelId,
            });

            // Broadcast leave
            io?.to(`chat:${chatId}`).emit('voice:user:left', {
                channelId: data.channelId,
                chatId,
                userId: data.targetUserId,
            });
        });

        socket.on('voice:admin:move', async (data: { channelId: string; targetUserId: string; targetChannelId: string }) => {
            const chatId = await getChannelChatId(data.channelId);
            if (!chatId) return;

            const { data: participant } = await getSupabase()
                .from('chat_participants')
                .select('role, admin_rights')
                .eq('chat_id', chatId)
                .eq('user_id', userId)
                .single();

            if (!participant || (participant.role !== 'owner' && participant.role !== 'admin')) return;

            // Remove from old channel
            await getSupabase()
                .from('voice_channel_participants')
                .delete()
                .eq('channel_id', data.channelId)
                .eq('user_id', data.targetUserId);

            // Add to new channel
            await getSupabase()
                .from('voice_channel_participants')
                .upsert({
                    channel_id: data.targetChannelId,
                    user_id: data.targetUserId,
                    is_muted: false,
                    is_deafened: false,
                    joined_at: new Date().toISOString(),
                });

            // Notify target
            io?.to(`user:${data.targetUserId}`).emit('voice:admin:moved', {
                fromChannelId: data.channelId,
                toChannelId: data.targetChannelId,
            });

            // Broadcast leave from old
            io?.to(`chat:${chatId}`).emit('voice:user:left', {
                channelId: data.channelId,
                chatId,
                userId: data.targetUserId,
            });

            const targetChatId = await getChannelChatId(data.targetChannelId);
            if (targetChatId) {
                const userInfo = (socket as any).userInfo || {};
                io?.to(`chat:${targetChatId}`).emit('voice:user:joined', {
                    channelId: data.targetChannelId,
                    chatId: targetChatId,
                    userId: data.targetUserId,
                    username: userInfo.username || '',
                    firstName: userInfo.first_name || '',
                    avatar: userInfo.avatar || '',
                });
            }
        });

        socket.on('voice:admin:priority-speaker', async (data: { channelId: string; targetUserId: string | null }) => {
            const chatId = await getChannelChatId(data.channelId);
            if (!chatId) return;

            io?.to(`chat:${chatId}`).emit('voice:priority-speaker', {
                channelId: data.channelId,
                userId: data.targetUserId,
            });
        });

        // ── Call handlers ──

        socket.on('call:initiate', async (data: { chatId: string; type: 'private' | 'group' }) => {
            try {
                const callId = crypto.randomUUID();

                // Use cached user info + fetch chat info in parallel
                const initiator = (socket as any).userInfo;
                const { data: chat } = await getSupabase()
                    .from('chats')
                    .select('id, name, type')
                    .eq('id', data.chatId)
                    .single();

                let chatTitle = chat?.name || '';
                if (!chatTitle && chat?.type === 'private') {
                    chatTitle = initiator?.first_name || initiator?.username || '';
                }

                // Fetch chat participants once — reused for busy check and call:incoming
                let chatParticipants: any[] | null = null;
                if (data.type === 'private') {
                    const { data: participants } = await getSupabase()
                        .from('chat_participants')
                        .select('user_id')
                        .eq('chat_id', data.chatId);
                    chatParticipants = participants;

                    const targetUser = (participants || []).find(p => p.user_id !== userId);
                    if (targetUser) {
                        const existingCall = findCallByUser(targetUser.user_id);
                        if (existingCall) {
                            // Target is busy
                            socket.emit('call:busy', { callId, chatId: data.chatId, targetUserId: targetUser.user_id });
                            // Notify target about missed call
                            io?.to(`user:${targetUser.user_id}`).emit('call:missed', {
                                callId,
                                chatId: data.chatId,
                                callerId: userId,
                                callerName: initiator?.first_name || initiator?.username || 'Пользователь',
                            });
                            return;
                        }
                    }
                }

                // Check if initiator is already in a call
                if (findCallByUser(userId)) {
                    socket.emit('call:error', { message: 'Вы уже в звонке' });
                    return;
                }

                // Create the call
                const call: ActiveCall = {
                    callId,
                    chatId: data.chatId,
                    type: data.type,
                    initiatorId: userId,
                    participants: new Map(),
                    startedAt: new Date().toISOString(),
                };

                // Add initiator as first participant
                call.participants.set(userId, {
                    userId,
                    username: initiator?.username || '',
                    firstName: initiator?.first_name || undefined,
                    avatar: initiator?.avatar || undefined,
                    isMuted: false,
                });
                userCallMap.set(userId, callId);

                // Set 30s timeout for private calls
                if (data.type === 'private') {
                    call.timeoutTimer = setTimeout(() => {
                        if (call.participants.size <= 1) {
                            io?.to(`user:${userId}`).emit('call:ended', { callId, reason: 'timeout' });
                            io?.to(`chat:${data.chatId}`).emit('call:ended', { callId, reason: 'timeout' });
                            if (call.timeoutTimer) clearTimeout(call.timeoutTimer);
                            activeCalls.delete(callId);
                        }
                    }, 30000);
                }

                activeCalls.set(callId, call);

                const participantsArr = Array.from(call.participants.values()).map(p => ({
                    ...p,
                    volume: 100,
                }));

                // Emit call:started to initiator
                socket.emit('call:started', {
                    callId,
                    chatId: data.chatId,
                    chatTitle,
                    type: data.type,
                    initiatorId: userId,
                    participants: participantsArr,
                    startedAt: call.startedAt,
                });

                // Emit call:incoming to the other user(s) — reuse participants from busy check
                if (data.type === 'private') {
                    // Reuse chatParticipants fetched above for busy check
                    const targetUser = (chatParticipants || []).find((p: any) => p.user_id !== userId);
                    if (targetUser) {
                        io?.to(`user:${targetUser.user_id}`).emit('call:incoming', {
                            callId,
                            chatId: data.chatId,
                            chatTitle,
                            callerId: userId,
                            callerName: initiator?.first_name || initiator?.username || 'Пользователь',
                            callerAvatar: initiator?.avatar || '',
                            type: data.type,
                        });
                    }
                } else {
                    // Group call — emit to the chat room
                    socket.to(`chat:${data.chatId}`).emit('call:incoming', {
                        callId,
                        chatId: data.chatId,
                        chatTitle,
                        callerId: userId,
                        callerName: initiator?.first_name || initiator?.username || 'Пользователь',
                        callerAvatar: initiator?.avatar || '',
                        type: data.type,
                    });
                }
            } catch (err) {
                console.error('[Socket] call:initiate error:', err);
                socket.emit('call:error', { message: 'Не удалось начать звонок' });
            }
        });

        socket.on('call:accept', async (data: { callId: string }) => {
            try {
                const call = activeCalls.get(data.callId);
                if (!call) {
                    socket.emit('call:error', { message: 'Звонок не найден' });
                    return;
                }

                // Clear timeout
                if (call.timeoutTimer) {
                    clearTimeout(call.timeoutTimer);
                    call.timeoutTimer = undefined;
                }

                // Use cached user info
                const user = (socket as any).userInfo;

                // Add to participants
                call.participants.set(userId, {
                    userId,
                    username: user?.username || '',
                    firstName: user?.first_name || undefined,
                    avatar: user?.avatar || undefined,
                    isMuted: false,
                });
                userCallMap.set(userId, call.callId);

                const participantsArr = Array.from(call.participants.values()).map(p => ({
                    ...p,
                    volume: 100,
                }));

                // Emit to all call participants
                for (const pId of call.participants.keys()) {
                    io?.to(`user:${pId}`).emit('call:user-joined', {
                        callId: call.callId,
                        userId,
                        username: user?.username || '',
                        firstName: user?.first_name || undefined,
                        avatar: user?.avatar || undefined,
                        participants: participantsArr,
                    });
                }
            } catch (err) {
                console.error('[Socket] call:accept error:', err);
            }
        });

        socket.on('call:reject', (data: { callId: string }) => {
            const call = activeCalls.get(data.callId);
            if (!call) return;

            // Emit rejected to initiator
            io?.to(`user:${call.initiatorId}`).emit('call:rejected', {
                callId: call.callId,
                userId,
            });

            // For private calls, end the call entirely
            if (call.type === 'private') {
                if (call.timeoutTimer) clearTimeout(call.timeoutTimer);
                for (const pId of call.participants.keys()) {
                    io?.to(`user:${pId}`).emit('call:ended', { callId: call.callId, reason: 'rejected' });
                }
                activeCalls.delete(data.callId);
            }
        });

        socket.on('call:join', async (data: { callId: string }) => {
            // Same as accept — for group calls joining after start
            try {
                const call = activeCalls.get(data.callId);
                if (!call) {
                    socket.emit('call:error', { message: 'Звонок не найден' });
                    return;
                }

                // Use cached user info
                const user = (socket as any).userInfo;

                call.participants.set(userId, {
                    userId,
                    username: user?.username || '',
                    firstName: user?.first_name || undefined,
                    avatar: user?.avatar || undefined,
                    isMuted: false,
                });
                userCallMap.set(userId, call.callId);

                const participantsArr = Array.from(call.participants.values()).map(p => ({
                    ...p,
                    volume: 100,
                }));

                for (const pId of call.participants.keys()) {
                    io?.to(`user:${pId}`).emit('call:user-joined', {
                        callId: call.callId,
                        userId,
                        username: user?.username || '',
                        firstName: user?.first_name || undefined,
                        avatar: user?.avatar || undefined,
                        participants: participantsArr,
                    });
                }
            } catch (err) {
                console.error('[Socket] call:join error:', err);
            }
        });

        socket.on('call:signal', (data: { callId: string; targetUserId: string; signal: any }) => {
            io?.to(`user:${data.targetUserId}`).emit('call:signal', {
                callId: data.callId,
                fromUserId: userId,
                toUserId: data.targetUserId,
                signal: data.signal,
            });
        });

        socket.on('call:toggle-mute', (data: { callId: string; muted: boolean }) => {
            const call = activeCalls.get(data.callId);
            if (!call) return;

            const participant = call.participants.get(userId);
            if (participant) {
                participant.isMuted = data.muted;
            }

            // Notify others
            for (const pId of call.participants.keys()) {
                if (pId !== userId) {
                    io?.to(`user:${pId}`).emit('call:mute-changed', {
                        callId: data.callId,
                        userId,
                        muted: data.muted,
                    });
                }
            }
        });

        socket.on('call:toggle-deafen', (data: { callId: string; isDeafened: boolean }) => {
            const call = activeCalls.get(data.callId);
            if (!call) return;

            // Notify others
            for (const pId of call.participants.keys()) {
                if (pId !== userId) {
                    io?.to(`user:${pId}`).emit('call:deafen-changed', {
                        callId: data.callId,
                        userId,
                        isDeafened: data.isDeafened,
                    });
                }
            }
        });

        socket.on('call:leave', (data: { callId: string }) => {
            const call = activeCalls.get(data.callId);
            if (!call) return;

            call.participants.delete(userId);
            userCallMap.delete(userId);

            // Notify others
            for (const pId of call.participants.keys()) {
                io?.to(`user:${pId}`).emit('call:user-left', {
                    callId: data.callId,
                    userId,
                });
            }

            // If no participants left, clean up
            if (call.participants.size === 0) {
                if (call.timeoutTimer) clearTimeout(call.timeoutTimer);
                activeCalls.delete(data.callId);
            }
        });

        socket.on('call:end', (data: { callId: string }) => {
            const call = activeCalls.get(data.callId);
            if (!call) return;

            if (call.timeoutTimer) clearTimeout(call.timeoutTimer);

            // Notify all participants and clean reverse index
            for (const pId of call.participants.keys()) {
                userCallMap.delete(pId);
                io?.to(`user:${pId}`).emit('call:ended', {
                    callId: data.callId,
                    reason: 'ended',
                });
            }

            activeCalls.delete(data.callId);
        });

        socket.on('call:get-active', (data: { chatId: string }, callback: (result: any) => void) => {
            if (typeof callback !== 'function') return;

            for (const call of activeCalls.values()) {
                if (call.chatId === data.chatId) {
                    const participantsArr = Array.from(call.participants.values()).map(p => ({
                        ...p,
                        volume: 100,
                    }));
                    return callback({
                        callId: call.callId,
                        chatId: call.chatId,
                        type: call.type,
                        status: 'active',
                        participants: participantsArr,
                        startedAt: call.startedAt,
                        initiatorId: call.initiatorId,
                    });
                }
            }

            callback(null);
        });

        // --- Disconnect ---
        socket.on('disconnect', async () => {
            // Clean up calls on disconnect (O(1) via reverse index)
            const userCallId = userCallMap.get(userId);
            if (userCallId) {
                const call = activeCalls.get(userCallId);
                if (call) {
                    call.participants.delete(userId);

                    // Notify remaining participants
                    for (const pId of call.participants.keys()) {
                        io?.to(`user:${pId}`).emit('call:user-left', {
                            callId: userCallId,
                            userId,
                        });
                    }

                    // If no participants left, clean up
                    if (call.participants.size === 0) {
                        if (call.timeoutTimer) clearTimeout(call.timeoutTimer);
                        activeCalls.delete(userCallId);
                    }
                }
                userCallMap.delete(userId);
            }
            // Clean up voice channel participation only if this is the user's last socket
            const sockets = onlineUsers.get(userId);
            const remainingSockets = sockets ? sockets.size - 1 : 0; // -1 because current socket hasn't been removed yet
            if (remainingSockets <= 0) {
                try {
                    const { data: voiceParts } = await getSupabase()
                        .from('voice_channel_participants')
                        .select('channel_id, voice_channels(chat_id)')
                        .eq('user_id', userId);

                    if (voiceParts) {
                        for (const vp of voiceParts) {
                            const chatId = (vp as any).voice_channels?.chat_id;
                            if (chatId) {
                                socket.to(`chat:${chatId}`).emit('voice:user:left', {
                                    channelId: vp.channel_id,
                                    chatId,
                                    userId,
                                });
                            }
                        }
                        await getSupabase()
                            .from('voice_channel_participants')
                            .delete()
                            .eq('user_id', userId);
                    }
                } catch { /* ignore cleanup errors */ }
            }
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
