
import { useState, useEffect } from 'react';
import { useMediaUrl } from '@/lib/hooks/useMediaUrl';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    fileId?: string;
    src?: string;
    thumbnailUrl?: string;
    fallbackText?: string;
}

export function CachedImage({
    fileId,
    src,
    thumbnailUrl,
    fallbackText,
    className,
    alt = 'Image',
    ...props
}: CachedImageProps) {
    // Хук загружает полный контент
    const { mediaUrl, isLoading, error } = useMediaUrl(src, fileId, 'image');

    // Состояние отображения thumbnail (пока грузится полный)
    const [showThumbnail, setShowThumbnail] = useState(true);

    useEffect(() => {
        if (mediaUrl) {
            const img = new Image();
            img.src = mediaUrl;
            img.onload = () => setShowThumbnail(false);
        }
    }, [mediaUrl]);

    if (error) {
        return (
            <div className={cn('flex items-center justify-center bg-muted text-muted-foreground text-xs', className)}>
                {fallbackText || 'Error'}
            </div>
        );
    }

    return (
        <div className={cn('relative overflow-hidden bg-muted', className)}>
            {/* Skeleton / Loading */}
            {isLoading && !thumbnailUrl && (
                <Skeleton className="absolute inset-0 h-full w-full" />
            )}

            {/* Thumbnail (Blur effect) */}
            {thumbnailUrl && showThumbnail && (
                <img
                    src={thumbnailUrl}
                    alt={alt}
                    className="absolute inset-0 h-full w-full object-cover blur-sm transition-opacity duration-300"
                />
            )}

            {/* Full Image */}
            {mediaUrl && (
                <img
                    src={mediaUrl}
                    alt={alt}
                    className={cn(
                        'h-full w-full object-cover transition-opacity duration-300',
                        showThumbnail ? 'opacity-0' : 'opacity-100'
                    )}
                    {...props}
                />
            )}
        </div>
    );
}
