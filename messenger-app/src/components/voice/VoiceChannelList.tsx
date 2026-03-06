import { useState, useEffect, useRef } from 'react';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    MicOff, Headphones,
    Plus, Lock, Volume2, ChevronDown, ChevronRight,
    Trash2, Pencil, ArrowUp, ArrowDown, FolderPlus, GripVertical
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragStartEvent,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface VoiceChannelListProps {
    chatId: string;
    className?: string;
    /** Called after user joins a channel — used to open the VoiceChannelPanel in main area */
    onChannelJoined?: (channel: { id: string; name: string; chatId: string }) => void;
}

// ── Sortable channel item ──
function SortableChannelItem({
    channel, isActive, channelParticipants, onJoin, onDelete,
}: {
    channel: any;
    isActive: boolean;
    channelParticipants: any[];
    onJoin: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: channel.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div
                className={cn(
                    "group flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer transition-colors",
                    isActive
                        ? "bg-[#404249] text-white"
                        : "text-[#96989d] hover:bg-[#35373c] hover:text-[#dbdee1]"
                )}
                onClick={() => onJoin(channel.id)}
            >
                {/* Drag handle */}
                <div
                    className="dc-dnd-handle flex items-center"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-3.5 w-3.5" />
                </div>
                {channel.isLocked ? (
                    <Lock className="h-4 w-4 shrink-0 opacity-60" />
                ) : (
                    <Volume2 className="h-4 w-4 shrink-0 opacity-60" />
                )}
                <span className="text-sm flex-1 truncate">{channel.name}</span>
                {channelParticipants.length > 0 && (
                    <span className="text-[11px] opacity-60">{channelParticipants.length}</span>
                )}
                <button
                    className="h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 text-[#96989d] hover:text-[#ed4245] transition-opacity shrink-0"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(channel.id);
                    }}
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            </div>

            {/* Participants under channel */}
            {channelParticipants.length > 0 && (
                <div className="ml-4 space-y-px">
                    {channelParticipants.map((p: any) => (
                        <div
                            key={p.userId}
                            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#35373c] transition-colors"
                        >
                            <div className="relative">
                                <Avatar className={cn(
                                    "h-6 w-6",
                                    p.isSpeaking && "ring-2 ring-green-500"
                                )}>
                                    <AvatarImage src={p.avatar} />
                                    <AvatarFallback className="text-[9px] bg-[#5865f2] text-white">
                                        {(p.firstName || p.username || '?').slice(0, 1).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                            <span className="text-[13px] text-[#96989d] truncate flex-1">
                                {p.firstName || p.username}
                            </span>
                            <div className="flex items-center gap-0.5">
                                {p.isMuted && <MicOff className="h-3 w-3 text-[#ed4245]" />}
                                {p.isDeafened && <Headphones className="h-3 w-3 text-[#ed4245]" />}
                                {p.isSpeaking && (
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Drag overlay (clone visible while dragging) ──
function DragOverlayItem({ channel }: { channel: any }) {
    return (
        <div className="dc-dnd-overlay flex items-center gap-1.5 px-2 py-1.5 text-[#dbdee1]">
            <GripVertical className="h-3.5 w-3.5 text-[#4e5058]" />
            <Volume2 className="h-4 w-4 shrink-0 opacity-60" />
            <span className="text-sm truncate">{channel.name}</span>
        </div>
    );
}

export function VoiceChannelList({ chatId, className, onChannelJoined }: VoiceChannelListProps) {
    const categories = useVoiceChannelStore((s) => s.categories);
    const currentChannel = useVoiceChannelStore((s) => s.currentChannel);
    const participants = useVoiceChannelStore((s) => s.participants);
    const joinChannel = useVoiceChannelStore((s) => s.joinChannel);
    const createChannel = useVoiceChannelStore((s) => s.createChannel);
    const deleteChannel = useVoiceChannelStore((s) => s.deleteChannel);
    const loadChannels = useVoiceChannelStore((s) => s.loadChannels);
    const renameCategory = useVoiceChannelStore((s) => s.renameCategory);
    const deleteCategory = useVoiceChannelStore((s) => s.deleteCategory);
    const reorderCategories = useVoiceChannelStore((s) => s.reorderCategories);
    const reorderChannels = useVoiceChannelStore((s) => s.reorderChannels);

    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState('general');

    // Category management
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryName, setEditingCategoryName] = useState('');
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categoryCtx, setCategoryCtx] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    // DnD state
    const [activeId, setActiveId] = useState<string | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    // Load channels when chatId changes
    useEffect(() => {
        if (chatId) {
            loadChannels(chatId);
        }
    }, [chatId, loadChannels]);

    // Focus edit input when editing starts
    useEffect(() => {
        if (editingCategoryId) {
            editInputRef.current?.focus();
            editInputRef.current?.select();
        }
    }, [editingCategoryId]);

    // Close context menu on click outside
    useEffect(() => {
        if (!categoryCtx) return;
        const handler = () => setCategoryCtx(null);
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, [categoryCtx]);

    const toggleCategory = (categoryId: string) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(categoryId)) {
                newSet.delete(categoryId);
            } else {
                newSet.add(categoryId);
            }
            return newSet;
        });
    };

    const handleCreateChannel = async () => {
        if (!newChannelName.trim()) return;
        try {
            await createChannel(chatId, newChannelName.trim(), selectedCategoryId);
            setNewChannelName('');
            setShowCreateModal(false);
        } catch (error) {
            console.error('Failed to create voice channel:', error);
        }
    };

    const handleJoinChannel = (channelId: string) => {
        if (currentChannel?.id === channelId) {
            const ch = categories.flatMap(c => c.channels).find(c => c.id === channelId);
            if (ch) {
                const info = { id: channelId, name: ch.name, chatId };
                useVoiceChannelStore.getState().setViewingChannel(info);
                onChannelJoined?.(info);
            }
        } else {
            joinChannel(channelId);
            const ch = categories.flatMap(c => c.channels).find(c => c.id === channelId);
            if (ch) {
                const info = { id: channelId, name: ch.name, chatId };
                useVoiceChannelStore.getState().setViewingChannel(info);
                onChannelJoined?.(info);
            }
        }
    };

    // Category CRUD handlers
    const handleRenameCategory = async (oldName: string) => {
        const newName = editingCategoryName.trim();
        if (!newName || newName === oldName) {
            setEditingCategoryId(null);
            return;
        }
        try {
            await renameCategory(chatId, oldName, newName);
            toast.success('Раздел переименован');
        } catch {
            toast.error('Не удалось переименовать');
        }
        setEditingCategoryId(null);
    };

    const handleDeleteCategory = async (category: string) => {
        try {
            await deleteCategory(chatId, category);
            toast.success('Раздел удалён');
        } catch {
            toast.error('Не удалось удалить раздел');
        }
        setCategoryCtx(null);
    };

    const handleMoveCategoryUp = async (index: number) => {
        if (index <= 0) return;
        const order = categories.map((c, i) => ({ category: c.id, position: i }));
        [order[index], order[index - 1]] = [order[index - 1], order[index]];
        order.forEach((o, i) => o.position = i);
        try {
            await reorderCategories(chatId, order);
        } catch {
            toast.error('Не удалось переместить');
        }
        setCategoryCtx(null);
    };

    const handleMoveCategoryDown = async (index: number) => {
        if (index >= categories.length - 1) return;
        const order = categories.map((c, i) => ({ category: c.id, position: i }));
        [order[index], order[index + 1]] = [order[index + 1], order[index]];
        order.forEach((o, i) => o.position = i);
        try {
            await reorderCategories(chatId, order);
        } catch {
            toast.error('Не удалось переместить');
        }
        setCategoryCtx(null);
    };

    const handleCreateCategory = async () => {
        const name = newCategoryName.trim();
        if (!name) return;
        try {
            await createChannel(chatId, 'Голосовой канал', name);
            toast.success('Раздел создан');
            setNewCategoryName('');
            setShowNewCategory(false);
        } catch {
            toast.error('Не удалось создать раздел');
        }
    };

    const handleCategoryContextMenu = (e: React.MouseEvent, category: { id: string; name: string }) => {
        e.preventDefault();
        e.stopPropagation();
        setCategoryCtx({ id: category.id, name: category.name, x: e.clientX, y: e.clientY });
    };

    // ── DnD handlers ──
    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // Find which category owns the active and over channels
        const allChannels = categories.flatMap(cat => cat.channels.map(ch => ({ ...ch, catId: cat.id })));
        const activeChannel = allChannels.find(ch => ch.id === active.id);
        const overChannel = allChannels.find(ch => ch.id === over.id);

        if (!activeChannel || !overChannel) return;

        // Build the new channel order
        const targetCatId = overChannel.catId;
        const targetCat = categories.find(c => c.id === targetCatId);
        if (!targetCat) return;

        let newChannelList: typeof targetCat.channels;

        if (activeChannel.catId === targetCatId) {
            // Same category — reorder
            const oldIndex = targetCat.channels.findIndex(ch => ch.id === active.id);
            const newIndex = targetCat.channels.findIndex(ch => ch.id === over.id);
            newChannelList = arrayMove(targetCat.channels, oldIndex, newIndex);
        } else {
            // Cross-category — remove from source, insert into target
            const overIndex = targetCat.channels.findIndex(ch => ch.id === over.id);
            newChannelList = [...targetCat.channels];
            newChannelList.splice(overIndex, 0, { ...activeChannel, categoryId: targetCatId });
        }

        // Build update payload
        const reorderPayload = newChannelList.map((ch, i) => ({
            id: ch.id,
            position: i,
            category: targetCatId,
        }));

        // If cross-category, we also need to update the source category
        if (activeChannel.catId !== targetCatId) {
            const sourceCat = categories.find(c => c.id === activeChannel.catId);
            if (sourceCat) {
                const remaining = sourceCat.channels.filter(ch => ch.id !== active.id);
                remaining.forEach((ch, i) => {
                    reorderPayload.push({ id: ch.id, position: i, category: activeChannel.catId });
                });
            }
        }

        reorderChannels(chatId, reorderPayload);
    };

    // Find the active drag item for overlay
    const activeDragChannel = activeId
        ? categories.flatMap(c => c.channels).find(ch => ch.id === activeId)
        : null;

    return (
        <div className={cn("flex flex-col", className)}>
            {categories.length === 0 && !showNewCategory && (
                <div className="px-4 py-6 text-xs text-[#96989d] text-center">
                    Нет голосовых каналов
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                {categories.map((category) => {
                    const isCollapsed = collapsedCategories.has(category.id);
                    const isEditing = editingCategoryId === category.id;

                    return (
                        <div key={category.id} className="mt-3 first:mt-1">
                            {/* Category header */}
                            <div
                                className="flex items-center gap-0.5 px-2 cursor-pointer group hover:text-[#dbdee1] select-none"
                                onClick={() => !isEditing && toggleCategory(category.id)}
                                onContextMenu={(e) => handleCategoryContextMenu(e, category)}
                            >
                                {isCollapsed ? (
                                    <ChevronRight className="h-3 w-3 text-[#96989d] shrink-0" />
                                ) : (
                                    <ChevronDown className="h-3 w-3 text-[#96989d] shrink-0" />
                                )}

                                {isEditing ? (
                                    <input
                                        ref={editInputRef}
                                        type="text"
                                        value={editingCategoryName}
                                        onChange={(e) => setEditingCategoryName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenameCategory(category.id);
                                            if (e.key === 'Escape') setEditingCategoryId(null);
                                        }}
                                        onBlur={() => handleRenameCategory(category.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[11px] font-bold tracking-wider uppercase bg-[#1e1f22] text-[#dbdee1] rounded px-1.5 py-0.5 flex-1 outline-none border border-[#5865f2]/50"
                                    />
                                ) : (
                                    <span className="text-[11px] font-bold tracking-wider uppercase text-[#96989d] group-hover:text-[#dbdee1] flex-1">
                                        {category.name}
                                    </span>
                                )}

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedCategoryId(category.id);
                                        setShowCreateModal(true);
                                    }}
                                    className="h-4 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 text-[#96989d] hover:text-[#dbdee1] transition-opacity"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            {/* Channels (sortable) */}
                            {!isCollapsed && (
                                <div className="mt-0.5 space-y-px px-1">
                                    <SortableContext
                                        items={category.channels.map(ch => ch.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {category.channels.map((channel) => {
                                            const isActive = currentChannel?.id === channel.id;
                                            const channelParticipants = isActive ? participants : (channel.participants || []);

                                            return (
                                                <SortableChannelItem
                                                    key={channel.id}
                                                    channel={channel}
                                                    isActive={isActive}
                                                    channelParticipants={channelParticipants}
                                                    onJoin={handleJoinChannel}
                                                    onDelete={(id) => deleteChannel(id)}
                                                />
                                            );
                                        })}
                                    </SortableContext>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Drag overlay */}
                <DragOverlay>
                    {activeDragChannel ? <DragOverlayItem channel={activeDragChannel} /> : null}
                </DragOverlay>
            </DndContext>

            {/* Add new category section */}
            {showNewCategory ? (
                <div className="mt-3 px-2 flex gap-1.5">
                    <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateCategory();
                            if (e.key === 'Escape') { setShowNewCategory(false); setNewCategoryName(''); }
                        }}
                        placeholder="Название раздела..."
                        className="text-[11px] font-bold tracking-wider uppercase bg-[#1e1f22] text-[#dbdee1] rounded px-2 py-1 flex-1 outline-none border border-[#5865f2]/50 placeholder:normal-case placeholder:font-normal placeholder:tracking-normal"
                        autoFocus
                    />
                    <button
                        onClick={handleCreateCategory}
                        disabled={!newCategoryName.trim()}
                        className="text-xs text-[#5865f2] hover:text-[#7289da] disabled:opacity-30 font-medium px-1"
                    >
                        OK
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setShowNewCategory(true)}
                    className="flex items-center gap-1.5 px-3 py-2 mt-2 text-[11px] text-[#96989d] hover:text-[#dbdee1] transition-colors"
                >
                    <FolderPlus className="h-3.5 w-3.5" />
                    Добавить раздел
                </button>
            )}

            {/* Category Context Menu */}
            {categoryCtx && (
                <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setCategoryCtx(null)} />
                    <div
                        className="fixed z-[101] bg-[#111214] rounded-lg shadow-xl border border-[#3f4147] min-w-[180px] py-1"
                        style={{
                            left: Math.min(categoryCtx.x, window.innerWidth - 200),
                            top: Math.min(categoryCtx.y, window.innerHeight - 220),
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(categoryCtx.id);
                                setEditingCategoryName(categoryCtx.name);
                                setCategoryCtx(null);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors"
                        >
                            <Pencil className="h-4 w-4 text-[#96989d]" />
                            Переименовать
                        </button>
                        {(() => {
                            const idx = categories.findIndex(c => c.id === categoryCtx.id);
                            return (
                                <>
                                    {idx > 0 && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleMoveCategoryUp(idx); }}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors"
                                        >
                                            <ArrowUp className="h-4 w-4 text-[#96989d]" />
                                            Переместить вверх
                                        </button>
                                    )}
                                    {idx < categories.length - 1 && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleMoveCategoryDown(idx); }}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors"
                                        >
                                            <ArrowDown className="h-4 w-4 text-[#96989d]" />
                                            Переместить вниз
                                        </button>
                                    )}
                                </>
                            );
                        })()}
                        <div className="mx-2 my-1 h-px bg-[#3f4147]" />
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCategory(categoryCtx.id); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white transition-colors"
                        >
                            <Trash2 className="h-4 w-4" />
                            Удалить раздел
                        </button>
                    </div>
                </>
            )}

            {/* Create Channel Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-[#313338] rounded-lg p-4 w-72 border border-[#3f4147]" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-[#f2f3f5] font-semibold mb-4">Создать голосовой канал</h3>
                        <div>
                            <label className="text-xs text-[#96989d] block mb-1.5 uppercase font-bold tracking-wider">
                                Название канала
                            </label>
                            <input
                                type="text"
                                value={newChannelName}
                                onChange={(e) => setNewChannelName(e.target.value)}
                                placeholder="Новый голосовой канал"
                                className="w-full bg-[#1e1f22] text-[#dbdee1] rounded-sm p-2 border-none text-sm outline-none focus:ring-2 focus:ring-[#5865f2]/50"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChannel(); }}
                            />
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Button
                                onClick={() => setShowCreateModal(false)}
                                variant="secondary"
                                className="flex-1 bg-transparent hover:underline text-[#96989d] hover:text-[#dbdee1] hover:bg-transparent"
                            >
                                Отмена
                            </Button>
                            <Button
                                onClick={handleCreateChannel}
                                disabled={!newChannelName.trim()}
                                className="flex-1 bg-[#5865f2] hover:bg-[#4752c4] text-white"
                            >
                                Создать
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
