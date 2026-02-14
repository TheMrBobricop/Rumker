
import { useState, useRef, useEffect } from 'react';
import { Paperclip, Smile, Send, Mic, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MediaUploader } from '@/components/media/MediaUploader'; // Импорт загрузчика

interface MessageInputProps {
    onSendMessage: (text: string, files: File[]) => void;
    onSendVoice: () => void; // Пока заглушка
    onTyping: () => void;
    replyToMessageId?: string;
    onCancelReply?: () => void;
}

export function MessageInput({
    onSendMessage,
    onSendVoice,
    onTyping,
    replyToMessageId,
    onCancelReply,
}: MessageInputProps) {
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-grow logic
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [text]);

    const handleSend = () => {
        if (text.trim() || files.length > 0) {
            onSendMessage(text, files);
            setText(''); // Reset text
            setFiles([]); // Reset files
            if (textareaRef.current) textareaRef.current.style.height = 'auto'; // Reset height
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col border-t border-tg-divider bg-tg-bg px-4 py-2 transition-all">
            {/* Reply Context (if any) */}
            {replyToMessageId && (
                <div className="flex items-center justify-between border-l-2 border-tg-primary pl-2 mb-2 bg-black/5 p-1 rounded-r">
                    <div className="text-xs text-tg-primary">Replying to message...</div>
                    <button onClick={onCancelReply} className="text-tg-text-secondary hover:text-tg-destructive">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* File Preview (if files attached) */}
            {files.length > 0 && (
                <div className="mb-2">
                    <MediaUploader onFilesSelected={setFiles} maxFiles={5} />
                </div>
            )}

            {/* Input Row */}
            <div className="flex items-end gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 text-tg-text-secondary hover:bg-tg-hover hover:text-tg-primary transition-colors"
                    onClick={() => { /* Open attachment menu */ }}
                // For now, this could just trigger file input click programmatically
                >
                    <Paperclip className="h-6 w-6" />
                </Button>

                <div className="relative flex-1">
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            onTyping();
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Написать сообщение..."
                        className="w-full resize-none bg-transparent py-2 pl-3 pr-10 text-tg-text placeholder:text-tg-text-secondary focus:outline-none max-h-[120px] scrollbar-thin"
                        rows={1}
                    />
                    <button
                        className="absolute right-2 bottom-2 text-tg-text-secondary hover:text-tg-primary transition-colors"
                        onClick={() => { /* Open emoji picker */ }}
                    >
                        <Smile className="h-6 w-6" />
                    </button>
                </div>

                {text.trim() || files.length > 0 ? (
                    <Button
                        size="icon"
                        className="h-10 w-10 shrink-0 rounded-full bg-tg-primary text-white hover:bg-tg-secondary transition-transform active:scale-95 shadow-lg"
                        onClick={handleSend}
                    >
                        <Send className="h-5 w-5 ml-0.5" />
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 text-tg-text-secondary hover:bg-tg-hover hover:text-tg-primary transition-colors"
                        onClick={onSendVoice}
                    >
                        <Mic className="h-6 w-6" />
                    </Button>
                )}
            </div>
        </div>
    );
}
