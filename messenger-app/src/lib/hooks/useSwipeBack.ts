import { useRef, useEffect, useCallback } from 'react';

interface UseSwipeBackOptions {
    onSwipeBack: () => void;
    enabled?: boolean;
    edgeThreshold?: number; // px from left edge to start tracking
    swipeThreshold?: number; // px to trigger back
}

export function useSwipeBack({
    onSwipeBack,
    enabled = true,
    edgeThreshold = 30,
    swipeThreshold = 80,
}: UseSwipeBackOptions) {
    const containerRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    const startYRef = useRef(0);
    const trackingRef = useRef(false);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (!enabled) return;
        const touch = e.touches[0];
        if (touch.clientX < edgeThreshold) {
            startXRef.current = touch.clientX;
            startYRef.current = touch.clientY;
            trackingRef.current = true;
        }
    }, [enabled, edgeThreshold]);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
        if (!trackingRef.current) return;
        trackingRef.current = false;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - startXRef.current;
        const dy = Math.abs(touch.clientY - startYRef.current);

        // Must be primarily horizontal swipe
        if (dx > swipeThreshold && dy < dx * 0.5) {
            onSwipeBack();
        }
    }, [swipeThreshold, onSwipeBack]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || !enabled) return;

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [enabled, handleTouchStart, handleTouchEnd]);

    return containerRef;
}
