
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from 'sonner';
import { Search, MoreVertical, ArrowLeft, Phone, MessageSquare, Image, ChevronDown, X, Copy, Trash2, Forward, Check, BellOff, Bell, Info } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { MessageContextMenu } from './MessageContextMenu';
import { PinnedMessageBar } from './PinnedMessageBar';
import { ContactPicker } from './ContactPicker';
import { UserProfilePanel } from '@/components/users/UserProfilePanel';
import { uploadChatFile, markMessagesRead, pinMessage as apiPinMessage, unpinMessage as apiUnpinMessage, unpinAllMessages as apiUnpinAll, searchMessages, deleteChat as apiDeleteChat } from '@/lib/api/chats';
import { createPoll } from '@/lib/api/polls';
import { socketService } from '@/lib/socket';
import { useCallStore } from '@/stores/callStore';
import { peerManager } from '@/lib/webrtc/PeerManager';
import { useSwipeBack } from '@/lib/hooks/useSwipeBack';
import { playMessageSendSound } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { getUserColor } from '@/lib/userColors';
import type { Message, Sticker } from '@/types';
import type { EditingMessage } from './MessageInput';
import type { MediaItem } from '@/components/media/MediaViewer';

// Lazy-loaded heavy components
const PollCreator = lazy(() => import('./PollCreator').then(m => ({ default: m.PollCreator })));
const GifPicker = lazy(() => import('./GifPicker').then(m => ({ default: m.GifPicker })));
const GroupInfoPanel = lazy(() => import('./GroupInfoPanel').then(m => ({ default: m.GroupInfoPanel })));

interface ChatWindowProps {
    onBack?: () => void;
}

interface ContextMenuState {
    messageId: string;
    message: Message;
    x: number;
    y: number;
}

