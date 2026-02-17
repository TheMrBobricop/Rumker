
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CachedImage } from './CachedImage';

export interface MediaItem {
    id: string;
    src: string;
    type: 'image' | 'video';
}

interface MediaViewerProps {
    isOpen: boolean;
    onClose: () => void;
    fileId?: string;
    src?: string;
    type: 'image' | 'video';
    mediaItems?: MediaItem[];
    currentIndex?: number;
}

export function MediaViewer({
    isOpen,
    onClose,
    fileId,
    src,
    type,
    mediaItems,
    currentIndex: initialIndex,
}: MediaViewerProps) {
    const [scale, setScale] = useState(1);
    const [activeIndex, setActiveIndex] = useState(initialIndex ?? 0);
    const [slideDirection, setSlideDirection] = useState<'none' | 'left' | 'right'>('none');
    const [isAnimating, setIsAnimating] = useState(false);
    const [wasOpen, setWasOpen] = useState(false);

    // Sync on open/close transitions using state (no refs during render, no setState in effects)
    if (isOpen && !wasOpen) {
        setWasOpen(true);
        setScale(1);
        if (initialIndex !== undefined) {
            setActiveIndex(initialIndex);
            setSlideDirection('none');
        }
    } else if (!isOpen && wasOpen) {
        setWasOpen(false);
    }

    const isGallery = mediaItems && mediaItems.length > 1;
    const currentItem = isGallery ? mediaItems[activeIndex] : null;
    const displaySrc = currentItem?.src ?? src;
    const displayType = currentItem?.type ?? type;
    const displayId = currentItem?.id ?? fileId;

    const navigate = useCallback((direction: 'left' | 'right') => {
        if (!mediaItems || mediaItems.length <= 1 || isAnimating) return;
        const nextIndex = direction === 'right'
            ? activeIndex + 1
            : activeIndex - 1;

        if (nextIndex < 0 || nextIndex >= mediaItems.length) return;

        setIsAnimating(true);
        setSlideDirection(direction);
        setScale(1);

        setTimeout(() => {
            setActiveIndex(nextIndex);
            setSlideDirection('none');
            setIsAnimating(false);
        }, 250);
    }, [mediaItems, isAnimating, activeIndex]);

    const goNext = useCallback(() => navigate('right'), [navigate]);
    const goPrev = useCallback(() => navigate('left'), [navigate]);

    useEffect(() => {
        if (!isOpen) {
            document.body.style.overflow = '';
            return;
        }

        document.body.style.overflow = 'hidden';

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowLeft') goPrev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose, goNext, goPrev]);

    if (!isOpen) return null;

    const handleZoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale((prev) => Math.min(prev + 0.5, 3));
    };

    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale((prev) => Math.max(prev - 0.5, 1));
    };

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const url = displaySrc;
        if (!url) return;

        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            const ext = displayType === 'image' ? 'jpg' : 'mp4';
            link.download = `media-${displayId || 'file'}.${ext}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch {
            window.open(url, '_blank');
        }
    };

    const canGoPrev = isGallery && activeIndex > 0;
    const canGoNext = isGallery && activeIndex < mediaItems.length - 1;

    const slideClass = slideDirection === 'left'
        ? 'animate-slide-out-right'
        : slideDirection === 'right'
            ? 'animate-slide-out-left'
            : 'animate-slide-in';

    return createPortal(
        <div
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            {/* Top Controls */}
            <div
                className="absolute top-4 right-4 z-20 flex gap-2"
                onClick={(e) => e.stopPropagation()}
            >
                {isGallery && (
                    <span className="flex items-center text-white/70 text-sm font-medium px-3 py-1 bg-black/40 rounded-full tabular-nums">
                        {activeIndex + 1} / {mediaItems.length}
                    </span>
                )}
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full" onClick={handleZoomOut} disabled={scale <= 1}>
                    <ZoomOut className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full" onClick={handleZoomIn} disabled={scale >= 3}>
                    <ZoomIn className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full" onClick={handleDownload}>
                    <Download className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                    <X className="h-6 w-6" />
                </Button>
            </div>

            {/* Navigation Side Zones */}
            {isGallery && (
                <>
                    {/* Left zone — previous */}
                    <div
                        className={`absolute left-0 top-0 bottom-0 w-[30%] z-10 flex items-center justify-start pl-4 group transition-opacity ${canGoPrev ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (canGoPrev) goPrev();
                        }}
                    >
                        {canGoPrev && (
                            <div className="h-12 w-12 rounded-full bg-black/30 backdrop-blur-sm text-white/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <ChevronLeft className="h-7 w-7" />
                            </div>
                        )}
                    </div>

                    {/* Right zone — next */}
                    <div
                        className={`absolute right-0 top-0 bottom-0 w-[30%] z-10 flex items-center justify-end pr-4 group transition-opacity ${canGoNext ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (canGoNext) goNext();
                        }}
                    >
                        {canGoNext && (
                            <div className="h-12 w-12 rounded-full bg-black/30 backdrop-blur-sm text-white/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <ChevronRight className="h-7 w-7" />
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Content with slide animation */}
            <div className="flex h-full w-full items-center justify-center p-4 pointer-events-none">
                <div
                    className={`pointer-events-auto ${slideClass}`}
                    style={{ transform: `scale(${scale})` }}
                >
                    {displayType === 'image' ? (
                        <CachedImage
                            src={displaySrc}
                            fileId={displayId}
                            alt="Full screen media"
                            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        />
                    ) : (
                        <video
                            key={displaySrc}
                            src={displaySrc}
                            controls
                            autoPlay
                            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
