import { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Smile, Send, X, Mic, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AttachmentMenu } from './AttachmentMenu';
import { EmojiPicker } from './EmojiPicker';
import type { Sticker } from '@/types';
import { getUserColor } from '@/lib/userColors';

export interface EditingMessage {
    id: string;
    chatId: string;
    content: string;
}

interface ReplyToMessage {
    id: string;
    content: string;
    senderName?: string;
    senderId?: string;
    type?: 'text';
    replyTo?: string;
}

interface MessageInputProps {
    chatId?: string;
    onSendMessage: (text: string, files: File[], sendAsFile?: boolean) => void;
    onSendVoice: (blob: Blob, duration: number) => void;
    onTyping: () => void;
    onEditMessage?: (messageId: string, chatId: string, content: string) => void;
    onCancelEdit?: () => void;
    onReplyToMessage?: (messageId: string) => void;
    onCancelReply?: () => void;
    onSendSticker?: (sticker: Sticker) => void;
    editingMessage?: EditingMessage | null;
    replyToMessage?: ReplyToMessage | null;
    mentionUsers?: { userId: string; username: string; firstName?: string; avatar?: string }[];
    resetKey?: number;
    droppedFiles?: File[];
    onDroppedFilesHandled?: () => void;
    files?: File[];
    showMediaDialog?: boolean;
    isRecording?: boolean;
    recordingDuration?: number;
    showEmojiPicker?: boolean;
    mentionQuery?: string;
    mentionIndex?: number;
    mentionStart?: number;
    onOpenPollCreator?: () => void;
    onSendLocation?: () => void;
    onOpenContactPicker?: () => void;
    onOpenGifPicker?: () => void;
}

// Draft helpers
const DRAFT_KEY = 'rumker-drafts';
const getDrafts = (): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
};
const saveDraft = (chatId: string, text: string) => {
    const d = getDrafts();
    if (text.trim()) d[chatId] = text; else delete d[chatId];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
};