export function ChatWindow({ onBack }: ChatWindowProps) {
    const activeChat = useChatStore((s) => s.activeChat);
    const messages = useChatStore((s) => s.messages);
    const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
    const isLoadingMore = useChatStore((s) => s.isLoadingMore);
    const hasMore = useChatStore((s) => s.hasMore);
    const typingUsers = useChatStore((s) => s.typingUsers);
    const currentUser = useAuthStore((s) => s.user);

    // Ref to save unread state BEFORE clearUnread zeroes it — used for divider & badge
    const initialUnreadRef = useRef<{ chatId: string; count: number; lastReadId: string } | null>(null);
    const appearance = useSettingsStore((s) => s.appearance);

    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Track whether user is near the bottom — prevents auto-scroll when scrolled up
    const isNearBottomRef = useRef(true);

    // Scroll anchoring for loadMore — saves the visible item key + offset before prepend
    const loadMoreAnchorRef = useRef<{ key: string; offsetFromStart: number } | null>(null);
    const wasLoadingMoreRef = useRef(false);

    // Saved scroll positions per chat for restoring on re-entry
    const savedScrollPositions = useRef<Record<string, number>>({});

    // Chat ready state — hides container until initial scroll completes to prevent flash
    // Must be state (not ref) so that setting it to true triggers a re-render and removes opacity-0
    const [chatReady, setChatReady] = useState(true);
    const chatReadyRef = useRef(true);

    // Track which chats have had their initial load attempt — prevents "Нет сообщений" flash
    const loadedChatsRef = useRef<Set<string>>(new Set());

    // Ref to avoid re-registering scroll listener when scroll-down button toggles
    const showScrollDownRef = useRef(false);

    // Desktop detection for inline panels vs Sheet
    const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
    useEffect(() => {
        const onResize = () => setIsDesktop(window.innerWidth >= 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const [resetUploaderKey, setResetUploaderKey] = useState(0);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [profileOpen, setProfileOpen] = useState(false);
    const [groupInfoOpen, setGroupInfoOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [editingMessage, setEditingMessage] = useState<EditingMessage | null>(null);
    const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);

    // Scroll-to-bottom with exit animation
    const [showScrollDown, setShowScrollDown] = useState(false);
    const [scrollBtnExiting, setScrollBtnExiting] = useState(false);

    // Pinned messages — from centralized store
    const pinnedMessagesMap = useChatStore((s) => s.pinnedMessages);
    const pinnedMessages = useMemo(() => pinnedMessagesMap[activeChat?.id || ''] ?? [], [pinnedMessagesMap, activeChat?.id]);
    const [pinnedBarDismissed, setPinnedBarDismissed] = useState(false);

    // Selection mode
    const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
    const selectionMode = selectedMessages.size > 0;
    const dragSelectingRef = useRef(false);
    const lastDragMsgRef = useRef<string | null>(null);
    const justEnteredSelectionRef = useRef(false);
    const dragModeRef = useRef<'add' | 'remove'>('add');

    // Message search
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Message[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Mute state — read from the chat object (synced via store)
    const isChatMuted = activeChat?.isMuted ?? false;

    // Delete confirmation
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Forward dialog
    const [showForwardDialog, setShowForwardDialog] = useState(false);

    // Attachment menu modals
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [showContactPicker, setShowContactPicker] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);

    // Drag-and-drop files
    const [isDragging, setIsDragging] = useState(false);
    const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
    const dragCounter = useRef(0);

    // Track previous message count per chat for animation optimization
    const prevMsgCountRef = useRef<Record<string, number>>({});

    // Swipe back for mobile
    const swipeRef = useSwipeBack({
        onSwipeBack: () => onBack?.(),
        enabled: !!onBack && !!activeChat,
    });

    // Socket: join chat room (never leave — server auto-joins all rooms on
    // connect, and we must stay in every room to receive real-time messages
    // even when viewing a different chat).
    const prevActiveChatRef = useRef<string | null>(null);
    useEffect(() => {
        const newId = activeChat?.id ?? null;

        // Save scroll position of previous chat before switching (skip 0 — DOM may not be ready)
        if (prevActiveChatRef.current && prevActiveChatRef.current !== newId && scrollRef.current) {
            const st = scrollRef.current.scrollTop;
            if (st > 0) {
                savedScrollPositions.current[prevActiveChatRef.current] = st;
            }
        }

        // Join new room (idempotent if already joined via auto-join)
        if (newId && newId !== prevActiveChatRef.current) {
            socketService.joinChat(newId);
        }

        // Close panels when switching between chats
        if (prevActiveChatRef.current && newId !== prevActiveChatRef.current) {
            setGroupInfoOpen(false);
            setProfileOpen(false);
        }

        prevActiveChatRef.current = newId;

        if (activeChat) {
            console.log('[ChatWindow] Loading messages for chat:', activeChat.id);
            // Save unread state BEFORE clearing — used for unread divider
            const chatState = useChatStore.getState();
            const unreadCount = activeChat.unreadCount;
            const lastReadId = chatState.lastReadMessageId[activeChat.id];
            if (unreadCount > 0 && lastReadId) {
                initialUnreadRef.current = {
                    chatId: activeChat.id,
                    count: unreadCount,
                    lastReadId,
                };
            } else {
                initialUnreadRef.current = null;
            }

            chatState.loadMessages(activeChat.id).finally(() => {
                loadedChatsRef.current.add(activeChat.id);
            });
            chatState.clearUnread(activeChat.id);
            // Load pinned messages from centralized store
            setPinnedBarDismissed(false);
            chatState.loadPinnedMessages(activeChat.id);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChat?.id]);

    // Mark last message as read when messages change
    useEffect(() => {
        if (!activeChat) return;
        const chatMessages = messages[activeChat.id];
        if (chatMessages && chatMessages.length > 0) {
            const lastMsg = chatMessages[chatMessages.length - 1];
            if (lastMsg.senderId !== currentUser?.id) {
                markMessagesRead(activeChat.id, lastMsg.id).catch(() => {});
                socketService.markRead(activeChat.id, lastMsg.id);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChat?.id, messages[activeChat?.id ?? '']?.length]);

    // Typing debounce
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleTyping = useCallback(() => {
        if (!activeChat) return;
        socketService.startTyping(activeChat.id);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            socketService.stopTyping(activeChat.id);
        }, 2000);
    }, [activeChat]);

    // Infinite scroll: IntersectionObserver at top
    const topSentinelRef = useRef<HTMLDivElement>(null);
    // Ref to access virtualItems inside IntersectionObserver callback
    const virtualItemsRef = useRef<any[]>([]);


    // Track scroll position for scroll-to-bottom button + near-bottom state
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handleScroll = () => {
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            // Update near-bottom ref (used to gate auto-scroll on new messages)
            isNearBottomRef.current = distanceFromBottom < 150;
            const shouldShow = distanceFromBottom > 300;
            if (shouldShow !== showScrollDownRef.current) {
                showScrollDownRef.current = shouldShow;
                if (shouldShow) {
                    setScrollBtnExiting(false);
                    setShowScrollDown(true);
                } else {
                    setScrollBtnExiting(true);
                    setTimeout(() => {
                        setShowScrollDown(false);
                        setScrollBtnExiting(false);
                    }, 200);
                }
            }
        };
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [activeChat?.id]);

    // === Virtualization setup (must be before scrollToBottom and before any early return) ===
    const chatMessages = activeChat ? (messages[activeChat.id] || []) : [];
    const mediaItems = useMemo<MediaItem[]>(() =>
        chatMessages
            .filter((m) => (m.type === 'image' || m.type === 'video') && m.mediaUrl)
            .map((m) => ({
                id: m.id,
                src: m.mediaUrl!,
                type: m.type as 'image' | 'video',
                senderName: m.sender ? (m.sender.firstName || m.sender.username) : undefined,
                timestamp: m.timestamp,
            })),
    [chatMessages]);

    // Track message count for animation optimization
    const prevCount = prevMsgCountRef.current[activeChat?.id ?? ''] ?? 0;
    const currentCount = chatMessages.length;
    const isNewMessageAdded = currentCount > prevCount && prevCount > 0;
    if (activeChat) {
        prevMsgCountRef.current[activeChat.id] = currentCount;
    }

    // Participant lookup map for titles/roles
    const participantMap = useMemo(() => {
        const map = new Map<string, { title?: string; role: string; adminRights?: any }>();
        if (activeChat?.participants) {
            for (const p of activeChat.participants) {
                map.set(p.userId, { title: p.title, role: p.role, adminRights: p.adminRights });
            }
        }
        return map;
    }, [activeChat?.participants]);

    // Local profile overrides for display names
    const localOverrides = useSettingsStore((s) => s.localProfileOverrides);
    const chatDisplayTitle = useMemo(() => {
        if (!activeChat) return '';
        if (activeChat.type === 'private') {
            const other = activeChat.participants.find(p => p.userId !== currentUser?.id);
            if (other && localOverrides[other.userId]?.nickname) {
                return localOverrides[other.userId].nickname!;
            }
        }
        return activeChat.title;
    }, [activeChat, currentUser?.id, localOverrides]);

    // Current user's admin info for permission checks
    const myParticipantInfo = participantMap.get(currentUser?.id ?? '');
    const canDeleteOthers = myParticipantInfo?.role === 'owner' ||
        (myParticipantInfo?.role === 'admin' && myParticipantInfo?.adminRights?.can_delete_messages);
    const canPinMessages = activeChat?.type === 'private' ||
        myParticipantInfo?.role === 'owner' ||
        (myParticipantInfo?.role === 'admin' && myParticipantInfo?.adminRights?.can_pin_messages);

    // Build flat virtual items array
    type VirtualItemData =
        | { kind: 'date-separator'; date: Date; key: string }
        | { kind: 'unread-divider'; count: number; key: string }
        | { kind: 'message'; msg: Message; index: number; isMe: boolean; showTail: boolean; showAvatar: boolean; showSenderName: boolean; isSelected: boolean; shouldAnimate: boolean; isSending: boolean; key: string };

    const virtualItems = useMemo<VirtualItemData[]>(() => {
        if (!activeChat) return [];
        const items: VirtualItemData[] = [];
        const savedUnread = initialUnreadRef.current;

        for (let i = 0; i < chatMessages.length; i++) {
            const msg = chatMessages[i];
            const prev = chatMessages[i - 1];
            const next = chatMessages[i + 1];

            const showDateSep = !prev ||
                new Date(msg.timestamp).toDateString() !== new Date(prev.timestamp).toDateString();
            if (showDateSep) {
                items.push({ kind: 'date-separator', date: msg.timestamp, key: `date-${msg.id}` });
            }

            const showUnreadDiv = savedUnread
                && savedUnread.chatId === activeChat.id
                && savedUnread.count > 0
                && prev?.id === savedUnread.lastReadId
                && msg.senderId !== currentUser?.id;
            if (showUnreadDiv) {
                items.push({ kind: 'unread-divider', count: savedUnread!.count, key: `unread-${msg.id}` });
            }

            const isMe = msg.senderId === currentUser?.id;
            const showTail = !next || next.senderId !== msg.senderId;
            const showAv = (appearance.showAvatars ?? true)
                && activeChat.type !== 'private'
                && !isMe
                && (!next || next.senderId !== msg.senderId);
            const showSender = activeChat.type !== 'private'
                && !isMe
                && (!prev || prev.senderId !== msg.senderId);
            const isSending = msg.status === 'sending';
            const isSel = selectedMessages.has(msg.id);
            const isNewMsg = isNewMessageAdded && i >= prevCount;
            const shouldAnim = !selectionMode && (isSending || isNewMsg);

            items.push({
                kind: 'message', msg, index: i, isMe, showTail,
                showAvatar: showAv, showSenderName: showSender,
                isSelected: isSel, shouldAnimate: shouldAnim, isSending, key: msg.id,
            });
        }
        return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatMessages, activeChat?.id, currentUser?.id, selectedMessages, selectionMode, isNewMessageAdded, prevCount, appearance.showAvatars, activeChat?.type]);

    // Keep ref in sync for IntersectionObserver callback
    virtualItemsRef.current = virtualItems;

    // IntersectionObserver for infinite scroll
    useEffect(() => {
        if (!activeChat) return;
        const sentinel = topSentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore[activeChat.id] && !isLoadingMore && !wasLoadingMoreRef.current) {
                    // Save scroll height before loading more to restore position after
                    if (scrollRef.current) {
                        loadMoreAnchorRef.current = {
                            key: String(scrollRef.current.scrollHeight),
                            offsetFromStart: scrollRef.current.scrollTop,
                        };
                    }
                    useChatStore.getState().loadMoreMessages(activeChat.id);
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [activeChat, hasMore, isLoadingMore]);

    const unreadDividerVIndex = useMemo(() =>
        virtualItems.findIndex(i => i.kind === 'unread-divider'),
    [virtualItems]);

    const scrollToBottom = useCallback(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, []);

    // Scroll on chat change: wait for messages to load, then scroll to bottom/unread/saved position
    const needsInitialScrollRef = useRef<string | null>(null);
    const prevScrollChatRef = useRef<string | null>(null);

    // Flag that we need initial scroll when chat changes
    useEffect(() => {
        if (activeChat && prevScrollChatRef.current !== activeChat.id) {
            chatReadyRef.current = false;
            setChatReady(false);
            needsInitialScrollRef.current = activeChat.id;
            prevScrollChatRef.current = activeChat.id;
            // Reset near-bottom so new chat always gets auto-scroll treatment
            isNearBottomRef.current = true;
        }
    }, [activeChat?.id]);

    // useLayoutEffect: scroll BEFORE browser paints to prevent flash
    useLayoutEffect(() => {
        if (!activeChat || !needsInitialScrollRef.current) return;
        if (needsInitialScrollRef.current !== activeChat.id) return;
        if (isLoadingMessages) return;

        const chatMsgs = messages[activeChat.id];
        if (!chatMsgs || chatMsgs.length === 0) {
            chatReadyRef.current = true;
            setChatReady(true);
            needsInitialScrollRef.current = null;
            return;
        }

        needsInitialScrollRef.current = null;
        const el = scrollRef.current;
        if (!el) { chatReadyRef.current = true; setChatReady(true); return; }

        const savedPos = savedScrollPositions.current[activeChat.id];

        const doScroll = () => {
            if (unreadDividerVIndex >= 0 && initialUnreadRef.current?.chatId === activeChat.id && initialUnreadRef.current.count > 0) {
                const divider = el.querySelector('#unread-divider');
                if (divider) divider.scrollIntoView({ block: 'center' });
                else el.scrollTop = el.scrollHeight;
            } else if (savedPos !== undefined && savedPos > 0) {
                el.scrollTop = savedPos;
            } else {
                el.scrollTop = el.scrollHeight;
            }
        };

        // Initial scroll
        doScroll();

        // Re-scroll after virtualizer measures real sizes (double-rAF ensures layout is complete)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                doScroll();
                chatReadyRef.current = true;
                setChatReady(true);
            });
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChat?.id, isLoadingMessages, messages[activeChat?.id ?? '']?.length]);

    // New message arrived — auto-scroll only if user is near the bottom
    // IMPORTANT: Do NOT use behavior:'smooth' — it's incompatible with dynamic-size virtualizer
    // and causes infinite "Failed to scroll to index" retries
    const prevMsgLenRef = useRef<number>(0);
    useEffect(() => {
        if (!activeChat) return;
        const chatMsgs = messages[activeChat.id];
        const newLen = chatMsgs?.length ?? 0;
        const hadMessages = prevMsgLenRef.current > 0;
        prevMsgLenRef.current = newLen;

        if (!hadMessages || isLoadingMessages || needsInitialScrollRef.current) return;
        if (!chatReadyRef.current) return;
        if (!isNearBottomRef.current) return;

        // Use rAF to ensure virtualizer has processed the new item
        requestAnimationFrame(() => {
            if (isNearBottomRef.current && scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages[activeChat?.id ?? '']?.length]);

    // Scroll anchoring after loadMore completes — restore position so user doesn't see a jump
    useLayoutEffect(() => {
        if (wasLoadingMoreRef.current && !isLoadingMore && loadMoreAnchorRef.current && scrollRef.current) {
            const anchor = loadMoreAnchorRef.current;
            loadMoreAnchorRef.current = null;
            // Restore scroll position: new height - old height + old scrollTop
            const newScrollHeight = scrollRef.current.scrollHeight;
            const oldScrollHeight = Number(anchor.key);
            const oldScrollTop = anchor.offsetFromStart;
            scrollRef.current.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
        }
        wasLoadingMoreRef.current = isLoadingMore;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoadingMore, activeChat]);

    // Clear selection on chat change
    useEffect(() => {
        setContextMenu(null);
        setReplyToMessage(null);
        setEditingMessage(null);
        setSelectedMessages(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChat?.id]);

    // ESC to exit selection mode
    useEffect(() => {
        if (!selectionMode) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedMessages(new Set());
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectionMode]);

    // Global mouseup to stop drag selection + long press
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressTargetRef = useRef<string | null>(null);

    useEffect(() => {
        const handleMouseUp = () => {
            dragSelectingRef.current = false;
            lastDragMsgRef.current = null;
            // Clear long press timer
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
            longPressTargetRef.current = null;
        };
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchend', handleMouseUp);
        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, []);

    // --- Selection handlers ---
    const handleToggleSelect = useCallback((msgId: string) => {
        setSelectedMessages(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) {
                next.delete(msgId);
            } else {
                next.add(msgId);
            }
            return next;
        });
    }, []);

    const handleSelectFromMenu = useCallback((message: Message) => {
        setSelectedMessages(new Set([message.id]));
    }, []);

    const handleClearSelection = useCallback(() => {
        setSelectedMessages(new Set());
    }, []);

    const handleCopySelected = useCallback(() => {
        if (!activeChat) return;
        const chatMessages = messages[activeChat.id] || [];
        const selected = chatMessages.filter(m => selectedMessages.has(m.id));
        const text = selected.map(m => m.content).filter(Boolean).join('\n');
        navigator.clipboard.writeText(text);
        toast.success('Скопировано');
        setSelectedMessages(new Set());
    }, [activeChat, messages, selectedMessages]);

    const handleDeleteSelected = useCallback(async () => {
        if (!activeChat) return;
        const ids = Array.from(selectedMessages);
        try {
            for (const id of ids) {
                await useChatStore.getState().deleteMessageApi(activeChat.id, id);
            }
            toast.success(`Удалено: ${ids.length}`);
        } catch {
            toast.error('Не удалось удалить');
        }
        setSelectedMessages(new Set());
    }, [activeChat, selectedMessages]);

    // Long-press + drag selection: mousedown on message
    const handleMsgMouseDown = useCallback((msgId: string) => {
        if (selectionMode) {
            // Already in selection mode — set up drag state only (click handler toggles)
            dragSelectingRef.current = true;
            lastDragMsgRef.current = msgId;
            dragModeRef.current = selectedMessages.has(msgId) ? 'remove' : 'add';
            return;
        }

        // Not in selection mode — start long-press timer (400ms)
        longPressTargetRef.current = msgId;
        longPressTimerRef.current = setTimeout(() => {
            // Enter selection mode with this message
            setSelectedMessages(new Set([msgId]));
            dragSelectingRef.current = true;
            lastDragMsgRef.current = msgId;
            dragModeRef.current = 'add';
            longPressTimerRef.current = null;
            justEnteredSelectionRef.current = true;
        }, 400);
    }, [selectionMode, selectedMessages]);

    // Cancel long-press if mouse moves to different message (= normal interaction)
    const handleMsgMouseEnter = useCallback((msgId: string) => {
        // If we have a long-press timer and mouse moved, cancel it
        if (longPressTimerRef.current && longPressTargetRef.current !== msgId) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        // Drag selection: add/remove message when dragging over it
        if (dragSelectingRef.current && selectionMode) {
            if (lastDragMsgRef.current === msgId) return;
            lastDragMsgRef.current = msgId;
            setSelectedMessages(prev => {
                const next = new Set(prev);
                if (dragModeRef.current === 'remove') {
                    next.delete(msgId);
                } else {
                    next.add(msgId);
                }
                return next;
            });
        }
    }, [selectionMode]);

    // --- Context menu handlers ---
    const handleContextMenu = useCallback((e: React.MouseEvent, message: Message) => {
        if (selectionMode) {
            // In selection mode, toggle selection instead of showing context menu
            handleToggleSelect(message.id);
            return;
        }
        setContextMenu({
            messageId: message.id,
            message,
            x: e.clientX,
            y: e.clientY,
        });
    }, [selectionMode, handleToggleSelect]);

    const handleReply = useCallback((message: Message) => {
        setReplyToMessage(message);
    }, []);

    const handleCopy = useCallback((message: Message) => {
        if (message.content) {
            navigator.clipboard.writeText(message.content);
            toast.success('Скопировано');
        }
    }, []);

    const handleEdit = useCallback((message: Message) => {
        if (!activeChat) return;
        setEditingMessage({
            id: message.id,
            chatId: activeChat.id,
            content: message.content,
        });
    }, [activeChat]);

    const handleDelete = useCallback(async (message: Message) => {
        if (!activeChat) return;
        try {
            await useChatStore.getState().deleteMessageApi(activeChat.id, message.id);
            toast.success('Сообщение удалено');
        } catch {
            toast.error('Не удалось удалить сообщение');
        }
    }, [activeChat]);

    const handleReaction = useCallback((message: Message, emoji: string) => {
        if (!activeChat || !currentUser) return;
        useChatStore.getState().toggleReaction(activeChat.id, message.id, emoji, currentUser.id);
    }, [activeChat, currentUser]);

    const handleEditMessage = useCallback(async (messageId: string, chatId: string, content: string) => {
        try {
            await useChatStore.getState().editMessageApi(chatId, messageId, content);
        } catch {
            toast.error('Не удалось изменить сообщение');
        }
    }, []);

    // --- Pin handlers ---
    const handlePinMessage = useCallback(async (message: Message) => {
        if (!activeChat) return;
        try {
            await apiPinMessage(activeChat.id, message.id);
            await useChatStore.getState().loadPinnedMessages(activeChat.id);
            setPinnedBarDismissed(false);
            toast.success('Сообщение закреплено');
        } catch {
            toast.error('Не удалось закрепить');
        }
    }, [activeChat]);

    const handleUnpinMessage = useCallback(async (message: Message) => {
        if (!activeChat) return;
        try {
            await apiUnpinMessage(activeChat.id, message.id);
            await useChatStore.getState().loadPinnedMessages(activeChat.id);
            toast.success('Сообщение откреплено');
        } catch {
            toast.error('Не удалось открепить');
        }
    }, [activeChat]);

    const handleUnpinAll = useCallback(async () => {
        if (!activeChat) return;
        try {
            await apiUnpinAll(activeChat.id);
            useChatStore.getState().clearPinnedMessages(activeChat.id);
            toast.success('Все сообщения откреплены');
        } catch {
            toast.error('Не удалось открепить все');
        }
    }, [activeChat]);

    const handleScrollToMessage = useCallback((messageId: string) => {
        // Temporarily disable auto-scroll so it doesn't yank us back to bottom
        isNearBottomRef.current = false;

        const highlight = () => {
            requestAnimationFrame(() => {
                const el = document.getElementById(`msg-${messageId}`);
                if (el) {
                    el.classList.add('animate-pin-highlight');
                    setTimeout(() => el.classList.remove('animate-pin-highlight'), 2000);
                }
            });
        };

        const el = document.getElementById(`msg-${messageId}`);
        if (el) {
            el.scrollIntoView({ block: 'center' });
            requestAnimationFrame(highlight);
        }
    }, []);

    // --- Sticker handler ---
    const handleSendSticker = useCallback(async (sticker: Sticker) => {
        if (!activeChat) return;
        try {
            if (sticker.imageUrl) {
                await useChatStore.getState().sendMessage(activeChat.id, sticker.emoji, 'image', sticker.imageUrl);
            } else {
                await useChatStore.getState().sendMessage(activeChat.id, sticker.emoji);
            }
        } catch {
            toast.error('Не удалось отправить стикер');
        }
    }, [activeChat]);

    // --- Search handlers ---
    const handleSearchOpen = useCallback(() => {
        setSearchOpen(true);
        setSearchQuery('');
        setSearchResults([]);
        setTimeout(() => searchInputRef.current?.focus(), 100);
    }, []);

    const handleSearchClose = useCallback(() => {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
    }, []);

    const handleSearchChange = useCallback((value: string) => {
        setSearchQuery(value);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        if (!value.trim() || !activeChat) {
            setSearchResults([]);
            return;
        }
        searchDebounceRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await searchMessages(activeChat.id, value.trim());
                setSearchResults(results);
            } catch {
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 300);
    }, [activeChat]);

    // --- Call handler ---
    const handleCall = useCallback(async () => {
        if (!activeChat) return;

        // Check if there's already an active call in this chat
        const existing = await socketService.getActiveCall(activeChat.id);
        if (existing) {
            // Set active call in store BEFORE joining so addParticipant works
            const callStore = useCallStore.getState();
            if (!callStore.activeCall) {
                callStore.setActiveCall({
                    callId: existing.callId,
                    chatId: existing.chatId,
                    chatTitle: activeChat.title || '',
                    type: existing.type as 'private' | 'group',
                    status: 'connecting',
                    participants: existing.participants || [],
                    startedAt: new Date(existing.startedAt),
                    initiatorId: existing.initiatorId,
                });
            }

            // Initialize mic before joining
            try {
                const stream = await peerManager.init();
                callStore.setLocalStream(stream);
                peerManager.setCallId(existing.callId);
            } catch {
                toast.error('Нет доступа к микрофону');
                callStore.setActiveCall(null);
                return;
            }

            socketService.joinCall(existing.callId);
        } else {
            // Start new call
            const type = activeChat.type === 'private' ? 'private' : 'group';
            socketService.initiateCall(activeChat.id, type);
        }
    }, [activeChat]);

    // --- Group info handler ---
    const handleGroupInfo = useCallback(() => {
        if (!activeChat) return;
        if (activeChat.type === 'private') {
            const otherParticipant = activeChat.participants.find(
                (p) => p.userId !== currentUser?.id
            );
            if (otherParticipant) {
                setGroupInfoOpen(false);
                setProfileUserId(otherParticipant.userId);
                setProfileOpen(true);
            }
        } else {
            setProfileOpen(false);
            setGroupInfoOpen(true);
        }
    }, [activeChat, currentUser]);

    // --- Mute handler ---
    const handleToggleMute = useCallback(() => {
        if (!activeChat) return;
        useChatStore.getState().toggleMuteChat(activeChat.id);
        toast.success(isChatMuted ? 'Уведомления включены' : 'Уведомления отключены');
    }, [activeChat, isChatMuted]);

    // --- Delete chat handler ---
    const handleDeleteChat = useCallback(async () => {
        if (!activeChat) return;
        try {
            await apiDeleteChat(activeChat.id);
            toast.success('Чат удалён');
            setShowDeleteConfirm(false);
            useChatStore.getState().setActiveChat(null);
            useChatStore.getState().loadChats();
        } catch {
            toast.error('Не удалось удалить чат');
        }
    }, [activeChat]);

    // --- Forward handler ---
    const handleForwardSelected = useCallback(async (targetChatId: string) => {
        if (!activeChat) return;
        const chatMsgs = messages[activeChat.id] || [];
        const selected = chatMsgs.filter(m => selectedMessages.has(m.id));
        try {
            for (const msg of selected) {
                const forwardedFrom = {
                    id: msg.senderId,
                    name: msg.sender?.firstName || msg.sender?.username || 'User',
                };
                await useChatStore.getState().sendMessage(
                    targetChatId,
                    msg.content || '',
                    msg.type !== 'text' ? msg.type as 'image' | 'video' | 'voice' | 'file' : undefined,
                    msg.mediaUrl,
                    undefined,
                    forwardedFrom,
                );
            }
            toast.success(`Переслано: ${selected.length}`);
            setSelectedMessages(new Set());
            setShowForwardDialog(false);
        } catch {
            toast.error('Не удалось переслать');
        }
    }, [activeChat, messages, selectedMessages]);

    const handleForwardFromMenu = useCallback((message: Message) => {
        setSelectedMessages(new Set([message.id]));
        setShowForwardDialog(true);
    }, []);

    // --- Attachment menu handlers ---
    const handleCreatePoll = useCallback(async (data: { question: string; options: string[]; isAnonymous: boolean; isMultipleChoice: boolean }) => {
        if (!activeChat) return;
        try {
            await createPoll({
                chatId: activeChat.id,
                ...data,
            });
        } catch {
            toast.error('Не удалось создать опрос');
        }
    }, [activeChat]);

    const handleSendLocation = useCallback(async () => {
        if (!activeChat) return;
        if (!navigator.geolocation) {
            toast.error('Геолокация не поддерживается');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    await useChatStore.getState().sendMessage(
                        activeChat.id,
                        `Геолокация: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
                        'location',
                        undefined,
                        undefined,
                        undefined,
                        {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                        }
                    );
                } catch {
                    toast.error('Не удалось отправить геолокацию');
                }
            },
            (err) => {
                console.error('Geolocation error:', err);
                toast.error('Не удалось получить геолокацию');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, [activeChat]);

    const handleSendContact = useCallback(async (contact: { userId: string; username: string; firstName?: string; lastName?: string; avatar?: string }) => {
        if (!activeChat) return;
        try {
            const displayName = contact.firstName
                ? `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ''}`
                : contact.username;
            await useChatStore.getState().sendMessage(
                activeChat.id,
                `Контакт: ${displayName}`,
                'contact',
                undefined,
                undefined,
                undefined,
                {
                    userId: contact.userId,
                    username: contact.username,
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                    avatar: contact.avatar,
                }
            );
        } catch {
            toast.error('Не удалось отправить контакт');
        }
    }, [activeChat]);

    const handleSendGif = useCallback(async (gifUrl: string) => {
        if (!activeChat) return;
        try {
            await useChatStore.getState().sendMessage(activeChat.id, '', 'image', gifUrl);
        } catch {
            toast.error('Не удалось отправить GIF');
        }
    }, [activeChat]);

    // ── Drag-and-drop file handlers ──

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current++;
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDragging(false);

        const mediaFiles = Array.from(e.dataTransfer.files).filter(
            (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
        );
        if (mediaFiles.length > 0) {
            setDroppedFiles(mediaFiles.slice(0, 10));
        }
    }, []);

    const handleDroppedFilesHandled = useCallback(() => setDroppedFiles([]), []);

    if (!activeChat) {
        return (
            <div className="flex h-full flex-col items-center justify-center bg-tg-bg gap-5 px-8 text-center">
                <div className="h-20 w-20 rounded-full bg-tg-primary/10 flex items-center justify-center">
                    <MessageSquare className="h-10 w-10 text-tg-primary" />
                </div>
                <div>
                    <p className="text-lg font-semibold text-tg-text">Rumker Messenger</p>
                    <p className="text-sm text-tg-text-secondary mt-1.5 max-w-[280px]">
                        Выберите чат из списка слева или найдите пользователя через поиск
                    </p>
                </div>
            </div>
        );
    }

    const handleAvatarClick = () => {
        if (selectionMode) return;
        if (activeChat.type === 'private') {
            const otherParticipant = activeChat.participants.find(
                (p) => p.userId !== currentUser?.id
            );
            if (otherParticipant) {
                setGroupInfoOpen(false);
                setProfileUserId(otherParticipant.userId);
                setProfileOpen(true);
            }
        } else {
            setProfileOpen(false);
            setGroupInfoOpen(true);
        }
    };

    const handleSendVoice = async (blob: Blob) => {
        if (!activeChat) return;
        try {
            const file = new File([blob], 'voice.webm', { type: blob.type });
            const result = await uploadChatFile(file);
            await useChatStore.getState().sendMessage(activeChat.id, '', 'voice', result.url);
        } catch (error) {
            console.error('Failed to send voice message:', error);
            toast.error('Не удалось отправить голосовое сообщение');
        }
    };

    const handleSendMessage = async (text: string, files: File[]) => {
        if (!text.trim() && files.length === 0) return;

        const currentReplyToId = replyToMessage?.id;

        try {
            for (const file of files) {
                // Check video size limit (1 GB)
                if (file.type.startsWith('video/') && file.size > 1024 * 1024 * 1024) {
                    toast.error('Не удалось отправить видео больше 1 ГБ');
                    continue;
                }
                const result = await uploadChatFile(file);
                const type = file.type.startsWith('video/') ? 'video'
                    : file.type.startsWith('audio/') ? 'voice'
                    : 'image';
                await useChatStore.getState().sendMessage(activeChat.id, '', type, result.url);
            }

            if (text.trim()) {
                await useChatStore.getState().sendMessage(activeChat.id, text, undefined, undefined, currentReplyToId);
            }

            playMessageSendSound();
            setReplyToMessage(null);
            setResetUploaderKey(prev => prev + 1);
        } catch (error) {
            console.error('Failed to send message:', error);
            toast.error('Не удалось отправить сообщение');
        }
    };

    const getInitials = (title: string) => title.slice(0, 2).toUpperCase();

    // Handle click on message row — only toggle in selection mode
    // Prevent click from firing after long-press enters selection mode
    const handleMessageRowClick = (msg: Message) => {
        if (justEnteredSelectionRef.current) {
            justEnteredSelectionRef.current = false;
            return; // Skip click that follows the long-press mouseup
        }
        if (selectionMode) {
            handleToggleSelect(msg.id);
        }
    };

    const panelOpen = profileOpen || groupInfoOpen;

    return (
        <div className="flex h-full overflow-hidden">
        {/* ── Chat Area ── */}
        <div
            ref={swipeRef}
            className="flex-1 flex flex-col bg-tg-bg relative overflow-hidden min-w-0"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Selection Toolbar */}
            {selectionMode ? (
                <header className="flex h-14 items-center justify-between border-b border-tg-divider bg-tg-primary px-3 sm:px-4 text-white shrink-0 animate-fade-scale-in">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleClearSelection}
                            className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        <span className="font-medium text-sm">{selectedMessages.size} выбрано</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleCopySelected}
                            className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
                            title="Копировать"
                        >
                            <Copy className="h-5 w-5" />
                        </button>
                        <button
                            onClick={() => setShowForwardDialog(true)}
                            className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
                            title="Переслать"
                        >
                            <Forward className="h-5 w-5" />
                        </button>
                        <button
                            onClick={handleDeleteSelected}
                            className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors text-red-200"
                            title="Удалить"
                        >
                            <Trash2 className="h-5 w-5" />
                        </button>
                    </div>
                </header>
            ) : (
                /* Chat Header */
                <header className="flex h-14 items-center justify-between border-b border-tg-divider bg-tg-header px-2 sm:px-4 text-white shrink-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="md:hidden h-11 w-11 shrink-0 flex items-center justify-center rounded-full text-white hover:bg-white/10 active:bg-white/20 transition-colors"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                        )}

                        <Avatar
                            className="h-9 w-9 cursor-pointer hover:opacity-90 transition-opacity shrink-0"
                            onClick={handleAvatarClick}
                        >
                            <AvatarImage src={activeChat.avatar} />
                            <AvatarFallback className="bg-white/20 text-white text-sm">
                                {getInitials(activeChat.title || 'Chat')}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex flex-col cursor-pointer min-w-0 shrink" onClick={handleAvatarClick}>
                            <span className="font-medium leading-tight truncate text-sm">{chatDisplayTitle}</span>
                            <span className="text-[11px] text-white/60 leading-tight truncate">
                                {(() => {
                                    const chatTyping = typingUsers[activeChat.id];
                                    if (chatTyping && chatTyping.length > 0) {
                                        const typingUserNames = chatTyping.map(userId => {
                                            const participant = activeChat.participants.find(p => p.userId === userId);
                                            const user = participant?.user;
                                            return user?.firstName || user?.username || 'Кто-то';
                                        }).filter(Boolean);

                                        if (typingUserNames.length === 1) {
                                            return <span className="text-green-300">{typingUserNames[0]} печатает...</span>;
                                        } else if (typingUserNames.length === 2) {
                                            return <span className="text-green-300">{typingUserNames[0]} и {typingUserNames[1]} печатают...</span>;
                                        } else {
                                            return <span className="text-green-300">{typingUserNames.length} пользователя печатают...</span>;
                                        }
                                    }
                                    if (activeChat.type === 'private') {
                                        const other = activeChat.participants.find(p => p.userId !== currentUser?.id);
                                        if (other?.user?.isOnline) return 'в сети';
                                        if (other?.user?.lastSeen) {
                                            const d = new Date(other.user.lastSeen);
                                            const now = new Date();
                                            const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
                                            if (diffMin < 1) return 'был(а) только что';
                                            if (diffMin < 60) return `был(а) ${diffMin} мин. назад`;
                                            return `был(а) недавно`;
                                        }
                                        return 'был(а) недавно';
                                    }
                                    return `${activeChat.participants.length} участников`;
                                })()}
                            </span>
                        </div>

                    </div>

                    <div className="flex items-center shrink-0">
                        <button
                            onClick={handleSearchOpen}
                            className="h-10 w-10 flex items-center justify-center rounded-full text-white hover:bg-white/10 active:bg-white/20 transition-colors"
                            title="Поиск сообщений"
                        >
                            <Search className="h-5 w-5" />
                        </button>
                        {activeChat.type === 'private' && (
                            <button
                                onClick={handleCall}
                                className="h-10 w-10 hidden sm:flex items-center justify-center rounded-full text-white hover:bg-white/10 active:bg-white/20 transition-colors"
                                title="Позвонить"
                            >
                                <Phone className="h-5 w-5" />
                            </button>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="h-10 w-10 flex items-center justify-center rounded-full text-white hover:bg-white/10 active:bg-white/20 transition-colors">
                                    <MoreVertical className="h-5 w-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel>Действия</DropdownMenuLabel>
                                <DropdownMenuItem onClick={handleGroupInfo}>
                                    <Info className="h-4 w-4 mr-2" />
                                    {activeChat.type === 'private' ? 'Профиль' : 'Информация о группе'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleSearchOpen}>
                                    <Search className="h-4 w-4 mr-2" />
                                    Поиск сообщений
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleToggleMute}>
                                    {isChatMuted ? (
                                        <><Bell className="h-4 w-4 mr-2" />Включить уведомления</>
                                    ) : (
                                        <><BellOff className="h-4 w-4 mr-2" />Отключить уведомления</>
                                    )}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-500" onClick={() => setShowDeleteConfirm(true)}>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Удалить чат
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>
            )}

            {/* Message Search Bar */}
            {searchOpen && !selectionMode && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-tg-divider bg-card/95 backdrop-blur-sm shrink-0 animate-fade-slide-in">
                    <Search className="h-4 w-4 text-tg-text-secondary shrink-0" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Поиск сообщений..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') handleSearchClose();
                        }}
                        className="flex-1 bg-transparent text-sm text-tg-text outline-none placeholder:text-tg-text-secondary"
                    />
                    {isSearching && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-tg-primary shrink-0" />
                    )}
                    {searchResults.length > 0 && (
                        <span className="text-xs text-tg-text-secondary shrink-0">
                            {searchResults.length} найдено
                        </span>
                    )}
                    <button
                        onClick={handleSearchClose}
                        className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-tg-text-secondary"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Search Results Overlay */}
            {searchOpen && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-[112px] z-30 max-h-[50%] overflow-y-auto bg-card border-b border-tg-divider shadow-lg animate-fade-slide-in">
                    {searchResults.map((msg) => (
                        <button
                            key={msg.id}
                            className="w-full text-left px-4 py-2.5 hover:bg-tg-hover transition-colors border-b border-tg-divider/50 last:border-0"
                            onClick={() => {
                                handleSearchClose();
                                handleScrollToMessage(msg.id);
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-tg-primary">
                                    {msg.sender?.firstName || msg.sender?.username || 'User'}
                                </span>
                                <span className="text-[10px] text-tg-text-secondary">
                                    {new Date(msg.timestamp).toLocaleDateString('ru-RU')}
                                </span>
                            </div>
                            <div className="text-sm text-tg-text truncate mt-0.5">{msg.content}</div>
                        </button>
                    ))}
                </div>
            )}

            {/* Telegram-style pinned message bar — always visible when pins exist */}
            {!pinnedBarDismissed && pinnedMessages.length > 0 && !selectionMode && (
                <PinnedMessageBar
                    pinnedMessages={pinnedMessages}
                    onScrollToMessage={handleScrollToMessage}
                    onClose={() => setPinnedBarDismissed(true)}
                    onUnpinAll={handleUnpinAll}
                    canUnpin={canPinMessages || activeChat?.type === 'private'}
                />
            )}

            {/* Messages + Input area — both on top of background */}
            <div className="flex-1 relative overflow-hidden">
                {/* Background layer — stays fixed, never scrolls */}
                <div
                    className="absolute inset-0 pointer-events-none z-0"
                    style={{
                        ...(appearance.chatBackground.type === 'image' ? {
                            backgroundImage: `url(${appearance.chatBackground.value})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        } : appearance.chatBackground.type === 'gradient' ? {
                            background: appearance.chatBackground.value,
                        } : {
                            backgroundColor: appearance.chatBackground.value,
                        }),
                        opacity: appearance.chatBackground.opacity,
                        filter: (appearance.chatBackground.blur ?? 0) > 0
                            ? `blur(${appearance.chatBackground.blur}px)`
                            : undefined,
                    }}
                />

                {/* Content layer: messages + input */}
                <div className="absolute inset-0 z-10 flex flex-col">
                    {/* Messages area — relative wrapper for scroll button positioning */}
                    <div className="flex-1 relative overflow-hidden">
                    {/* Scrollable messages — virtualized */}
                    <div
                        className={cn(
                            "h-full overflow-y-auto scrollbar-thin chat-messages-container",
                            !chatReady && "opacity-0"
                        )}
                        ref={scrollRef}
                    >
                        {/* Sentinel for infinite scroll — absolute so it doesn't affect virtualizer offsets */}
                        <div ref={topSentinelRef} style={{ height: 1, width: '100%' }} />

                        {(isLoadingMessages || isLoadingMore) && (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-primary"></div>
                            </div>
                        )}

                        {!isLoadingMessages && chatMessages.length === 0 && activeChat && loadedChatsRef.current.has(activeChat.id) && (
                            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                                Нет сообщений. Начните диалог!
                            </div>
                        )}

                        {virtualItems.length > 0 && (
                            <div className="flex flex-col justify-end" style={{ width: '100%', minHeight: '100%' }}>
                                {virtualItems.map((item) => {
                                    return (
                                        <div
                                            key={item.key}
                                            id={item.kind === 'message' ? `msg-${item.msg.id}` : undefined}
                                        >
                                            {item.kind === 'date-separator' && (
                                                <div className="flex items-center justify-center py-2 z-10 px-3 sm:px-4">
                                                    <span className="text-[11px] font-medium text-tg-text-secondary bg-card/80 backdrop-blur-sm px-3 py-0.5 rounded-full shadow-sm">
                                                        {formatDateSeparator(new Date(item.date))}
                                                    </span>
                                                </div>
                                            )}
                                            {item.kind === 'unread-divider' && (
                                                <div id="unread-divider" className="flex items-center gap-3 py-2 px-4">
                                                    <div className="flex-1 h-px bg-tg-primary/40" />
                                                    <span className="text-xs font-medium text-tg-primary whitespace-nowrap">
                                                        {item.count} непрочитанн{item.count === 1 ? 'ое' : item.count < 5 ? 'ых' : 'ых'}
                                                    </span>
                                                    <div className="flex-1 h-px bg-tg-primary/40" />
                                                </div>
                                            )}
                                            {item.kind === 'message' && (
                                                <div className={cn("px-3 sm:px-4 max-w-3xl mx-auto w-full", appearance.compactMode ? "" : "py-px")}>
                                                    <div
                                                        className={cn(
                                                            "flex w-full items-center relative chat-message-row",
                                                            selectionMode && "cursor-pointer select-none",
                                                            !selectionMode && (item.isMe ? "justify-end" : "justify-start"),
                                                            item.isSending && !selectionMode ? "animate-msg-send" : (item.shouldAnimate ? "animate-msg-appear" : ""),
                                                            item.msg.status === 'error' && "opacity-50"
                                                        )}
                                                        onClick={() => handleMessageRowClick(item.msg)}
                                                        onMouseDown={() => handleMsgMouseDown(item.msg.id)}
                                                        onMouseEnter={() => handleMsgMouseEnter(item.msg.id)}
                                                    >
                                                        {/* Selection highlight overlay */}
                                                        {item.isSelected && (
                                                            <div className="absolute inset-0 bg-tg-primary/10 rounded-lg pointer-events-none z-0 animate-selection-pop" />
                                                        )}

                                                        {/* Selection checkbox */}
                                                        {selectionMode && (
                                                            <div className="w-9 shrink-0 flex items-center justify-center z-10">
                                                                <div className={cn(
                                                                    "h-[22px] w-[22px] rounded-full border-2 flex items-center justify-center transition-all duration-100",
                                                                    item.isSelected
                                                                        ? "bg-tg-primary border-tg-primary scale-100"
                                                                        : "border-tg-text-secondary/30 scale-90"
                                                                )}>
                                                                    {item.isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Message content */}
                                                        <div className={cn(
                                                            "flex w-full z-10",
                                                            item.isMe ? "justify-end" : "justify-start",
                                                            selectionMode && "pointer-events-none"
                                                        )}>
                                                            {/* Group chat avatar */}
                                                            {appearance.showAvatars && activeChat.type !== 'private' && !item.isMe && (
                                                                <div className="w-8 shrink-0 self-end mr-1.5">
                                                                    {item.showAvatar && (
                                                                        <Avatar className="h-8 w-8">
                                                                            <AvatarImage src={item.msg.sender?.avatar} />
                                                                            <AvatarFallback className="text-xs" style={{ backgroundColor: `${getUserColor(item.msg.senderId)}20`, color: getUserColor(item.msg.senderId) }}>
                                                                                {(item.msg.sender?.firstName || item.msg.sender?.username || '?').slice(0, 2).toUpperCase()}
                                                                            </AvatarFallback>
                                                                        </Avatar>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <MessageBubble
                                                                message={item.msg}
                                                                isMe={item.isMe}
                                                                showTail={item.showTail}
                                                                showSenderName={item.showSenderName}
                                                                senderTitle={participantMap.get(item.msg.senderId)?.title}
                                                                senderRole={participantMap.get(item.msg.senderId)?.role}
                                                                onContextMenu={handleContextMenu}
                                                                onDoubleClick={handleReply}
                                                                onScrollToMessage={handleScrollToMessage}
                                                                onReactionClick={(messageId, emoji) => {
                                                                    if (currentUser) {
                                                                        useChatStore.getState().toggleReaction(activeChat.id, messageId, emoji, currentUser.id);
                                                                    }
                                                                }}
                                                                mediaItems={mediaItems}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Scroll-to-bottom button — inside messages area, above input */}
                    {showScrollDown && (
                        <div className={cn("absolute bottom-4 right-4 z-20", scrollBtnExiting ? "animate-fade-out" : "animate-scroll-btn")}>
                            <button
                                onClick={scrollToBottom}
                                className="relative h-11 w-11 rounded-full bg-card/90 backdrop-blur-sm shadow-lg flex items-center justify-center text-tg-text-secondary hover:text-tg-primary hover:bg-card transition-all duration-150 active:scale-90"
                            >
                                <ChevronDown className="h-5 w-5" />
                                {initialUnreadRef.current?.chatId === activeChat.id && initialUnreadRef.current.count > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-tg-primary px-1 text-[10px] font-bold text-white">
                                        {initialUnreadRef.current.count}
                                    </span>
                                )}
                            </button>
                        </div>
                    )}
                    </div>

                    {/* Input Area — transparent, chat bg shows through */}
                    {!selectionMode && (
                        <div>
                        <div className="max-w-3xl mx-auto w-full px-2 sm:px-3 py-2">
                            <MessageInput
                                chatId={activeChat.id}
                                resetKey={resetUploaderKey}
                                onSendMessage={handleSendMessage}
                                onSendVoice={handleSendVoice}
                                onTyping={handleTyping}
                                editingMessage={editingMessage}
                                onEditMessage={handleEditMessage}
                                onCancelEdit={() => setEditingMessage(null)}
                                replyToMessage={replyToMessage ? {
                                    id: replyToMessage.id,
                                    content: replyToMessage.content,
                                    senderName: replyToMessage.sender?.firstName || replyToMessage.sender?.username || 'User',
                                    senderId: replyToMessage.senderId,
                                } : undefined}
                                onCancelReply={() => setReplyToMessage(null)}
                                droppedFiles={droppedFiles}
                                onDroppedFilesHandled={handleDroppedFilesHandled}
                                onSendSticker={handleSendSticker}
                                mentionUsers={activeChat.participants
                                    .filter(p => p.userId !== currentUser?.id)
                                    .map(p => ({
                                        userId: p.userId,
                                        username: p.user?.username || '',
                                        firstName: p.user?.firstName,
                                        avatar: p.user?.avatar,
                                    }))}
                                onOpenPollCreator={() => setShowPollCreator(true)}
                                onSendLocation={handleSendLocation}
                                onOpenContactPicker={() => setShowContactPicker(true)}
                                onOpenGifPicker={() => setShowGifPicker(true)}
                            />
                        </div>
                        </div>
                    )}
                </div>

                {/* Drag-and-drop overlay */}
                {isDragging && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-tg-primary/10 pointer-events-none animate-backdrop-in">
                        <div className="bg-card px-8 py-6 rounded-2xl shadow-xl border border-tg-primary/30 text-center animate-fade-scale-in">
                            <Image className="h-10 w-10 text-tg-primary mx-auto mb-3" />
                            <p className="text-sm font-semibold text-foreground">Отпустите для отправки</p>
                            <p className="text-xs text-muted-foreground mt-1">Фото и видео</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <MessageContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    message={contextMenu.message}
                    isMe={contextMenu.message.senderId === currentUser?.id}
                    onClose={() => setContextMenu(null)}
                    onReply={handleReply}
                    onCopy={handleCopy}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onReaction={handleReaction}
                    onForward={handleForwardFromMenu}
                    onSelect={handleSelectFromMenu}
                    onPin={handlePinMessage}
                    onUnpin={handleUnpinMessage}
                    isPinned={pinnedMessages.some(p => p.id === contextMenu.message.id)}
                    canDeleteOthers={canDeleteOthers}
                    canPin={canPinMessages}
                />
            )}

            {/* Delete Chat Confirmation */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-backdrop-in" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="bg-card rounded-xl p-6 mx-4 max-w-sm w-full shadow-xl animate-fade-scale-in" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-tg-text mb-2">Удалить чат</h3>
                        <p className="text-sm text-tg-text-secondary mb-4">
                            Вы уверены, что хотите удалить этот чат? Это действие нельзя отменить.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 text-sm rounded-lg hover:bg-muted transition-colors text-tg-text"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleDeleteChat}
                                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                                Удалить
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Forward Dialog */}
            {showForwardDialog && (
                <ForwardDialog
                    onSelect={handleForwardSelected}
                    onClose={() => setShowForwardDialog(false)}
                />
            )}

            {/* Poll Creator */}
            {showPollCreator && (
                <Suspense fallback={null}>
                    <PollCreator
                        open={showPollCreator}
                        onClose={() => setShowPollCreator(false)}
                        onCreatePoll={handleCreatePoll}
                    />
                </Suspense>
            )}

            {/* Contact Picker */}
            <ContactPicker
                open={showContactPicker}
                onClose={() => setShowContactPicker(false)}
                onSelectContact={handleSendContact}
            />

            {/* GIF Picker */}
            {showGifPicker && (
                <Suspense fallback={null}>
                    <GifPicker
                        open={showGifPicker}
                        onClose={() => setShowGifPicker(false)}
                        onSelectGif={handleSendGif}
                    />
                </Suspense>
            )}
        </div>

        {/* ── Profile / Group Info Panel ── */}
        {isDesktop ? (
            /* Desktop: inline panel with smooth width transition */
            <div
                className="shrink-0 border-l border-tg-divider bg-card overflow-hidden flex flex-col transition-[width] duration-300 ease-out"
                style={{ width: panelOpen ? 420 : 0, borderLeftWidth: panelOpen ? 1 : 0 }}
            >
              <div className={cn("flex-1 overflow-hidden", panelOpen && "animate-panel-content-in")}>
                {profileOpen && (
                    <UserProfilePanel
                        inline
                        userId={profileUserId}
                        chatId={activeChat?.id || null}
                        sourceChatType={activeChat?.type}
                        open={profileOpen}
                        onClose={() => setProfileOpen(false)}
                        onScrollToMessage={handleScrollToMessage}
                    />
                )}
                {groupInfoOpen && !profileOpen && (
                    <Suspense fallback={null}>
                        <GroupInfoPanel
                            inline
                            chat={activeChat}
                            open={groupInfoOpen}
                            onClose={() => setGroupInfoOpen(false)}
                            onOpenUserProfile={(userId) => {
                                setGroupInfoOpen(false);
                                setProfileUserId(userId);
                                setProfileOpen(true);
                            }}
                        />
                    </Suspense>
                )}
              </div>
            </div>
        ) : (
            /* Mobile: Sheet-based overlay panels */
            <>
                <UserProfilePanel
                    userId={profileUserId}
                    chatId={activeChat?.id || null}
                    sourceChatType={activeChat?.type}
                    open={profileOpen}
                    onClose={() => setProfileOpen(false)}
                    onScrollToMessage={handleScrollToMessage}
                />
                {groupInfoOpen && (
                    <Suspense fallback={null}>
                        <GroupInfoPanel
                            chat={activeChat}
                            open={groupInfoOpen}
                            onClose={() => setGroupInfoOpen(false)}
                            onOpenUserProfile={(userId) => {
                                setGroupInfoOpen(false);
                                setProfileUserId(userId);
                                setProfileOpen(true);
                            }}
                        />
                    </Suspense>
                )}
            </>
        )}
        </div>
    );
}

/** Format date for date separators between messages */
function formatDateSeparator(date: Date): string {
    const now = new Date();
    const d = new Date(date);
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) return 'Сегодня';
    if (isYesterday) return 'Вчера';

    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
}

/** Simple forward dialog — picks a chat to forward to */
function ForwardDialog({ onSelect, onClose }: { onSelect: (chatId: string) => void; onClose: () => void }) {
    const chats = useChatStore((s) => s.chats);
    const activeChat = useChatStore((s) => s.activeChat);
    const [filter, setFilter] = useState('');

    const filtered = chats.filter(c => {
        if (c.id === activeChat?.id) return false;
        if (!filter) return true;
        return c.title?.toLowerCase().includes(filter.toLowerCase());
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-backdrop-in" onClick={onClose}>
            <div className="bg-card rounded-xl mx-4 max-w-sm w-full shadow-xl animate-fade-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-tg-divider">
                    <h3 className="text-lg font-semibold text-tg-text mb-2">Переслать в...</h3>
                    <input
                        type="text"
                        placeholder="Поиск чата..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-muted text-tg-text outline-none placeholder:text-tg-text-secondary"
                        autoFocus
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="p-6 text-center text-sm text-tg-text-secondary">Нет чатов</div>
                    ) : (
                        filtered.map(chat => (
                            <button
                                key={chat.id}
                                onClick={() => onSelect(chat.id)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-tg-hover transition-colors text-left"
                            >
                                <Avatar className="h-9 w-9 shrink-0">
                                    <AvatarImage src={chat.avatar} />
                                    <AvatarFallback className="bg-tg-primary/20 text-tg-primary text-xs">
                                        {(chat.title || 'C').slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="text-sm text-tg-text truncate">{chat.title || 'Чат'}</span>
                            </button>
                        ))
                    )}
                </div>
                <div className="p-3 border-t border-tg-divider">
                    <button onClick={onClose} className="w-full py-2 text-sm text-tg-text-secondary hover:text-tg-text transition-colors">
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    );
}
