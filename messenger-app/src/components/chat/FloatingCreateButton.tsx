import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateChatDialog } from './CreateChatDialog';
import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { Chat } from '@/types';

interface User {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    avatar?: string;
    isOnline?: boolean;
}

interface FloatingCreateButtonProps {
    onCreateChat: (chat: Chat) => void;
}

export function FloatingCreateButton({ onCreateChat }: FloatingCreateButtonProps) {
    const authStore = useAuthStore();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

    // Mock users for demo
    const mockUsers: User[] = [
        {
            id: '1',
            username: 'john_doe',
            firstName: 'John',
            lastName: 'Doe',
            avatar: undefined,
            isOnline: true
        },
        {
            id: '2',
            username: 'jane_smith',
            firstName: 'Jane',
            lastName: 'Smith',
            avatar: undefined,
            isOnline: false
        },
        {
            id: '3',
            username: 'bob_wilson',
            firstName: 'Bob',
            lastName: 'Wilson',
            avatar: undefined,
            isOnline: true
        }
    ];

    const handleCreateChat = async (chatData: { name?: string; type: 'private' | 'group'; participantIds: string[] }) => {
        try {
            const result = await createChat(chatData);
            onCreateChat(result);
            setIsCreateDialogOpen(false);
        } catch (error) {
            console.error('Create chat error:', error);
        }
    };

    return (
        <>
            <CreateChatDialog
                isOpen={isCreateDialogOpen}
                onClose={() => setIsCreateDialogOpen(false)}
                onCreateChat={handleCreateChat}
                availableUsers={mockUsers}
            />
            
            {/* Floating Create Button - Telegram Style */}
            <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg bg-tg-primary hover:bg-tg-primary/90 text-white flex items-center justify-center transition-all duration-200 hover:scale-105 z-50"
                title="Создать чат"
            >
                <Plus className="h-6 w-6" />
            </Button>
        </>
    );
}
