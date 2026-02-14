
import { useState, useEffect } from 'react';
import { mediaCache } from '@/lib/cache/mediaCacheManager';

export function useMediaUrl(url: string | undefined, fileId: string | undefined, type: 'image' | 'video' | 'voice' | 'file') {
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let active = true;
        const loadMedia = async () => {
            // Если нет URL или ID, ничего не делаем
            if (!url || !fileId) {
                setMediaUrl(null);
                return;
            }

            // Если URL уже blob: или data:, используем как есть
            if (url.startsWith('blob:') || url.startsWith('data:')) {
                setMediaUrl(url);
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                // 1. Проверяем кэш
                const cachedBlob = await mediaCache.getMedia(fileId);
                if (cachedBlob && active) {
                    const objectUrl = URL.createObjectURL(cachedBlob);
                    setMediaUrl(objectUrl);
                    setIsLoading(false);
                    return;
                }

                // 2. Если нет в кэше, грузим
                // В реальном приложении здесь может быть запрос к API с авторизацией
                // Но для Telegram файлов (если они публичные ссылки) fetch сработает.
                // Если это закрытые файлы, нужно использовать apiClient.get(url, { responseType: 'blob' })

                const response = await fetch(url);
                if (!response.ok) throw new Error('Failed to load media');

                const blob = await response.blob();

                // 3. Сохраняем в кэш (в фоне)
                mediaCache.cacheMedia(fileId, blob, type).catch(console.error);

                if (active) {
                    const objectUrl = URL.createObjectURL(blob);
                    setMediaUrl(objectUrl);
                }
            } catch (err) {
                if (active) {
                    console.error('Error loading media:', err);
                    setError(err instanceof Error ? err : new Error('Unknown error'));
                }
            } finally {
                if (active) setIsLoading(false);
            }
        };

        loadMedia();

        return () => {
            active = false;
            // Мы не можем отозвать URL здесь, так как он может использоваться в кэше/других местах
            // Но по-хорошему надо manage-ить revokeObjectURL глобально для memory leaks
        };
    }, [url, fileId, type]);

    return { mediaUrl, isLoading, error };
}
