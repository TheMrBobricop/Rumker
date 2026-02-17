import { useSettingsStore } from '@/stores/settingsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell } from 'lucide-react';

export function NotificationSettings() {
    const { notifications, updateNotifications } = useSettingsStore();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notifications
                </CardTitle>
                <CardDescription>
                    Configure how you receive notifications
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Enable Notifications</Label>
                        <p className="text-xs text-muted-foreground">Receive notifications for new messages</p>
                    </div>
                    <Switch
                        checked={notifications.enabled}
                        onCheckedChange={(enabled) => updateNotifications({ enabled })}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Sound</Label>
                        <p className="text-xs text-muted-foreground">Play sound for incoming messages</p>
                    </div>
                    <Switch
                        checked={notifications.sound}
                        onCheckedChange={(sound) => updateNotifications({ sound })}
                        disabled={!notifications.enabled}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Message Preview</Label>
                        <p className="text-xs text-muted-foreground">Show message content in notifications</p>
                    </div>
                    <Switch
                        checked={notifications.preview}
                        onCheckedChange={(preview) => updateNotifications({ preview })}
                        disabled={!notifications.enabled}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Vibration</Label>
                        <p className="text-xs text-muted-foreground">Vibrate on incoming messages</p>
                    </div>
                    <Switch
                        checked={notifications.vibrate}
                        onCheckedChange={(vibrate) => updateNotifications({ vibrate })}
                        disabled={!notifications.enabled}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
