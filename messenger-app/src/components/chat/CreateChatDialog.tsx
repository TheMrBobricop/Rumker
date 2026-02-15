import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Plus, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { createChat } from '@/lib/api/chats';
import type { Chat } from '@/types';

interface User {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    avatar?: string;
    isOnline?: boolean;
}

interface CreateChatDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onCreateChat: (chat: Chat) => void;
    availableUsers: User[];
}

export function CreateChatDialog({ isOpen, onClose, onCreateChat, availableUsers }: CreateChatDialogProps) {
    const [chatType, setChatType] = useState<'private' | 'group'>('private');
    const [chatName, setChatName] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [isCreating, setIsCreating] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (chatType === 'private' && selectedUsers.length !== 1) {
            toast.error('Private chat requires exactly 1 participant');
            return;
        }
        
        if (chatType === 'group' && selectedUsers.length < 2) {
            toast.error('Group chat requires at least 2 participants');
            return;
        }
        
        if (chatType === 'group' && !chatName.trim()) {
            toast.error('Group chat requires a name');
            return;
        }

        setIsCreating(true);
        
        try {
            const result = await createChat({
                type: chatType,
                name: chatType === 'group' ? chatName : undefined,
                participantIds: selectedUsers,
            });
            
            toast.success(`${chatType === 'group' ? 'Group' : 'Private'} chat created successfully!`);
            
            onCreateChat(result);
            onClose();
            
            // Reset form
            setChatName('');
            setSelectedUsers([]);
            setChatType('private');
        } catch (error) {
            console.error('Create chat error:', error);
            toast.error('Failed to create chat');
        } finally {
            setIsCreating(false);
        }
    };

    const toggleUserSelection = (userId: string) => {
        setSelectedUsers(prev => 
            prev.includes(userId) 
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const filteredUsers = availableUsers.filter(user => 
        user.firstName.toLowerCase().includes('') || user.username.toLowerCase().includes('')
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Create New Chat
                    </DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Chat Type Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Chat Type</label>
                        <div className="flex gap-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="chatType"
                                    value="private"
                                    checked={chatType === 'private'}
                                    onChange={(e) => setChatType(e.target.value as 'private' | 'group')}
                                    className="mr-2"
                                />
                                <span className="text-sm">Private (2 people)</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="chatType"
                                    value="group"
                                    checked={chatType === 'group'}
                                    onChange={(e) => setChatType(e.target.value as 'private' | 'group')}
                                    className="mr-2"
                                />
                                <span className="text-sm">Group (2+ people)</span>
                            </label>
                        </div>
                    </div>

                    {/* Group Name (only for group chats) */}
                    {chatType === 'group' && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Group Name</label>
                            <Input
                                value={chatName}
                                onChange={(e) => setChatName(e.target.value)}
                                placeholder="Enter group name..."
                                className="w-full"
                            />
                        </div>
                    )}

                    {/* Participants Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Participants ({selectedUsers.length} {chatType === 'private' ? '/ 1' : '/ 2+'})
                        </label>
                        
                        {/* User Search */}
                        <div className="relative mb-2">
                            <Hash className="absolute left-3 top-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search users by name or username..."
                                className="pl-9"
                            />
                        </div>

                        {/* Selected Users */}
                        <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
                            {filteredUsers.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    No users found
                                </p>
                            ) : (
                                filteredUsers.map(user => (
                                    <label
                                        key={user.id}
                                        className="flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-muted"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedUsers.includes(user.id)}
                                            onChange={() => toggleUserSelection(user.id)}
                                            className="rounded"
                                        />
                                        <Avatar className="h-6 w-6">
                                            <AvatarImage src={user.avatar} />
                                            <AvatarFallback className="text-xs">
                                                {user.firstName.slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">
                                                {user.firstName} {user.lastName}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                @{user.username}
                                                {user.isOnline && (
                                                    <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full" title="Online" />
                                                )}
                                            </p>
                                        </div>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={isCreating}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isCreating || (chatType === 'private' && selectedUsers.length !== 1) || (chatType === 'group' && (selectedUsers.length < 2 || !chatName.trim()))}
                        >
                            {isCreating ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-t-current border-r-transparent border-b-transparent animate-spin rounded-full border-l-current" />
                                    Creating...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    Create {chatType === 'group' ? 'Group' : 'Private'} Chat
                                </span>
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
