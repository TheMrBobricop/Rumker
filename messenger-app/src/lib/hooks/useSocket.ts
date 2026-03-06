import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useCallStore } from '@/stores/callStore';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { socketService } from '@/lib/socket';
import { peerManager } from '@/lib/webrtc/PeerManager';
import { voiceChannelPeerManager } from '@/lib/webrtc/VoiceChannelPeerManager';
import { ringtone } from '@/lib/ringtone';
import { showBrowserNotification, playNotificationSound, playVoiceJoinSound, playBusySound, playCallConnectSound, playCallEndSound } from '@/lib/notifications';
import { toast } from 'sonner';

export function useSocket() {
    const token = useAuthStore((s) => s.token);
    const listenersRef = useRef(false);

    // Main effect: handle connect/disconnect/update based on token
    useEffect(() => {
        // Logout → disconnect everything
        if (!token) {
            if (listenersRef.current) {
                socketService.removeAllListeners();
                socketService.disconnect();
                listenersRef.current = false;
            }
            return;
        }

        // Token changed (refresh) but listeners already set up → just update auth
        if (listenersRef.current) {
            socketService.updateAuth(token);
            // If socket got disconnected, reconnect with fresh token
            if (!socketService.isConnected()) {
                socketService.connect(token);
            }
            return;
        }

        // First-time setup: connect and wire all event listeners
        socketService.connect(token);
        listenersRef.current = true;

        // Helper: read currentUserId from store at call-time (avoids stale closure)
        const getMyId = () => useAuthStore.getState().user?.id;

        // ── Message events ──

        socketService.onNewMessage((message) => {
            const myId = getMyId();

            if (message.senderId === myId) {
                // Own message: REST already replaced temp → real.
                // Socket also delivers it — skip if already in store.
                const chatMessages = useChatStore.getState().messages[message.chatId] || [];
                const exists = chatMessages.some((m) => m.id === message.id);
                if (exists) {
                    useChatStore.getState().updateChatLastMessage(message.chatId, message);
                    return;
                }
                // REST response not arrived yet — add it
                useChatStore.getState().addMessage(message);
                useChatStore.getState().updateChatLastMessage(message.chatId, message);
                return;
            }

            // Other user's message
            useChatStore.getState().addMessage(message);

            // If this chat is not in the list yet (new conversation), reload chats
            const chatExists = useChatStore.getState().chats.some(c => c.id === message.chatId);
            if (!chatExists) {
                useChatStore.getState().loadChats();
            } else {
                useChatStore.getState().updateChatLastMessage(message.chatId, message);
                useChatStore.getState().incrementUnread(message.chatId);
            }

            // Check if user is mentioned (@username)
            const myUsername = useAuthStore.getState().user?.username;
            const isMentioned = myUsername && message.content?.includes(`@${myUsername}`);

            // Notifications: check if chat is muted (mentions always notify)
            const chat = useChatStore.getState().chats.find(c => c.id === message.chatId);
            if (!chat?.isMuted || isMentioned) {
                const senderName = message.sender?.firstName || message.sender?.username || 'Сообщение';
                const body = isMentioned ? `упомянул(а) вас: ${message.content}` : (message.content || '');
                showBrowserNotification(senderName, body);
                playNotificationSound();
            }
        });

        socketService.onMessageEdit((message) => {
            useChatStore.getState().updateMessage(message);
        });

        socketService.onMessageDelete((data) => {
            useChatStore.getState().deleteMessage(data.chatId, data.messageId);
        });

        // Read receipts
        socketService.onMessageRead((data) => {
            if (data.userId !== getMyId()) {
                useChatStore.getState().markAsRead(data.chatId, data.messageId);
            }
        });

        socketService.onTypingStart((data) => {
            if (data.userId !== getMyId()) {
                useChatStore.getState().addTypingUser(data.chatId, data.userId);
                setTimeout(() => useChatStore.getState().removeTypingUser(data.chatId, data.userId), 3000);
            }
        });

        socketService.onTypingStop((data) => {
            if (data.userId !== getMyId()) {
                useChatStore.getState().removeTypingUser(data.chatId, data.userId);
            }
        });

        socketService.onUserOnline((data) => {
            useChatStore.getState().updateUserOnlineStatus(data.userId, data.isOnline);
        });

        socketService.onMessagePin((data) => {
            useChatStore.getState().addPinnedMessage(data.chatId, data.message);
        });

        socketService.onMessageUnpin((data) => {
            useChatStore.getState().removePinnedMessage(data.chatId, data.messageId);
        });

        socketService.onMessageUnpinAll((data) => {
            useChatStore.getState().clearPinnedMessages(data.chatId);
        });

        // ── Poll events ──

        socketService.onPollUpdate((data) => {
            const chatMessages = useChatStore.getState().messages[data.chatId] || [];
            const msg = chatMessages.find(m =>
                m.pollData?.id === data.pollId || (m.metadata as any)?.pollId === data.pollId
            );
            if (msg) {
                useChatStore.getState().updateMessage({
                    ...msg,
                    pollData: data.pollData,
                });
            }
        });

        // ── Reaction events ──

        socketService.onMessageReaction((data) => {
            const myId = getMyId();
            // Skip own reactions (optimistic update already applied)
            if (data.userId === myId) return;

            const chatMessages = useChatStore.getState().messages[data.chatId] || [];
            const msg = chatMessages.find(m => m.id === data.messageId);
            if (!msg) return;

            const reactions = (msg.reactions || []).map(r => ({ ...r, userIds: [...r.userIds] }));

            if (data.action === 'add') {
                const existing = reactions.find(r => r.emoji === data.emoji);
                if (existing) {
                    if (!existing.userIds.includes(data.userId)) {
                        existing.userIds.push(data.userId);
                    }
                } else {
                    reactions.push({ emoji: data.emoji, userIds: [data.userId] });
                }
            } else {
                const existing = reactions.find(r => r.emoji === data.emoji);
                if (existing) {
                    existing.userIds = existing.userIds.filter(id => id !== data.userId);
                    if (existing.userIds.length === 0) {
                        const idx = reactions.indexOf(existing);
                        reactions.splice(idx, 1);
                    }
                }
            }

            useChatStore.getState().updateMessage({ ...msg, reactions });
        });

        // ── Admin events ──

        socketService.onMemberRoleChanged((data) => {
            const myId = getMyId();
            useChatStore.getState().updateParticipantRole(
                data.chatId, data.userId, data.role, data.title, data.adminRights
            );
            if (data.userId === myId) {
                if (data.role === 'admin') {
                    toast.success('Вы назначены администратором');
                } else if (data.role === 'member') {
                    toast.info('Вы были понижены до участника');
                }
            }
        });

        socketService.onMemberTitleChanged((data) => {
            useChatStore.getState().updateParticipantTitle(data.chatId, data.userId, data.title);
        });

        socketService.onMemberRemoved((data) => {
            const myId = getMyId();
            if (data.userId === myId) {
                useChatStore.getState().removeChat(data.chatId);
                const activeChat = useChatStore.getState().activeChat;
                if (activeChat?.id === data.chatId) {
                    useChatStore.getState().setActiveChat(null);
                }
                toast.error(data.reason === 'banned' ? 'Вы заблокированы в этой группе' : 'Вы исключены из группы');
            } else {
                useChatStore.getState().removeParticipant(data.chatId, data.userId);
            }
        });

        socketService.onChatUpdated((data) => {
            useChatStore.getState().updateChatInfo(data.chatId, {
                title: data.name,
                description: data.description,
                avatar: data.avatar,
            });
        });

        // ── Reconnect: reload active chat messages ──

        socketService.onReconnect(() => {
            console.log('[useSocket] Reconnected — reloading chats, messages, and pins');
            useChatStore.getState().loadChats();
            const activeChat = useChatStore.getState().activeChat;
            if (activeChat) {
                useChatStore.getState().loadMessages(activeChat.id);
                useChatStore.getState().loadPinnedMessages(activeChat.id);
            }
        });

        // ── Voice channel events ──

        socketService.onVoiceUserJoined((data) => {
            const myId = getMyId();
            const store = useVoiceChannelStore.getState();

            const newParticipant = {
                userId: data.userId,
                username: data.username,
                firstName: data.firstName,
                avatar: data.avatar,
                isMuted: false,
                isDeafened: false,
                isSpeaking: false,
                joinedAt: new Date(),
            };

            // Update active channel participants (for VoiceChannelPanel)
            if (store.currentChannel?.id === data.channelId) {
                store.addParticipant(newParticipant);

                // Create WebRTC peer to the new user (we are the initiator)
                if (data.userId !== myId && voiceChannelPeerManager.getLocalStream()) {
                    if (!voiceChannelPeerManager.hasPeer(data.userId)) {
                        voiceChannelPeerManager.createPeer(data.userId, true);
                    }
                }

                // Play join chime
                if (data.userId !== myId) {
                    playVoiceJoinSound();
                }
            }

            // Also update participants in the categories list (for VoiceChannelList mini-view)
            store.setCategories(
                store.categories.map(cat => ({
                    ...cat,
                    channels: cat.channels.map(ch => {
                        if (ch.id !== data.channelId) return ch;
                        const already = ch.participants.some(p => p.userId === data.userId);
                        return already ? ch : { ...ch, participants: [...ch.participants, newParticipant] };
                    }),
                }))
            );
        });

        // Sync full participant list when WE join a channel
        socketService.onVoiceParticipantsSync((data) => {
            const myId = getMyId();
            const store = useVoiceChannelStore.getState();
            if (store.currentChannel?.id === data.channelId) {
                const participants = data.participants.map(p => ({
                    userId: p.userId,
                    username: p.username,
                    firstName: p.firstName,
                    avatar: p.avatar,
                    isMuted: p.isMuted,
                    isDeafened: p.isDeafened,
                    isSpeaking: false,
                    joinedAt: new Date(),
                }));
                store.setParticipants(participants);

                // Also update categories (mini-list)
                store.setCategories(
                    store.categories.map(cat => ({
                        ...cat,
                        channels: cat.channels.map(ch => {
                            if (ch.id !== data.channelId) return ch;
                            return { ...ch, participants };
                        }),
                    }))
                );

                // Create WebRTC peers to all existing participants (except self)
                for (const p of participants) {
                    if (p.userId !== myId && voiceChannelPeerManager.getLocalStream()) {
                        if (!voiceChannelPeerManager.hasPeer(p.userId)) {
                            voiceChannelPeerManager.createPeer(p.userId, true);
                        }
                    }
                }
            }
        });

        socketService.onVoiceUserLeft((data) => {
            const store = useVoiceChannelStore.getState();

            // Update active channel participants
            if (store.currentChannel?.id === data.channelId) {
                store.removeParticipant(data.userId);
                voiceChannelPeerManager.removePeer(data.userId);
            }

            // Also update participants in categories list (for VoiceChannelList mini-view)
            store.setCategories(
                store.categories.map(cat => ({
                    ...cat,
                    channels: cat.channels.map(ch => {
                        if (ch.id !== data.channelId) return ch;
                        return { ...ch, participants: ch.participants.filter(p => p.userId !== data.userId) };
                    }),
                }))
            );
        });

        socketService.onVoiceUserUpdated((data) => {
            const store = useVoiceChannelStore.getState();
            store.updateParticipant(data.userId, data);

            // Update in categories list too
            if (data.channelId) {
                store.setCategories(
                    store.categories.map(cat => ({
                        ...cat,
                        channels: cat.channels.map(ch => {
                            if (ch.id !== data.channelId) return ch;
                            return {
                                ...ch,
                                participants: ch.participants.map(p =>
                                    p.userId === data.userId ? { ...p, ...data } : p
                                ),
                            };
                        }),
                    }))
                );
            }
        });

        socketService.onVoiceUserSpeaking((data) => {
            const store = useVoiceChannelStore.getState();
            store.updateParticipant(data.userId, { isSpeaking: data.isSpeaking });

            // Update in categories list for mini-view speaking indicators
            store.setCategories(
                store.categories.map(cat => ({
                    ...cat,
                    channels: cat.channels.map(ch => {
                        if (ch.id !== data.channelId) return ch;
                        return {
                            ...ch,
                            participants: ch.participants.map(p =>
                                p.userId === data.userId ? { ...p, isSpeaking: data.isSpeaking } : p
                            ),
                        };
                    }),
                }))
            );
        });

        // ── Voice WebRTC signaling ──

        socketService.onVoiceOffer((data) => {
            if (data.fromUserId !== getMyId()) {
                voiceChannelPeerManager.handleOffer(data.fromUserId, data.offer);
            }
        });

        socketService.onVoiceAnswer((data) => {
            if (data.fromUserId !== getMyId()) {
                voiceChannelPeerManager.handleAnswer(data.fromUserId, data.answer);
            }
        });

        socketService.onVoiceIceCandidate((data) => {
            if (data.fromUserId !== getMyId()) {
                voiceChannelPeerManager.handleIceCandidate(data.fromUserId, data.candidate);
            }
        });

        // ── Voice Admin Events ──

        socketService.onVoiceAdminServerMuted((data) => {
            const vc = useVoiceChannelStore.getState();
            if (vc.currentChannel?.id === data.channelId) {
                vc.setMuted(data.muted);
                voiceChannelPeerManager.setMuted(data.muted);
                toast.warning(data.muted ? 'Администратор замутил вас' : 'Администратор размутил вас');
            }
        });

        socketService.onVoiceAdminServerDeafened((data) => {
            const vc = useVoiceChannelStore.getState();
            if (vc.currentChannel?.id === data.channelId) {
                vc.setDeafened(data.deafened);
                voiceChannelPeerManager.setDeafened(data.deafened);
                if (data.deafened) {
                    vc.setMuted(true);
                    voiceChannelPeerManager.setMuted(true);
                }
                toast.warning(data.deafened ? 'Администратор оглушил вас' : 'Администратор снял оглушение');
            }
        });

        socketService.onVoiceAdminDisconnected((data) => {
            const vc = useVoiceChannelStore.getState();
            if (vc.currentChannel?.id === data.channelId) {
                vc.leaveChannel();
                vc.setViewingChannel(null);
                toast.warning('Администратор отключил вас от голосового канала');
            }
        });

        socketService.onVoiceAdminMoved((data) => {
            const vc = useVoiceChannelStore.getState();
            if (vc.currentChannel?.id === data.fromChannelId) {
                // Leave current and join new
                voiceChannelPeerManager.destroy();
                vc.joinChannel(data.toChannelId);
                toast.info('Администратор переместил вас в другой канал');
            }
        });

        socketService.onVoicePrioritySpeaker((data) => {
            const vc = useVoiceChannelStore.getState();
            if (vc.currentChannel?.id === data.channelId) {
                vc.setPrioritySpeaker(data.userId);
            }
        });

        // ── Friend events ──

        socketService.onFriendRequest((data: { userId: string; username: string; firstName?: string; lastName?: string; avatar?: string }) => {
            const name = data.firstName || data.username || 'Пользователь';
            toast.info(`${name} отправил(а) заявку в друзья`);
            showBrowserNotification('Заявка в друзья', `${name} отправил(а) заявку`);
            playNotificationSound();
        });

        socketService.onFriendAccepted((data: { userId: string; username: string; firstName?: string; lastName?: string; avatar?: string }) => {
            const name = data.firstName || data.username || 'Пользователь';
            toast.success(`${name} принял(а) заявку в друзья`);
        });

        socketService.onFriendRejected(() => {
            // Silent — no toast needed for rejection
        });

        // ── Call events ──

        socketService.onCallIncoming((data) => {
            useCallStore.getState().setIncomingCall({
                callId: data.callId,
                chatId: data.chatId,
                chatTitle: data.chatTitle,
                callerId: data.callerId,
                callerName: data.callerName,
                callerAvatar: data.callerAvatar,
                type: data.type,
            });
            if (data.type === 'private') {
                ringtone.start();
            }
        });

        socketService.onCallStarted(async (data) => {
            const callStore = useCallStore.getState();
            const myId = getMyId();

            // If this is the initiator, set up active call
            if (!callStore.activeCall) {
                const isRinging = data.type === 'private';
                callStore.setActiveCall({
                    callId: data.callId,
                    chatId: data.chatId,
                    chatTitle: data.chatTitle || '',
                    type: data.type,
                    status: isRinging ? 'ringing' : 'active',
                    participants: data.participants || [],
                    startedAt: new Date(data.startedAt),
                    initiatorId: data.initiatorId,
                });

                // Start caller-side ringback tone for private calls (initiator only)
                if (isRinging && data.initiatorId === myId) {
                    ringtone.startCallerTone();
                }

                // Initialize WebRTC
                try {
                    const stream = await peerManager.init();
                    callStore.setLocalStream(stream);
                    peerManager.setCallId(data.callId);
                } catch (err) {
                    console.error('[useSocket] Failed to get mic access:', err);
                    toast.error('Нет доступа к микрофону');
                    ringtone.stop();
                    socketService.leaveCall(data.callId);
                    callStore.reset();
                }
            }
        });

        socketService.onCallUserJoined(async (data) => {
            const myId = getMyId();

            // Stop caller-side ringtone (callee answered)
            ringtone.stop();

            // Update participants list
            if ((data as any).participants) {
                for (const p of (data as any).participants) {
                    useCallStore.getState().addParticipant(p);
                }
            }

            // Update status to active
            useCallStore.getState().setCallStatus('active');

            // Play connection sound (private call connected)
            playCallConnectSound();

            // Start voice activity detection
            peerManager.startVoiceActivityDetection();

            // Play join chime when someone else joins
            if (data.userId !== myId) {
                playVoiceJoinSound();
                // Show notification for group voice joins
                const call = useCallStore.getState().activeCall;
                if (call?.type === 'group') {
                    const name = data.firstName || data.username || 'Пользователь';
                    toast.info(`${name} присоединился к звонку`);
                }
            }

            // Create peer connections for the new user
            if (data.userId !== myId) {
                // Use fresh state to check localStream (may have been set by onCallStarted)
                const freshState = useCallStore.getState();

                // If we don't have local stream yet, init first
                if (!freshState.localStream && !peerManager.getLocalStream()) {
                    try {
                        const stream = await peerManager.init();
                        useCallStore.getState().setLocalStream(stream);
                        peerManager.setCallId(useCallStore.getState().activeCall?.callId || data.callId);
                    } catch (err) {
                        console.error('[useSocket] Failed to get mic:', err);
                        toast.error('Нет доступа к микрофону');
                        return;
                    }
                }

                // The user who was already in the call initiates the peer connection
                if (!peerManager.hasPeer(data.userId)) {
                    console.log(`[useSocket] Creating initiator peer for ${data.userId}`);
                    peerManager.createPeer(data.userId, true);
                }
            }
        });

        socketService.onCallUserLeft((data) => {
            const myId = getMyId();
            if (data.userId !== myId) {
                peerManager.removePeer(data.userId);
                useCallStore.getState().removeParticipant(data.userId);
            }
        });

        socketService.onCallSignal(async (data) => {
            const myId = getMyId();
            if (data.fromUserId === myId) return;

            // Ensure we have local stream before creating peer
            if (!peerManager.getLocalStream()) {
                try {
                    const stream = await peerManager.init();
                    useCallStore.getState().setLocalStream(stream);
                    const callId = useCallStore.getState().activeCall?.callId;
                    if (callId) peerManager.setCallId(callId);
                } catch (err) {
                    console.error('[useSocket] Failed to init mic for incoming signal:', err);
                    return;
                }
            }

            // If we don't have a peer for this user yet, create one (non-initiator)
            if (!peerManager.hasPeer(data.fromUserId)) {
                peerManager.createPeer(data.fromUserId, false);
            }
            peerManager.handleSignal(data.fromUserId, data.signal);
        });

        socketService.onCallEnded((data) => {
            ringtone.stop();
            peerManager.destroy();
            playCallEndSound();
            const callStore = useCallStore.getState();

            // If this was our incoming call, clear it
            if (callStore.incomingCall?.callId === data.callId) {
                callStore.setIncomingCall(null);
            }
            // If this was our active call, reset
            if (callStore.activeCall?.callId === data.callId) {
                callStore.reset();
            }

            if (data.reason === 'timeout') {
                toast.info('Нет ответа');
            } else if (data.reason === 'ended') {
                toast.info('Звонок завершён');
            }
        });

        socketService.onCallRejected((data) => {
            ringtone.stop();
            const callStore = useCallStore.getState();
            if (callStore.activeCall?.callId === data.callId) {
                toast.info('Звонок отклонён');
                peerManager.destroy();
                playCallEndSound();
                callStore.reset();
            }
        });

        socketService.onCallMuteChanged((data) => {
            const myId = getMyId();
            if (data.userId !== myId) {
                useCallStore.getState().updateParticipantMute(data.userId, data.muted);
            }
        });

        socketService.onCallDeafenChanged((data) => {
            const myId = getMyId();
            if (data.userId !== myId) {
                useCallStore.getState().updateParticipantDeafen(data.userId, data.isDeafened);
            }
        });

        socketService.onCallError((data) => {
            toast.error(data.message || 'Ошибка звонка');
        });

        // Busy-line: caller gets notified the target is in another call
        socketService.onCallBusy(() => {
            ringtone.stop();
            peerManager.destroy();
            useCallStore.getState().reset();
            playBusySound();
            toast.info('Абонент занят');
        });

        // Missed call: the busy user gets a notification sound + toast
        socketService.onCallMissed((data) => {
            playNotificationSound();
            toast.info(`Пропущенный звонок от ${data.callerName}`);
        });

        // NOTE: No cleanup function returned here.
        // On token refresh, this effect re-runs but hits the early return
        // (listenersRef.current is true), so it just calls updateAuth.
        // Cleanup only happens via the unmount effect below.
    }, [token]);

    // Unmount cleanup — runs ONLY when the component unmounts
    useEffect(() => {
        return () => {
            socketService.removeAllListeners();
            socketService.disconnect();
            listenersRef.current = false;
        };
    }, []);
}
