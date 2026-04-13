import { MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { SharedContact } from '@/types';
import { findOrCreatePrivateChat } from '@/lib/api/chats';
import { useChatStore } from '@/stores/chatStore';
import { toast } from 'sonner';

interface ContactBubbleProps {
    contactData: SharedContact;
}

export function ContactBubble({ contactData }: ContactBubbleProps) {
    const displayName = contactData.firstName
        ? `${contactData.firstName}${contactData.lastName ? ` ${contactData.lastName}` : ''}`
        : contactData.username;

    const handleOpenChat = async () => {
        try {
            const chat = await findOrCreatePrivateChat(contactData.userId);
            useChatStore.getState().setActiveChat(chat);
            useChatStore.getState().loadChats();
        } catch {
            toast.error('Не удалось открыть чат');
        }
    };

    return (
        <div className="flex items-center gap-3 min-w-[180px]">
            <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={contactData.avatar} />
                <AvatarFallback className="bg-teal-500/20 text-teal-600 dark:text-teal-400 text-sm font-medium">
                    {(contactData.firstName || contactData.username || 'U').slice(0, 2).toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{displayName}</div>
                <div className="text-xs text-muted-foreground">@{contactData.username}</div>
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    handleOpenChat();
                }}
                className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                title="Написать"
            >
                <MessageSquare className="h-4 w-4" />
            </button>
        </div>
    );
}
