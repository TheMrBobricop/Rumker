import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreateChatDialog } from './CreateChatDialog';
import { Plus, Users } from 'lucide-react';
import type { Chat } from '@/types';

interface User {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    avatar?: string;
    isOnline?: boolean;
}

interface ChatListHeaderProps {
    onCreateChat: (chat: Chat) => void;
}

export function ChatListHeader({ onCreateChat }: ChatListHeaderProps) {
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

    // Mock users for demo - в реальном приложении здесь будет API вызов
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

    const handleCreateChat = (chat: Chat) => {
        onCreateChat(chat);
        setIsCreateDialogOpen(false);
    };

    return (
        <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Chats</h2>
                
                <CreateChatDialog
                    isOpen={isCreateDialogOpen}
                    onClose={() => setIsCreateDialogOpen(false)}
                    onCreateChat={handleCreateChat}
                    availableUsers={mockUsers}
                />
                
                <Button
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="flex items-center gap-2"
                >
                    <Plus className="h-4 w-4" />
                    New Chat
                </Button>
            </div>
            
            {/* Chat Type Pills */}
            <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    All Chats
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    Private
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Groups
                </Button>
            </div>
        </div>
    );
}
