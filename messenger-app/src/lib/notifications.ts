import { useSettingsStore } from '@/stores/settingsStore';
import { soundEngine } from '@/lib/sounds/soundEngine';

export function requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

export function showBrowserNotification(title: string, body: string): void {
    if (!document.hidden) return;
    const { notifications } = useSettingsStore.getState();
    if (!notifications.enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const options: NotificationOptions = { icon: '/favicon.ico' };
    if (notifications.preview) {
        options.body = body;
    }
    new Notification(title, options);
}

export function playNotificationSound(): void {
    const { notifications } = useSettingsStore.getState();
    if (!notifications.sound) return;
    soundEngine.play('notification');
}

export function playMessageSendSound(): void {
    soundEngine.play('messageSend');
}

export function playMessageReceiveSound(): void {
    const { notifications } = useSettingsStore.getState();
    if (!notifications.sound) return;
    soundEngine.play('messageReceive');
}

export function playVoiceJoinSound(): void {
    soundEngine.play('voiceJoin');
}

export function playVoiceLeaveSound(): void {
    soundEngine.play('voiceLeave');
}

export function playCallRingSound(): void {
    soundEngine.play('callRing');
}

export function playCallConnectSound(): void {
    soundEngine.play('callConnect');
}

export function playCallEndSound(): void {
    soundEngine.play('callEnd');
}

/** Short busy tone пїЅ three descending beeps to indicate user is busy */
export function playBusySound(): void {
    soundEngine.play('callEnd');
}

export function updateDocumentTitle(unreadCount: number): void {
    document.title = unreadCount > 0 ? `(${unreadCount}) Rumker` : 'Rumker';
}


