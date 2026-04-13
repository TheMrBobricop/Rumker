import { useState } from 'react';
import { X, Shield } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { updateMemberRole } from '@/lib/api/chats';
import { toast } from 'sonner';
import type { AdminRights } from '@/types';
import { DEFAULT_ADMIN_RIGHTS } from '@/types';

interface AdminRightsEditorModalProps {
    chatId: string;
    target: {
        userId: string;
        username: string;
        firstName?: string;
        avatar?: string;
        role: string;
        title?: string;
        adminRights?: AdminRights;
    };
    onClose: () => void;
    onSaved: () => void;
}

const RIGHT_LABELS: Record<keyof AdminRights, string> = {
    can_change_info: 'Изменение информации о группе',
    can_delete_messages: 'Удаление сообщений',
    can_ban_users: 'Блокировка пользователей',
    can_invite_users: 'Добавление участников',
    can_pin_messages: 'Закрепление сообщений',
    can_promote_members: 'Назначение администраторов',
    can_manage_voice_channels: 'Управление голосовыми каналами',
};

export function AdminRightsEditorModal({ chatId, target, onClose, onSaved }: AdminRightsEditorModalProps) {
    const [title, setTitle] = useState(target.title || '');
    const [rights, setRights] = useState<AdminRights>(target.adminRights || { ...DEFAULT_ADMIN_RIGHTS });
    const [saving, setSaving] = useState(false);

    const toggleRight = (key: keyof AdminRights) => {
        setRights(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateMemberRole(chatId, target.userId, 'admin', title || undefined, rights);
            toast.success(target.role === 'admin' ? 'Права обновлены' : 'Администратор назначен');
            onSaved();
        } catch (err: any) {
            toast.error(err?.message || 'Не удалось сохранить');
        } finally {
            setSaving(false);
        }
    };

    const handleDemote = async () => {
        setSaving(true);
        try {
            await updateMemberRole(chatId, target.userId, 'member');
            toast.success('Пользователь понижен до участника');
            onSaved();
        } catch (err: any) {
            toast.error(err?.message || 'Не удалось понизить');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="bg-card rounded-xl w-full max-w-md mx-4 shadow-xl animate-fade-scale-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={target.avatar} />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                {(target.firstName || target.username || '?').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-sm font-medium">{target.firstName || target.username}</div>
                            <div className="text-xs text-muted-foreground">@{target.username}</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted/60 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Title input */}
                <div className="px-4 pt-4 pb-2">
                    <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Пользовательский титул</label>
                    <input
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="напр. модератор"
                        maxLength={64}
                        className="w-full mt-1.5 px-3 py-2 bg-muted/50 rounded-lg text-sm border border-border focus:border-tg-primary focus:outline-none transition-colors"
                    />
                </div>

                {/* Rights checkboxes */}
                <div className="px-4 pt-3 pb-1">
                    <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Права администратора</label>
                </div>
                <div className="px-2 pb-3">
                    {(Object.keys(RIGHT_LABELS) as (keyof AdminRights)[]).map(key => (
                        <label key={key} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors">
                            <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                                rights[key]
                                    ? 'bg-tg-primary border-tg-primary'
                                    : 'border-muted-foreground/40'
                            }`}
                                onClick={(e) => { e.preventDefault(); toggleRight(key); }}>
                                {rights[key] && (
                                    <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M2 6l3 3 5-5" />
                                    </svg>
                                )}
                            </div>
                            <span className="text-sm flex-1">{RIGHT_LABELS[key]}</span>
                        </label>
                    ))}
                </div>

                {/* Action buttons */}
                <div className="px-4 pb-4 flex flex-col gap-2">
                    <button
                        disabled={saving}
                        onClick={handleSave}
                        className="w-full py-2.5 rounded-lg bg-tg-primary text-white text-sm font-medium hover:bg-tg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <Shield className="h-4 w-4" />
                        {target.role === 'admin' ? 'Сохранить изменения' : 'Назначить администратором'}
                    </button>
                    {target.role === 'admin' && (
                        <button
                            disabled={saving}
                            onClick={handleDemote}
                            className="w-full py-2.5 rounded-lg text-amber-600 text-sm font-medium hover:bg-muted/60 disabled:opacity-50 transition-colors"
                        >
                            Понизить до участника
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
