// ========================================
// Media Cache Manager (IndexedDB)
// ========================================

interface CachedItem {
    id: string;
    blob: Blob;
    type: 'image' | 'video' | 'voice' | 'file';
    size: number;
    lastAccessed: number;
    createdAt: number;
}

const DB_NAME = 'messenger-media-cache';
const DB_VERSION = 1;
const STORE_NAME = 'media';

export class MediaCacheManager {
    private db: IDBDatabase | null = null;

    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
        });
    }

    private initPromise: Promise<void> | null = null;

    async ensureInit(): Promise<void> {
        if (this.db) return;
        if (!this.initPromise) {
            this.initPromise = this.init();
        }
        return this.initPromise;
    }

    private async getDB(): Promise<IDBDatabase> {
        if (!this.db) {
            await this.ensureInit();
        }
        if (!this.db) {
            throw new Error('Failed to initialize database');
        }
        return this.db;
    }

    async cacheMedia(
        fileId: string,
        blob: Blob,
        type: 'image' | 'video' | 'voice' | 'file'
    ): Promise<void> {
        const db = await this.getDB();
        const item: CachedItem = {
            id: fileId,
            blob,
            type,
            size: blob.size,
            lastAccessed: Date.now(),
            createdAt: Date.now(),
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(item);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getMedia(fileId: string): Promise<Blob | null> {
        const db = await this.getDB();


        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(fileId);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const item = request.result as CachedItem | undefined;
                if (item) {
                    // Update last accessed time
                    item.lastAccessed = Date.now();
                    store.put(item);
                    resolve(item.blob);
                } else {
                    resolve(null);
                }
            };
        });
    }

    async clearCache(): Promise<void> {
        const db = await this.getDB();


        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getCacheSize(): Promise<number> {
        const db = await this.getDB();


        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const items = request.result as CachedItem[];
                const totalSize = items.reduce((sum, item) => sum + item.size, 0);
                resolve(totalSize);
            };
        });
    }

    async getCacheStats(): Promise<{
        totalSize: number;
        imageCount: number;
        videoCount: number;
        voiceCount: number;
        fileCount: number;
    }> {
        const db = await this.getDB();


        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const items = request.result as CachedItem[];
                resolve({
                    totalSize: items.reduce((sum, item) => sum + item.size, 0),
                    imageCount: items.filter((i) => i.type === 'image').length,
                    videoCount: items.filter((i) => i.type === 'video').length,
                    voiceCount: items.filter((i) => i.type === 'voice').length,
                    fileCount: items.filter((i) => i.type === 'file').length,
                });
            };
        });
    }

    async removeLRU(bytesToFree: number): Promise<void> {
        const db = await this.getDB();


        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('lastAccessed');
            const request = index.openCursor();

            let freedBytes = 0;

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor && freedBytes < bytesToFree) {
                    const item = cursor.value as CachedItem;
                    freedBytes += item.size;
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
        });
    }

    async removeExpired(expirationDays: number): Promise<void> {
        const db = await this.getDB();

        const expirationTime = Date.now() - expirationDays * 24 * 60 * 60 * 1000;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('createdAt');
            const range = IDBKeyRange.upperBound(expirationTime);
            const request = index.openCursor(range);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
        });
    }

    async deleteMedia(fileId: string): Promise<void> {
        const db = await this.getDB();


        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(fileId);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }
}

// Singleton instance
export const mediaCache = new MediaCacheManager();
