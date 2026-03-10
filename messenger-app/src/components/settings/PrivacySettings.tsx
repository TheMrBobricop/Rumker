import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Shield } from 'lucide-react';
import { api } from '@/lib/api/client';

type Visibility = 'everyone' | 'contacts' | 'nobody';

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
    { value: 'everyone', label: 'Все' },
    { value: 'contacts', label: 'Мои контакты' },
    { value: 'nobody', label: 'Никто' },
];

export function PrivacySettings() {
    const privacy = useSettingsStore((s) => s.privacy);
    const updatePrivacy = useSettingsStore((s) => s.updatePrivacy);

    // Load privacy settings from backend on mount
    useEffect(() => {
        api.get<Record<string, unknown>>('/users/me/privacy').then((data) => {
            updatePrivacy(data as any);
        }).catch(() => { /* use local defaults */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleUpdate = (settings: Partial<typeof privacy>) => {
        const updated = { ...privacy, ...settings };
        updatePrivacy(settings);
        // Sync to backend
        api.put('/users/me/privacy', updated).catch(() => { /* non-critical */ });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Конфиденциальность
                </CardTitle>
                <CardDescription>
                    Управление видимостью вашей информации
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label>Последний визит</Label>
                    <p className="text-xs text-muted-foreground">Кто может видеть, когда вы были в сети</p>
                    <Select
                        value={privacy.lastSeen}
                        onValueChange={(value: Visibility) => handleUpdate({ lastSeen: value })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {VISIBILITY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>Фото профиля</Label>
                    <p className="text-xs text-muted-foreground">Кто может видеть ваше фото профиля</p>
                    <Select
                        value={privacy.profilePhoto}
                        onValueChange={(value: Visibility) => handleUpdate({ profilePhoto: value })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {VISIBILITY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>Номер телефона</Label>
                    <p className="text-xs text-muted-foreground">Кто может видеть ваш номер телефона</p>
                    <Select
                        value={privacy.phoneNumber}
                        onValueChange={(value: Visibility) => handleUpdate({ phoneNumber: value })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {VISIBILITY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center justify-between py-2">
                    <div className="space-y-0.5">
                        <Label>Отчёты о прочтении</Label>
                        <p className="text-xs text-muted-foreground">
                            Отправлять отчёты о прочтении. Если отключено, вы тоже не увидите, прочитали ли ваши сообщения
                        </p>
                    </div>
                    <Switch
                        checked={privacy.readReceipts}
                        onCheckedChange={(checked) => handleUpdate({ readReceipts: checked })}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
