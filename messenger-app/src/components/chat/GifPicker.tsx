import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Loader2, Star, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnimatedMount, ANIM_MODAL, ANIM_BACKDROP } from '@/lib/hooks/useAnimatedMount';

interface GifResult {
    id: string;
    url: string;
    preview: string;
    width: number;
    height: number;
}

interface GifPickerProps {
    open: boolean;
    onClose: () => void;
    onSelectGif: (url: string) => void;
}

const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
const TENOR_BASE = 'https://tenor.googleapis.com/v2';
const FAVORITES_KEY = 'rumker-gif-favorites';

// --- Favorites helpers ---
function getFavorites(): GifResult[] {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveFavorites(favs: GifResult[]) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

export function addGifToFavorites(url: string, preview?: string) {
    const favs = getFavorites();
    if (favs.some(f => f.url === url)) return;
    favs.unshift({
        id: `fav-${Date.now()}`,
        url,
        preview: preview || url,
        width: 200,
        height: 200,
    });
    saveFavorites(favs.slice(0, 100)); // max 100 favorites
}

export function removeGifFromFavorites(url: string) {
    const favs = getFavorites().filter(f => f.url !== url);
    saveFavorites(favs);
}

export function isGifFavorited(url: string): boolean {
    return getFavorites().some(f => f.url === url);
}

type TabType = 'trending' | 'favorites';

export function GifPicker({ open, onClose, onSelectGif }: GifPickerProps) {
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState<GifResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<{ name: string; image: string }[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>('trending');
    const [favorites, setFavorites] = useState<GifResult[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load on open
    useEffect(() => {
        if (!open) return;
        setQuery('');
        setGifs([]);
        setActiveTab('trending');
        setFavorites(getFavorites());
        loadTrending();
        loadCategories();
        setTimeout(() => inputRef.current?.focus(), 100);
    }, [open]);

    const loadTrending = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `${TENOR_BASE}/featured?key=${TENOR_API_KEY}&client_key=rumker&limit=30&media_filter=gif,tinygif`
            );
            const data = await res.json();
            setGifs(parseResults(data.results));
        } catch {
            setGifs([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCategories = useCallback(async () => {
        try {
            const res = await fetch(
                `${TENOR_BASE}/categories?key=${TENOR_API_KEY}&client_key=rumker`
            );
            const data = await res.json();
            setCategories(
                (data.tags || []).slice(0, 8).map((t: { searchterm: string; image: string }) => ({
                    name: t.searchterm,
                    image: t.image,
                }))
            );
        } catch {
            setCategories([]);
        }
    }, []);

    const searchGifs = useCallback(async (q: string) => {
        if (!q.trim()) {
            loadTrending();
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(
                `${TENOR_BASE}/search?key=${TENOR_API_KEY}&client_key=rumker&q=${encodeURIComponent(q)}&limit=30&media_filter=gif,tinygif`
            );
            const data = await res.json();
            setGifs(parseResults(data.results));
        } catch {
            setGifs([]);
        } finally {
            setLoading(false);
        }
    }, [loadTrending]);

    const handleQueryChange = useCallback((value: string) => {
        setQuery(value);
        setActiveTab('trending');
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchGifs(value), 400);
    }, [searchGifs]);

    const handleCategoryClick = useCallback((name: string) => {
        setQuery(name);
        setActiveTab('trending');
        searchGifs(name);
    }, [searchGifs]);

    const toggleFavorite = useCallback((gif: GifResult, e: React.MouseEvent) => {
        e.stopPropagation();
        const isFav = favorites.some(f => f.url === gif.url);
        if (isFav) {
            removeGifFromFavorites(gif.url);
        } else {
            addGifToFavorites(gif.url, gif.preview);
        }
        setFavorites(getFavorites());
    }, [favorites]);

    const handleTabChange = useCallback((tab: TabType) => {
        setActiveTab(tab);
        if (tab === 'favorites') {
            setFavorites(getFavorites());
        }
    }, []);

    const { mounted: backdropMounted, className: backdropClass } = useAnimatedMount(open, ANIM_BACKDROP);
    const { mounted: modalMounted, className: modalClass } = useAnimatedMount(open, ANIM_MODAL);

    if (!backdropMounted && !modalMounted) return null;

    const displayGifs = activeTab === 'favorites' ? favorites : gifs;

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${backdropClass}`} onClick={onClose}>
            <div
                className={`bg-card rounded-2xl mx-4 max-w-lg w-full shadow-2xl ${modalClass} overflow-hidden flex flex-col`}
                style={{ maxHeight: '80vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-3 border-b border-border flex items-center gap-2">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            placeholder="Поиск GIF..."
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-muted text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <button
                        onClick={onClose}
                        className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground shrink-0"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Tabs: Trending / Favorites */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => handleTabChange('trending')}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors relative",
                            activeTab === 'trending' ? "text-primary" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <TrendingUp className="h-3.5 w-3.5" />
                        {query ? 'Результаты' : 'Популярные'}
                        {activeTab === 'trending' && (
                            <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => handleTabChange('favorites')}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors relative",
                            activeTab === 'favorites' ? "text-primary" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Star className="h-3.5 w-3.5" />
                        Избранное
                        {favorites.length > 0 && (
                            <span className="text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{favorites.length}</span>
                        )}
                        {activeTab === 'favorites' && (
                            <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
                        )}
                    </button>
                </div>

                {/* Categories (when no search query and on trending tab) */}
                {activeTab === 'trending' && !query && categories.length > 0 && (
                    <div className="flex gap-2 px-3 py-2 overflow-x-auto scrollbar-thin border-b border-border/50">
                        {categories.map((cat) => (
                            <button
                                key={cat.name}
                                onClick={() => handleCategoryClick(cat.name)}
                                className="shrink-0 flex flex-col items-center gap-1 px-2 py-1 rounded-xl hover:bg-muted transition-colors"
                            >
                                <img
                                    src={cat.image}
                                    alt={cat.name}
                                    className="h-12 w-12 rounded-lg object-cover"
                                    loading="lazy"
                                />
                                <span className="text-[10px] text-muted-foreground truncate max-w-[56px]">
                                    {cat.name}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {/* GIF Grid */}
                <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
                    {activeTab === 'trending' && loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : displayGifs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                            {activeTab === 'favorites' ? (
                                <>
                                    <Star className="h-8 w-8 text-muted-foreground/40" />
                                    <span>Нет избранных GIF</span>
                                    <span className="text-xs">ПКМ на GIF в чате, чтобы добавить</span>
                                </>
                            ) : (
                                query ? 'Ничего не найдено' : 'Нет GIF'
                            )}
                        </div>
                    ) : (
                        <div className="columns-2 sm:columns-3 gap-1.5">
                            {displayGifs.map((gif) => {
                                const isFav = favorites.some(f => f.url === gif.url);
                                return (
                                    <div key={gif.id} className="relative mb-1.5 group">
                                        <button
                                            onClick={() => {
                                                onSelectGif(gif.url);
                                                onClose();
                                            }}
                                            className="block w-full rounded-lg overflow-hidden hover:opacity-80 active:scale-[0.97] transition-all cursor-pointer"
                                        >
                                            <img
                                                src={gif.preview}
                                                alt="GIF"
                                                className="w-full h-auto block"
                                                loading="lazy"
                                                style={{
                                                    aspectRatio: `${gif.width} / ${gif.height}`,
                                                    backgroundColor: 'var(--muted)',
                                                }}
                                            />
                                        </button>
                                        {/* Favorite star */}
                                        <button
                                            onClick={(e) => toggleFavorite(gif, e)}
                                            className={cn(
                                                "absolute top-1 right-1 h-7 w-7 rounded-full flex items-center justify-center transition-all",
                                                isFav
                                                    ? "bg-yellow-500/90 text-white"
                                                    : "bg-black/40 text-white/80 opacity-0 group-hover:opacity-100"
                                            )}
                                        >
                                            <Star className={cn("h-3.5 w-3.5", isFav && "fill-current")} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Tenor attribution */}
                <div className="px-3 py-1.5 border-t border-border/50 text-center">
                    <span className="text-[10px] text-muted-foreground">Powered by Tenor</span>
                </div>
            </div>
        </div>
    );
}

function parseResults(results: unknown[]): GifResult[] {
    if (!Array.isArray(results)) return [];
    return results.map((item) => {
        const r = item as Record<string, unknown>;
        const media = r.media_formats as Record<string, { url: string; dims: number[] }> | undefined;
        const gif = media?.gif;
        const tinygif = media?.tinygif;
        return {
            id: r.id as string,
            url: gif?.url || tinygif?.url || '',
            preview: tinygif?.url || gif?.url || '',
            width: tinygif?.dims?.[0] || gif?.dims?.[0] || 200,
            height: tinygif?.dims?.[1] || gif?.dims?.[1] || 200,
        };
    }).filter(g => g.url);
}
