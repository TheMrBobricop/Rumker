
import { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Smile, Send, Mic, X, Pencil, Image, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EditingMessage {
    id: string;
    chatId: string;
    content: string;
}

interface ReplyToMessage {
    id: string;
    content: string;
    senderName: string;
}

interface MessageInputProps {
    onSendMessage: (text: string, files: File[], sendAsFile?: boolean) => void;
    onSendVoice: (blob: Blob, duration: number) => void;
    onTyping: () => void;
    replyToMessage?: ReplyToMessage;
    onCancelReply?: () => void;
    editingMessage?: EditingMessage | null;
    onEditMessage?: (messageId: string, chatId: string, content: string) => void;
    onCancelEdit?: () => void;
    resetKey?: number;
    droppedFiles?: File[];
    onDroppedFilesHandled?: () => void;
}

// ─── Media Send Dialog ───────────────────────────────────────────────

function MediaSendDialog({
    files,
    onClose,
    onSend,
}: {
    files: File[];
    onClose: () => void;
    onSend: (caption: string, sendAsFile: boolean) => void;
}) {
    const [sendAsFile, setSendAsFile] = useState(false);
    const [caption, setCaption] = useState('');
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const captionRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const urls = files.map((f) => URL.createObjectURL(f));
        setPreviewUrls(urls);
        captionRef.current?.focus();
        return () => urls.forEach((url) => URL.revokeObjectURL(url));
    }, [files]);

    const hasMedia = files.some(
        (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSend(caption, sendAsFile);
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={onClose}
        >
            <div
                className="bg-card rounded-2xl max-w-md w-full mx-4 overflow-hidden shadow-2xl border border-border animate-fade-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="font-semibold text-sm text-foreground">
                        Отправить{files.length > 1 ? ` (${files.length})` : ''}
                    </span>
                    <button
                        onClick={onClose}
                        className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Mode toggle — only for media files */}
                {hasMedia && (
                    <div className="flex gap-1.5 px-4 pt-3">
                        <button
                            onClick={() => setSendAsFile(false)}
                            className={cn(
                                'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all',
                                !sendAsFile
                                    ? 'bg-tg-primary text-white shadow-sm'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <Image className="h-3.5 w-3.5" />
                            Сжать
                        </button>
                        <button
                            onClick={() => setSendAsFile(true)}
                            className={cn(
                                'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all',
                                sendAsFile
                                    ? 'bg-tg-primary text-white shadow-sm'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <FileText className="h-3.5 w-3.5" />
                            Без сжатия
                        </button>
                    </div>
                )}

                {/* Previews */}
                <div className="p-4">
                    {!sendAsFile ? (
                        /* Photo mode — visual grid */
                        <div
                            className={cn(
                                'grid gap-2',
                                files.length === 1
                                    ? 'grid-cols-1'
                                    : files.length <= 4
                                      ? 'grid-cols-2'
                                      : 'grid-cols-3'
                            )}
                        >
                            {files.map((file, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        'relative rounded-xl overflow-hidden bg-muted',
                                        files.length === 1 ? 'max-h-[280px]' : 'aspect-square'
                                    )}
                                >
                                    {file.type.startsWith('video/') ? (
                                        <video
                                            src={previewUrls[i]}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : file.type.startsWith('image/') ? (
                                        <img
                                            src={previewUrls[i]}
                                            alt={file.name}
                                            className={cn(
                                                'w-full h-full',
                                                files.length === 1 ? 'object-contain' : 'object-cover'
                                            )}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full p-3 gap-1">
                                            <FileText className="h-8 w-8 text-muted-foreground" />
                                            <span className="text-[10px] text-muted-foreground text-center truncate max-w-full">
                                                {file.name}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* File mode — list with names + sizes */
                        <div className="space-y-2">
                            {files.map((file, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50"
                                >
                                    {file.type.startsWith('image/') ? (
                                        <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0">
                                            <img
                                                src={previewUrls[i]}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        </div>
                                    ) : (
                                        <div className="h-10 w-10 rounded-lg bg-tg-primary/10 flex items-center justify-center shrink-0">
                                            <FileText className="h-5 w-5 text-tg-primary" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{file.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {formatSize(file.size)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Caption + Send */}
                <div className="flex items-center gap-2 px-4 pb-4">
                    <input
                        ref={captionRef}
                        type="text"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Добавить подпись..."
                        className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-tg-primary/30 transition-shadow"
                    />
                    <button
                        onClick={() => onSend(caption, sendAsFile)}
                        className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-tg-primary text-white hover:opacity-90 transition-opacity active:scale-95"
                    >
                        <Send className="h-[18px] w-[18px] ml-0.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Message Input ───────────────────────────────────────────────────

export function MessageInput({
    onSendMessage,
    onSendVoice,
    onTyping,
    replyToMessage,
    onCancelReply,
    editingMessage,
    onEditMessage,
    onCancelEdit,
    resetKey,
    droppedFiles,
    onDroppedFilesHandled,
}: MessageInputProps) {
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [showMediaDialog, setShowMediaDialog] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Handle resetKey
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (prevResetKey !== resetKey) {
        setPrevResetKey(resetKey);
        if (resetKey !== undefined && resetKey > 0) {
            setFiles([]);
            setShowMediaDialog(false);
        }
    }

    // Handle editing
    const [prevEditing, setPrevEditing] = useState(editingMessage);
    if (prevEditing !== editingMessage) {
        setPrevEditing(editingMessage);
        if (editingMessage) {
            setText(editingMessage.content);
        }
    }

    // Handle dropped files from parent (ChatWindow drag-and-drop)
    const dropHandlerRef = useRef(onDroppedFilesHandled);
    dropHandlerRef.current = onDroppedFilesHandled;

    useEffect(() => {
        if (droppedFiles && droppedFiles.length > 0) {
            setFiles(droppedFiles.slice(0, 10));
            setShowMediaDialog(true);
            dropHandlerRef.current?.();
        }
    }, [droppedFiles]);

    useEffect(() => {
        if (editingMessage) textareaRef.current?.focus();
    }, [editingMessage]);

    useEffect(() => {
        if (replyToMessage) textareaRef.current?.focus();
    }, [replyToMessage]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
        }
    }, [text]);

    // ── Recording ──

    const stopRecordingCleanup = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        setIsRecording(false);
        setRecordingDuration(0);
    }, []);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mimeType = MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/ogg';
            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.start();
            setIsRecording(true);
            setRecordingDuration(0);

            const startTime = Date.now();
            timerRef.current = window.setInterval(() => {
                setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
        } catch {
            console.error('Microphone access denied');
        }
    }, []);

    const cancelRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.ondataavailable = null;
            mediaRecorderRef.current.onstop = null;
            mediaRecorderRef.current.stop();
        }
        chunksRef.current = [];
        stopRecordingCleanup();
    }, [stopRecordingCleanup]);

    const sendRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === 'inactive') return;

        const duration = recordingDuration;
        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
            chunksRef.current = [];
            if (blob.size > 0) {
                onSendVoice(blob, duration);
            }
        };
        recorder.stop();
        stopRecordingCleanup();
    }, [recordingDuration, onSendVoice, stopRecordingCleanup]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        };
    }, []);

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // ── Send ──

    const handleSend = () => {
        if (editingMessage && onEditMessage) {
            const trimmed = text.trim();
            if (trimmed && trimmed !== editingMessage.content) {
                onEditMessage(editingMessage.id, editingMessage.chatId, trimmed);
            }
            setText('');
            onCancelEdit?.();
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            return;
        }

        if (text.trim()) {
            onSendMessage(text, []);
            setText('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape' && editingMessage) {
            e.preventDefault();
            setText('');
            onCancelEdit?.();
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files).slice(0, 10);
            setFiles(newFiles);
            setShowMediaDialog(true);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDialogSend = (caption: string, sendAsFile: boolean) => {
        onSendMessage(caption, files, sendAsFile);
        setFiles([]);
        setShowMediaDialog(false);
    };

    const handleDialogClose = () => {
        setShowMediaDialog(false);
        setFiles([]);
    };

    return (
        <>
            {/* Media Send Dialog */}
            {showMediaDialog && files.length > 0 && (
                <MediaSendDialog
                    files={files}
                    onClose={handleDialogClose}
                    onSend={handleDialogSend}
                />
            )}

            <div className="bg-tg-bg px-2 sm:px-4 py-1.5 shrink-0 transition-colors duration-200">
                <div className="max-w-3xl mx-auto">
                    {/* Edit Bar */}
                    {editingMessage && (
                        <div className="flex items-center justify-between border-l-2 border-blue-500 pl-2 mb-1.5 bg-blue-50 dark:bg-blue-900/20 p-1.5 rounded-r">
                            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                                <Pencil className="h-3 w-3" />
                                <span>Редактирование</span>
                            </div>
                            <button
                                onClick={() => {
                                    setText('');
                                    onCancelEdit?.();
                                }}
                                className="text-tg-text-secondary hover:text-red-500 transition-colors p-0.5"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {/* Reply Context */}
                    {!editingMessage && replyToMessage && (
                        <div className="flex items-center justify-between border-l-2 border-tg-primary pl-2 mb-1.5 bg-black/5 dark:bg-white/5 p-1.5 rounded-r">
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-tg-primary">
                                    {replyToMessage.senderName}
                                </div>
                                <div className="text-xs text-tg-text-secondary truncate">
                                    {replyToMessage.content}
                                </div>
                            </div>
                            <button
                                onClick={onCancelReply}
                                className="ml-2 text-tg-text-secondary hover:text-red-500 transition-colors p-0.5"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {/* Hidden file input */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*,video/*"
                        multiple
                        onChange={handleFileSelect}
                    />

                    {/* Input bar — bigger TG-style */}
                    {isRecording ? (
                        <div className="flex items-center gap-2 bg-tg-input-bg rounded-2xl px-3 py-1.5">
                            <button
                                onClick={cancelRecording}
                                className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                                <span className="text-[15px] font-medium text-tg-text tabular-nums">
                                    {formatDuration(recordingDuration)}
                                </span>
                            </div>

                            <button
                                onClick={sendRecording}
                                className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-tg-primary text-white hover:opacity-90 transition-opacity active:scale-95"
                            >
                                <Send className="h-[18px] w-[18px] ml-0.5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 bg-tg-input-bg rounded-2xl px-1.5 py-1">
                            {!editingMessage && (
                                <button
                                    className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full text-tg-text-secondary hover:text-tg-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Paperclip className="h-5 w-5" />
                                </button>
                            )}

                            <div className="relative flex-1 min-w-0">
                                <textarea
                                    ref={textareaRef}
                                    value={text}
                                    onChange={(e) => {
                                        setText(e.target.value);
                                        onTyping();
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder={
                                        editingMessage
                                            ? 'Изменить сообщение...'
                                            : 'Сообщение...'
                                    }
                                    className="w-full resize-none bg-transparent py-2.5 pl-2 pr-10 text-[15px] text-tg-text placeholder:text-tg-text-secondary focus:outline-none max-h-[140px] scrollbar-thin leading-snug"
                                    rows={1}
                                />
                                <button
                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-tg-text-secondary hover:text-tg-primary transition-colors p-1"
                                    onClick={() => {
                                        /* Open emoji picker */
                                    }}
                                >
                                    <Smile className="h-5 w-5" />
                                </button>
                            </div>

                            {text.trim() ? (
                                <button
                                    className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-tg-primary text-white hover:opacity-90 transition-opacity active:scale-95"
                                    onClick={handleSend}
                                >
                                    <Send className="h-[18px] w-[18px] ml-0.5" />
                                </button>
                            ) : (
                                <button
                                    className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full text-tg-text-secondary hover:text-tg-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                    onClick={startRecording}
                                >
                                    <Mic className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
