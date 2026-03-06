
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CachedImage } from './CachedImage';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export interface MediaItem {
    id: string;
    src: string;
    type: 'image' | 'video';
    senderName?: string;
    timestamp?: Date | string;
}

interface MediaViewerProps {
    isOpen: boolean;
    onClose: () => void;
    fileId?: string;
    src?: string;
    type: 'image' | 'video';
    senderName?: string;
    timestamp?: Date | string;
    mediaItems?: MediaItem[];
    currentIndex?: number;
}

export function MediaViewer({
    isOpen,
    onClose,
    fileId,
    src,
    type,
    senderName,
    timestamp,
    mediaItems,
    currentIndex: initialIndex,
}: MediaViewerProps) {
    const [scale, setScale] = useState(1);
    const [translateX, setTranslateX] = useState(0);
    const [translateY, setTranslateY] = useState(0);
    const [activeIndex, setActiveIndex] = useState(initialIndex ?? 0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [slideDirection, setSlideDirection] = useState<'none' | 'left' | 'right'>('none');

    // Track touch for swipe/pinch/pan
    const touchStartRef = useRef({ x: 0, y: 0 });
    const lastPinchDistRef = useRef<number | null>(null);
    const isPinchingRef = useRef(false);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
    const lastTapRef = useRef(0);

    // Thumbnail strip ref for auto-scroll
    const thumbsRef = useRef<HTMLDivElement>(null);

    // Sync activeIndex when initialIndex prop changes (opening different item)
    const prevIsOpenRef = useRef(false);
    useEffect(() => {
        if (isOpen && !prevIsOpenRef.current) {
            // Viewer just opened — reset state
            setScale(1);
            setTranslateX(0);
            setTranslateY(0);
            setSlideDirection('none');
            setActiveIndex(initialIndex ?? 0);
        }
        prevIsOpenRef.current = isOpen;
    }, [isOpen, initialIndex]);

    // Scroll thumbnail strip to active item
    useEffect(() => {
        if (!thumbsRef.current || !mediaItems || mediaItems.length <= 1) return;
        const thumbEl = thumbsRef.current.children[activeIndex] as HTMLElement | undefined;
        thumbEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [activeIndex, mediaItems]);

    // Lock body scroll + keyboard navigation
    useEffect(() => {
        if (!isOpen) {
            document.body.style.overflow = '';
            return;
        }
        document.body.style.overflow = 'hidden';

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowLeft') goPrev();
            if (e.key === '+' || e.key === '=') setScale(p => Math.min(p + 0.5, 5));
            if (e.key === '-') setScale(p => {
                const n = Math.max(p - 0.5, 1);
                if (n === 1) { setTranslateX(0); setTranslateY(0); }
                return n;
            });
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, onClose]);

    const isGallery = !!(mediaItems && mediaItems.length > 1);
    const currentItem = isGallery ? mediaItems![activeIndex] : null;
    const displaySrc = currentItem?.src ?? src;
    const displayType = currentItem?.type ?? type;
    const displayId = currentItem?.id ?? fileId;
    const displaySenderName = currentItem?.senderName ?? senderName;
    const displayTimestamp = currentItem?.timestamp ?? timestamp;

    const resetZoom = useCallback(() => {
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const goNext = useCallback(() => {
        if (!mediaItems || !isGallery || isAnimating) return;
        const next = activeIndex + 1;
        if (next >= mediaItems.length) return;
        setIsAnimating(true);
        setSlideDirection('right');
        resetZoom();
        setTimeout(() => {
            setActiveIndex(next);
            setSlideDirection('none');
            setIsAnimating(false);
        }, 220);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mediaItems, isGallery, isAnimating, activeIndex, resetZoom]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const goPrev = useCallback(() => {
        if (!mediaItems || !isGallery || isAnimating) return;
        const prev = activeIndex - 1;
        if (prev < 0) return;
        setIsAnimating(true);
        setSlideDirection('left');
        resetZoom();
        setTimeout(() => {
            setActiveIndex(prev);
            setSlideDirection('none');
            setIsAnimating(false);
        }, 220);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mediaItems, isGallery, isAnimating, activeIndex, resetZoom]);

    // Touch: start
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            isPinchingRef.current = true;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
        } else {
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (scale > 1) {
                isPanningRef.current = true;
                panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: translateX, ty: translateY };
            }
        }
    }, [scale, translateX, translateY]);

    // Touch: move
    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 2 && isPinchingRef.current) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (lastPinchDistRef.current !== null) {
                setScale(prev => Math.min(5, Math.max(1, prev * (dist / lastPinchDistRef.current!))));
            }
            lastPinchDistRef.current = dist;
        } else if (e.touches.length === 1 && isPanningRef.current && scale > 1) {
            setTranslateX(panStartRef.current.tx + (e.touches[0].clientX - panStartRef.current.x));
            setTranslateY(panStartRef.current.ty + (e.touches[0].clientY - panStartRef.current.y));
        }
    }, [scale]);

    // Touch: end
    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        isPinchingRef.current = false;
        lastPinchDistRef.current = null;

        if (isPanningRef.current) {
            isPanningRef.current = false;
            return;
        }

        if (scale > 1) return;

        const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
        const dy = e.changedTouches[0].clientY - touchStartRef.current.y;

        if (Math.abs(dx) > 60 && Math.abs(dy) < Math.abs(dx)) {
            dx > 0 ? goPrev() : goNext();
            return;
        }
        if (dy > 80 && Math.abs(dx) < dy * 0.5) onClose();
    }, [scale, goPrev, goNext, onClose]);

    // Double-tap zoom
    const handleDoubleTap = useCallback((e: React.MouseEvent) => {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
            e.stopPropagation();
            if (scale > 1) { resetZoom(); } else { setScale(2); }
        }
        lastTapRef.current = now;
    }, [scale, resetZoom]);

    const handleZoomIn = (e: React.MouseEvent) => { e.stopPropagation(); setScale(p => Math.min(p + 0.5, 5)); };
    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale(p => { const n = Math.max(p - 0.5, 1); if (n === 1) { setTranslateX(0); setTranslateY(0); } return n; });
    };

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!displaySrc) return;
        try {
            const res = await fetch(displaySrc);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `media-${displayId || 'file'}.${displayType === 'image' ? 'jpg' : 'mp4'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            window.open(displaySrc, '_blank');
        }
    };

    if (!isOpen) return null;

    const canGoPrev = isGallery && activeIndex > 0;
    const canGoNext = isGallery && activeIndex < mediaItems!.length - 1;

    const slideClass = slideDirection === 'left'
        ? 'animate-slide-out-right'
        : slideDirection === 'right'
            ? 'animate-slide-out-left'
            : '';

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex flex-col bg-black animate-in fade-in duration-200"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Header */}
            <div
                className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-3 py-2 bg-gradient-to-b from-black/80 to-transparent safe-area-top"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex-1 min-w-0">
                    {displaySenderName && (
                        <div className="text-white font-semibold text-sm truncate">{displaySenderName}</div>
                    )}
                    {displayTimestamp && (
                        <div className="text-white/60 text-xs">
                            {format(new Date(displayTimestamp), 'dd MMMM yyyy, HH:mm')}
                        </div>
                    )}
                </div>
                {isGallery && (
                    <span className="text-white/70 text-sm font-medium tabular-nums shrink-0">
                        {activeIndex + 1} / {mediaItems!.length}
                    </span>
                )}
                <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-9 w-9" onClick={handleZoomOut} disabled={scale <= 1}>
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-9 w-9" onClick={handleZoomIn} disabled={scale >= 5}>
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-9 w-9" onClick={handleDownload}>
                        <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-9 w-9" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>
            </div>

            {/* Prev/Next arrows */}
            {isGallery && (
                <>
                    <div
                        className={cn("absolute left-0 top-0 bottom-0 w-[20%] z-10 flex items-center justify-start pl-3 group", canGoPrev ? 'cursor-pointer' : 'cursor-default')}
                        onClick={(e) => { e.stopPropagation(); if (canGoPrev) goPrev(); }}
                    >
                        {canGoPrev && (
                            <div className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronLeft className="h-6 w-6" />
                            </div>
                        )}
                    </div>
                    <div
                        className={cn("absolute right-0 top-0 bottom-0 w-[20%] z-10 flex items-center justify-end pr-3 group", canGoNext ? 'cursor-pointer' : 'cursor-default')}
                        onClick={(e) => { e.stopPropagation(); if (canGoNext) goNext(); }}
                    >
                        {canGoNext && (
                            <div className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight className="h-6 w-6" />
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Main content */}
            <div
                className="flex-1 flex items-center justify-center overflow-hidden px-2 py-2"
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
                <div
                    className={cn(
                        "select-none transition-transform duration-200 ease-out",
                        slideClass,
                    )}
                    style={{
                        transform: `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`,
                        transition: isAnimating ? 'none' : 'transform 0.2s ease',
                        cursor: scale > 1 ? 'grab' : 'default',
                        animation: slideDirection === 'none' && scale === 1 ? 'media-zoom-in 0.25s ease-out' : undefined,
                    }}
                    onClick={handleDoubleTap}
                >
                    {displayType === 'image' ? (
                        <CachedImage
                            src={displaySrc}
                            fileId={displayId}
                            alt="Media"
                            className="max-h-[calc(100dvh-60px)] max-w-[calc(100vw-16px)] w-auto h-auto object-contain rounded shadow-2xl"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            draggable={false}
                        />
                    ) : (
                        <video
                            key={displaySrc}
                            src={displaySrc}
                            controls
                            autoPlay
                            className="max-h-[calc(100dvh-60px)] max-w-[calc(100vw-16px)] w-auto h-auto rounded shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>
            </div>

            {/* Thumbnail strip */}
            {isGallery && mediaItems!.length > 1 && (
                <div
                    className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent pb-3 pt-8 safe-area-bottom"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div
                        ref={thumbsRef}
                        className="flex gap-1.5 overflow-x-auto px-3"
                        style={{ scrollbarWidth: 'none' }}
                    >
                        {mediaItems!.map((item, idx) => (
                            <button
                                key={item.id}
                                onClick={() => { if (idx !== activeIndex) { setActiveIndex(idx); resetZoom(); } }}
                                className={cn(
                                    "shrink-0 h-14 w-14 rounded overflow-hidden border-2 transition-all duration-150",
                                    idx === activeIndex ? "border-white opacity-100 scale-105" : "border-transparent opacity-50 hover:opacity-80"
                                )}
                            >
                                {item.type === 'image' ? (
                                    <img src={item.src} alt="" className="h-full w-full object-cover" loading="lazy" />
                                ) : (
                                    <video src={item.src} className="h-full w-full object-cover" muted preload="metadata" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
}
