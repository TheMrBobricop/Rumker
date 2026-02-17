
import { useState, useEffect } from 'react';
import { mediaCache } from '@/lib/cache/mediaCacheManager';
import { useSettingsStore } from '@/stores/settingsStore';

export function useMediaUrl(url: string | undefined, fileId: string | undefined, type: 'image' | 'video' | 'voice' | 'file') {
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const cacheSettings = useSettingsStore((s) => s.cache);

    useEffect(() => {
        let active = true;
        const loadMedia = async () => {
            if (!url || !fileId) {
                setMediaUrl(null);
                return;
            }

            if (url.startsWith('blob:') || url.startsWith('data:')) {
                setMediaUrl(url);
                return;
            }

            // Check if caching is enabled for this media type
            const cachingEnabled =
                (type === 'image' && cacheSettings.cacheImages) ||
                (type === 'video' && cacheSettings.cacheVideos) ||
                (type !== 'image' && type !== 'video');

            setIsLoading(true);
            setError(null);

            try {
                // 1. Check cache (only if caching enabled for this type)
                if (cachingEnabled) {
                    const cachedBlob = await mediaCache.getMedia(fileId);
                    if (cachedBlob && active) {
                        const objectUrl = URL.createObjectURL(cachedBlob);
                        setMediaUrl(objectUrl);
                        setIsLoading(false);
                        return;
                    }
                }

                // 2. Fetch from network
                const response = await fetch(url);
                if (!response.ok) throw new Error('Failed to load media');

                const blob = await response.blob();

                // 3. Cache in background (only if enabled for this type)
                if (cachingEnabled) {
                    // Check quota before caching — evict LRU if needed
                    const maxBytes = cacheSettings.maxSize * 1024 * 1024;
                    const currentSize = await mediaCache.getCacheSize();
                    if (currentSize + blob.size > maxBytes) {
                        const bytesToFree = currentSize + blob.size - maxBytes;
                        await mediaCache.removeLRU(bytesToFree);
                    }
                    mediaCache.cacheMedia(fileId, blob, type).catch(console.error);
                }

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
        };
    }, [url, fileId, type, cacheSettings.cacheImages, cacheSettings.cacheVideos, cacheSettings.maxSize]);

    return { mediaUrl, isLoading, error };
}