export function MessageInput({
    chatId,
    onSendMessage,
    onSendVoice,
    onTyping,
    onEditMessage,
    onCancelEdit,
    onCancelReply,
    onSendSticker,
    editingMessage,
    replyToMessage,
    mentionUsers: _mentionUsers = [],
    resetKey,
    droppedFiles,
    onDroppedFilesHandled,
    files = [],
    onOpenPollCreator,
    onSendLocation,
    onOpenContactPicker,
    onOpenGifPicker,
}: MessageInputProps) {
    const [text, setText] = useState(editingMessage?.content || '');
    const [localFiles, setLocalFiles] = useState<File[]>(files);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);

    // Voice recording state
    const [recording, setRecording] = useState(false);
    const [recDuration, setRecDuration] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recStartRef = useRef(0);

    const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Restore draft on chatId change
    useEffect(() => {
        if (!chatId || editingMessage) return;
        const draft = getDrafts()[chatId] || '';
        setText(draft);
        setTimeout(autoResize, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId]);

    // Debounced draft save
    useEffect(() => {
        if (!chatId || editingMessage) return;
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(() => {
            saveDraft(chatId, text);
        }, 300);
        return () => {
            if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, chatId]);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);
    const emojiButtonRef = useRef<HTMLButtonElement>(null);

    // Auto-resize textarea — min 48px (one line), max 130px (~5 lines)
    const autoResize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = '48px';
        const scrollH = el.scrollHeight;
        if (scrollH > 48) {
            el.style.height = Math.min(scrollH, 130) + 'px';
        }
    }, []);

    // Fix: call autoResize on mount so textarea starts at correct height
    useEffect(() => {
        setTimeout(autoResize, 0);
    }, [autoResize]);

    // Sync editing message content
    useEffect(() => {
        setText(editingMessage?.content || '');
        if (editingMessage) {
            textareaRef.current?.focus();
        }
        setTimeout(autoResize, 0);
    }, [editingMessage, autoResize]);

    // Reset on resetKey change
    useEffect(() => {
        if (resetKey !== undefined) {
            setText('');
            setLocalFiles([]);
            setTimeout(autoResize, 0);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    // Sync dropped files
    useEffect(() => {
        if (droppedFiles && droppedFiles.length > 0) {
            setLocalFiles(prev => [...prev, ...droppedFiles]);
            onDroppedFilesHandled?.();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [droppedFiles]);

    // --- Voice recording ---
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });

            chunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorderRef.current = recorder;
            recorder.start(100);

            recStartRef.current = Date.now();
            setRecording(true);
            setRecDuration(0);

            recTimerRef.current = setInterval(() => {
                setRecDuration(Math.floor((Date.now() - recStartRef.current) / 1000));
            }, 200);
        } catch {
            console.error('Microphone access denied');
        }
    }, []);

    const stopRecCleanup = useCallback(() => {
        if (recTimerRef.current) {
            clearInterval(recTimerRef.current);
            recTimerRef.current = null;
        }
        setRecording(false);
        setRecDuration(0);
    }, []);

    const cancelRecording = useCallback(() => {
        const rec = mediaRecorderRef.current;
        if (rec && rec.state !== 'inactive') {
            rec.onstop = () => {
                rec.stream.getTracks().forEach(t => t.stop());
            };
            rec.stop();
        }
        chunksRef.current = [];
        stopRecCleanup();
    }, [stopRecCleanup]);

    const sendRecording = useCallback(() => {
        const rec = mediaRecorderRef.current;
        if (!rec || rec.state === 'inactive') {
            stopRecCleanup();
            return;
        }

        const duration = Math.max(1, Math.floor((Date.now() - recStartRef.current) / 1000));

        rec.onstop = () => {
            rec.stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
            if (blob.size > 0) {
                onSendVoice(blob, duration);
            }
            chunksRef.current = [];
        };

        rec.stop();
        stopRecCleanup();
    }, [onSendVoice, stopRecCleanup]);

    // Cleanup recording on unmount
    useEffect(() => {
        return () => {
            if (recTimerRef.current) clearInterval(recTimerRef.current);
            const rec = mediaRecorderRef.current;
            if (rec && rec.state !== 'inactive') {
                rec.stream.getTracks().forEach(t => t.stop());
                rec.stop();
            }
        };
    }, []);

    const formatRecTime = (s: number) => {
        const m = Math.floor(s / 60);
        return `${m}:${(s % 60).toString().padStart(2, '0')}`;
    };

    // --- Text handlers ---
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (editingMessage) {
                if (text.trim() && onEditMessage) {
                    onEditMessage(editingMessage.id, editingMessage.chatId, text.trim());
                    onCancelEdit?.();
                }
            } else if (text.trim() || localFiles.length > 0) {
                onSendMessage(text, localFiles);
                setText('');
                setLocalFiles([]);
                if (chatId) saveDraft(chatId, '');
                setTimeout(autoResize, 0);
            }
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (showEmoji) {
                setShowEmoji(false);
            } else if (showAttachMenu) {
                setShowAttachMenu(false);
            } else if (editingMessage) {
                onCancelEdit?.();
            } else if (replyToMessage) {
                onCancelReply?.();
            }
        }
    }, [editingMessage, replyToMessage, text, localFiles, onSendMessage, onEditMessage, onCancelEdit, onCancelReply, autoResize, showAttachMenu, showEmoji]);

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        onTyping();
        setTimeout(autoResize, 0);
    }, [onTyping, autoResize]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []);
        setLocalFiles(prev => [...prev, ...newFiles]);
        e.target.value = '';
    }, []);

    const handleRemoveFile = useCallback((index: number) => {
        setLocalFiles(prev => prev.filter((_, i) => i !== index));
    }, []);

    const handleSend = useCallback(() => {
        if (editingMessage) {
            if (text.trim() && onEditMessage) {
                onEditMessage(editingMessage.id, editingMessage.chatId, text.trim());
                onCancelEdit?.();
            }
        } else if (text.trim() || localFiles.length > 0) {
            onSendMessage(text, localFiles);
            setText('');
            setLocalFiles([]);
            if (chatId) saveDraft(chatId, '');
            setTimeout(autoResize, 0);
        }
    }, [editingMessage, text, localFiles, onSendMessage, onEditMessage, onCancelEdit, autoResize, chatId]);

    const handleCancelReplyOrEdit = useCallback(() => {
        if (editingMessage) {
            onCancelEdit?.();
            setText('');
        } else if (replyToMessage) {
            onCancelReply?.();
        }
    }, [editingMessage, replyToMessage, onCancelEdit, onCancelReply]);

    // --- Emoji handler ---
    const handleEmojiSelect = useCallback((emoji: string) => {
        setText(prev => prev + emoji);
        textareaRef.current?.focus();
        setTimeout(autoResize, 0);
    }, [autoResize]);

    const handleStickerSelect = useCallback((sticker: Sticker) => {
        onSendSticker?.(sticker);
        setShowEmoji(false);
    }, [onSendSticker]);

    const hasContent = text.trim().length > 0 || localFiles.length > 0;

    return (
        <div className="relative">
            {/* Reply / Edit preview bar */}
            {(replyToMessage || editingMessage) && !recording && (
                <div className="mb-1 px-3 py-2 text-sm flex items-start gap-2">
                    <div
                        className="w-[3px] self-stretch rounded-full shrink-0"
                        style={{ backgroundColor: editingMessage ? 'var(--tg-primary)' : getUserColor(replyToMessage?.senderId || replyToMessage?.senderName || '') }}
                    />
                    <div className="flex-1 min-w-0">
                        <div
                            className="text-xs font-semibold leading-tight"
                            style={{ color: editingMessage ? 'var(--tg-primary)' : getUserColor(replyToMessage?.senderId || replyToMessage?.senderName || '') }}
                        >
                            {editingMessage ? 'Редактирование' : (replyToMessage?.senderName || 'Ответ')}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {replyToMessage?.content || editingMessage?.content}
                        </div>
                    </div>
                    <button
                        onClick={handleCancelReplyOrEdit}
                        className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* File previews */}
            {localFiles.length > 0 && !recording && (
                <div className="flex gap-2 px-2 py-2 overflow-x-auto scrollbar-thin">
                    {localFiles.map((file, i) => (
                        <div key={i} className="relative shrink-0 h-16 w-16 rounded-xl overflow-hidden bg-muted border border-border shadow-sm">
                            {file.type.startsWith('image/') ? (
                                <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                                    {file.name.split('.').pop()?.toUpperCase()}
                                </div>
                            )}
                            <button
                                onClick={() => handleRemoveFile(i)}
                                className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                            >
                                <X className="h-3 w-3 text-white" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══ Recording mode ═══ */}
            {recording ? (
                <div className="flex items-center gap-2 px-1">
                    <button
                        onClick={cancelRecording}
                        className="h-[48px] w-[48px] shrink-0 flex items-center justify-center rounded-full text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Отменить"
                    >
                        <Trash2 className="h-5 w-5" />
                    </button>

                    <div className="flex-1 flex items-center gap-3 px-4 h-[48px] rounded-2xl bg-card border border-border">
                        <span className="relative flex h-3 w-3 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                        </span>
                        <span className="text-sm font-medium text-foreground tabular-nums">
                            {formatRecTime(recDuration)}
                        </span>
                        <div className="flex-1 flex items-center gap-0.5 overflow-hidden">
                            {Array.from({ length: 24 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="w-1 rounded-full bg-red-500/60 shrink-0"
                                    style={{
                                        height: `${4 + Math.random() * 16}px`,
                                        animation: `waveform ${0.3 + Math.random() * 0.5}s ease-in-out infinite alternate`,
                                        animationDelay: `${i * 50}ms`,
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={sendRecording}
                        className="h-[48px] w-[48px] shrink-0 flex items-center justify-center rounded-full bg-tg-primary text-white shadow-sm hover:brightness-110 transition-all active:scale-95"
                        title="Отправить"
                    >
                        <Send className="h-[19px] w-[19px] ml-0.5" />
                    </button>
                </div>
            ) : (
                /* ═══ Normal input mode — Telegram-style ═══ */
                <div className="flex items-end gap-1">
                    {/* Input field container — Telegram pill shape */}
                    <div className="flex-1 relative flex items-end">
                        {/* Attachment button — inside field, left */}
                        <div className="absolute left-1.5 bottom-[5px] z-10">
                            <button
                                onClick={() => { setShowAttachMenu(!showAttachMenu); setShowEmoji(false); }}
                                className={cn(
                                    "h-[38px] w-[38px] shrink-0 flex items-center justify-center rounded-full transition-all",
                                    showAttachMenu
                                        ? "text-tg-primary bg-tg-primary/10"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <Paperclip className={cn("h-[21px] w-[21px] transition-transform duration-200", showAttachMenu && "rotate-45")} />
                            </button>

                            <AttachmentMenu
                                open={showAttachMenu}
                                onClose={() => setShowAttachMenu(false)}
                                onPhotoVideo={() => fileInputRef.current?.click()}
                                onDocument={() => docInputRef.current?.click()}
                                onPoll={() => onOpenPollCreator?.()}
                                onLocation={() => onSendLocation?.()}
                                onContact={() => onOpenContactPicker?.()}
                                onGif={() => onOpenGifPicker?.()}
                                onSticker={() => { setShowEmoji(true); setShowAttachMenu(false); }}
                            />
                        </div>

                        {/* Emoji button — inside field, right */}
                        <button
                            ref={emojiButtonRef}
                            onClick={() => { setShowEmoji(!showEmoji); setShowAttachMenu(false); }}
                            className={cn(
                                "absolute right-1.5 bottom-[5px] z-10 h-[38px] w-[38px] flex items-center justify-center rounded-full transition-colors",
                                showEmoji ? "text-tg-primary" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Smile className="h-[21px] w-[21px]" />
                        </button>

                        {/* Textarea — Telegram Web style */}
                        <textarea
                            ref={textareaRef}
                            value={text}
                            onChange={handleTextChange}
                            onKeyDown={handleKeyDown}
                            placeholder={editingMessage ? "Редактирование сообщения..." : "Сообщение"}
                            className="w-full resize-none rounded-2xl border border-border/60 bg-tg-input-bg pl-12 pr-12 py-3 text-[15px] leading-[22px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-tg-primary/30 transition-colors"
                            rows={1}
                            style={{ height: '48px', maxHeight: '130px', overflowY: 'auto' }}
                        />
                    </div>

                    {/* Send / Mic button — outside field, right */}
                    <div className="shrink-0 pb-[1px]">
                        {hasContent ? (
                            <button
                                className="h-[48px] w-[48px] flex items-center justify-center rounded-full bg-tg-primary text-white shadow-sm hover:brightness-110 transition-all active:scale-95 animate-btn-morph"
                                onClick={handleSend}
                            >
                                <Send className="h-[19px] w-[19px] ml-0.5" />
                            </button>
                        ) : (
                            <button
                                className="h-[48px] w-[48px] flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-95"
                                onClick={startRecording}
                                title="Голосовое сообщение"
                            >
                                <Mic className="h-[22px] w-[22px]" />
                            </button>
                        )}
                    </div>

                    {/* Hidden file inputs */}
                    <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
                    <input ref={docInputRef} type="file" multiple accept="*/*" onChange={handleFileSelect} className="hidden" />
                </div>
            )}

            {/* Emoji Picker */}
            {showEmoji && (
                <EmojiPicker
                    anchorRef={emojiButtonRef}
                    onEmojiSelect={handleEmojiSelect}
                    onStickerSelect={handleStickerSelect}
                    onClose={() => setShowEmoji(false)}
                />
            )}
        </div>
    );
}
