import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { mediaCache } from '@/lib/cache/mediaCacheManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Trash2, Database, ImageIcon, Video, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { formatBytes } from '@/lib/utils';

interface CacheStats {
    totalSize: number;
    imageCount: number;
    videoCount: number;
    voiceCount: number;
    fileCount: number;
}

export function CacheSettings() {
    const cache = useSettingsStore((s) => s.cache);
    const updateCache = useSettingsStore((s) => s.updateCache);
    const [stats, setStats] = useState<CacheStats | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Load cache stats on mount
    useEffect(() => {
        loadCacheStats();
    }, []);

    const loadCacheStats = async () => {
        try {
            const cacheStats = await mediaCache.getCacheStats();
            setStats(cacheStats);
        } catch (error) {
            console.error('Failed to load cache stats:', error);
        }
    };

    const handleClearCache = async () => {
        setIsLoading(true);
        try {
            await mediaCache.clearCache();
            await loadCacheStats();
            toast.success('Cache cleared successfully');
        } catch {
            toast.error('Failed to clear cache');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateMaxSize = (value: number[]) => {
        updateCache({ maxSize: value[0] });
    };

    const usedSpace = stats?.totalSize || 0;
    const maxSizeBytes = cache.maxSize * 1024 * 1024; // Convert MB to bytes
    const usagePercent = maxSizeBytes > 0 ? (usedSpace / maxSizeBytes) * 100 : 0;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Cache Settings
                </CardTitle>
                <CardDescription>
                    Manage local media cache storage
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Cache Usage */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Storage Usage</Label>
                        <span className="text-sm text-muted-foreground">
                            {formatBytes(usedSpace)} / {cache.maxSize} MB
                        </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-tg-primary transition-all"
                            style={{ width: `${Math.min(usagePercent, 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {usagePercent.toFixed(1)}% used
                    </p>
                </div>

                {/* Cache Stats */}
                {stats && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                            <ImageIcon className="h-4 w-4 text-blue-500" />
                            <div>
                                <p className="text-sm font-medium">{stats.imageCount}</p>
                                <p className="text-xs text-muted-foreground">Images</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                            <Video className="h-4 w-4 text-purple-500" />
                            <div>
                                <p className="text-sm font-medium">{stats.videoCount}</p>
                                <p className="text-xs text-muted-foreground">Videos</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                            <FileText className="h-4 w-4 text-green-500" />
                            <div>
                                <p className="text-sm font-medium">{stats.voiceCount}</p>
                                <p className="text-xs text-muted-foreground">Voice</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                            <Database className="h-4 w-4 text-orange-500" />
                            <div>
                                <p className="text-sm font-medium">{stats.fileCount}</p>
                                <p className="text-xs text-muted-foreground">Files</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Max Cache Size */}
                <div className="space-y-3">
                    <Label>Max Cache Size</Label>
                    <Slider
                        value={[cache.maxSize]}
                        onValueChange={handleUpdateMaxSize}
                        min={100}
                        max={5000}
                        step={100}
                    />
                    <p className="text-xs text-muted-foreground">
                        Maximum storage: {cache.maxSize} MB (100 MB - 5 GB)
                    </p>
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="cache-images">Cache Images</Label>
                            <p className="text-xs text-muted-foreground">
                                Store images locally for faster loading
                            </p>
                        </div>
                        <Switch
                            id="cache-images"
                            checked={cache.cacheImages}
                            onCheckedChange={(checked) =>
                                updateCache({ cacheImages: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="cache-videos">Cache Videos</Label>
                            <p className="text-xs text-muted-foreground">
                                Store videos locally (uses more space)
                            </p>
                        </div>
                        <Switch
                            id="cache-videos"
                            checked={cache.cacheVideos}
                            onCheckedChange={(checked) =>
                                updateCache({ cacheVideos: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="auto-clean">Auto-clean on exit</Label>
                            <p className="text-xs text-muted-foreground">
                                Clear cache when closing the app
                            </p>
                        </div>
                        <Switch
                            id="auto-clean"
                            checked={cache.clearCacheOnExit}
                            onCheckedChange={(checked) =>
                                updateCache({ clearCacheOnExit: checked })
                            }
                        />
                    </div>
                </div>

                {/* Clear Cache Button */}
                <Button
                    variant="destructive"
                    onClick={handleClearCache}
                    disabled={isLoading || usedSpace === 0}
                    className="w-full"
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {isLoading ? 'Clearing...' : 'Clear All Cache'}
                </Button>
            </CardContent>
        </Card>
    );
}
