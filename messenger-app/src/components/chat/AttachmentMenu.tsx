import { useRef, useEffect } from 'react';
import { Image, FileText, BarChart3, MapPin, Contact, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttachmentMenuItem {
    icon: React.ReactNode;
    label: string;
    color: string;
    onClick: () => void;
}

interface AttachmentMenuProps {
    open: boolean;
    onClose: () => void;
    onPhotoVideo: () => void;
    onDocument: () => void;
    onPoll: () => void;
    onLocation: () => void;
    onContact: () => void;
    onGif: () => void;
    onSticker: () => void;
}

export function AttachmentMenu({
    open,
    onClose,
    onPhotoVideo,
    onDocument,
    onPoll,
    onLocation,
    onContact,
    onGif,
    onSticker,
}: AttachmentMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // Delay adding the listener to avoid immediate close from the click that opened the menu
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 10);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [open, onClose]);

    if (!open) return null;

    const items: AttachmentMenuItem[] = [
        {
            icon: <Image className="h-5 w-5" />,
            label: 'Фото/Видео',
            color: 'bg-blue-500',
            onClick: () => { onPhotoVideo(); onClose(); },
        },
        {
            icon: <FileText className="h-5 w-5" />,
            label: 'Документ',
            color: 'bg-violet-500',
            onClick: () => { onDocument(); onClose(); },
        },
        {
            icon: <BarChart3 className="h-5 w-5" />,
            label: 'Опрос',
            color: 'bg-amber-500',
            onClick: () => { onPoll(); onClose(); },
        },
        {
            icon: <MapPin className="h-5 w-5" />,
            label: 'Геолокация',
            color: 'bg-green-500',
            onClick: () => { onLocation(); onClose(); },
        },
        {
            icon: <Contact className="h-5 w-5" />,
            label: 'Контакт',
            color: 'bg-teal-500',
            onClick: () => { onContact(); onClose(); },
        },
        {
            icon: <Smile className="h-5 w-5" />,
            label: 'Стикер',
            color: 'bg-pink-500',
            onClick: () => { onSticker(); onClose(); },
        },
        {
            icon: <span className="text-sm font-bold">GIF</span>,
            label: 'GIF',
            color: 'bg-orange-500',
            onClick: () => { onGif(); onClose(); },
        },
    ];

    return (
        <div
            ref={menuRef}
            className="absolute bottom-full left-0 mb-2 z-50 animate-attachment-menu-in"
        >
            <div className="bg-card/95 backdrop-blur-md rounded-2xl shadow-xl border border-border overflow-hidden p-2 min-w-[200px]">
                {items.map((item, index) => (
                    <button
                        key={item.label}
                        onClick={item.onClick}
                        className={cn(
                            "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                            "text-foreground hover:bg-muted active:scale-[0.98]"
                        )}
                        style={{ animationDelay: `${index * 30}ms` }}
                    >
                        <div className={cn(
                            "h-9 w-9 rounded-full flex items-center justify-center text-white shrink-0",
                            item.color
                        )}>
                            {item.icon}
                        </div>
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
