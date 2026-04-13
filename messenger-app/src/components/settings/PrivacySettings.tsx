import { useSettingsStore } from '@/stores/settingsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Shield } from 'lucide-react';

type Visibility = 'everyone' | 'contacts' | 'nobody';

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'contacts', label: 'My Contacts' },
    { value: 'nobody', label: 'Nobody' },
];

export function PrivacySettings() {
    const privacy = useSettingsStore((s) => s.privacy);
    const updatePrivacy = useSettingsStore((s) => s.updatePrivacy);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Privacy & Security
                </CardTitle>
                <CardDescription>
                    Control who can see your personal information
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label>Last Seen</Label>
                    <p className="text-xs text-muted-foreground">Who can see when you were last online</p>
                    <Select
                        value={privacy.lastSeen}
                        onValueChange={(value: Visibility) => updatePrivacy({ lastSeen: value })}
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
                    <Label>Profile Photo</Label>
                    <p className="text-xs text-muted-foreground">Who can see your profile photo</p>
                    <Select
                        value={privacy.profilePhoto}
                        onValueChange={(value: Visibility) => updatePrivacy({ profilePhoto: value })}
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
                    <Label>Phone Number</Label>
                    <p className="text-xs text-muted-foreground">Who can see your phone number</p>
                    <Select
                        value={privacy.phoneNumber}
                        onValueChange={(value: Visibility) => updatePrivacy({ phoneNumber: value })}
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
            </CardContent>
        </Card>
    );
}
