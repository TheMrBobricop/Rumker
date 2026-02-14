
import { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CachedImage } from './CachedImage';

interface MediaViewerProps {
    isOpen: boolean;
    onClose: () => void;
    fileId?: string;
    src?: string;
    type: 'image' | 'video';
}

export function MediaViewer({
    isOpen,
    onClose,
    fileId,
    src,
    type,
}: MediaViewerProps) {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        // Reset scale when opening new image
        if (isOpen) setScale(1);

        // Lock body scroll
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        // Handle ESC key
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.5, 3));
    const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.5, 1));

    const handleDownload = () => {
        if (src || fileId) {
            // Logic for downloading blob/url
            const link = document.createElement('a');
            link.href = src || ''; // Better logic needed with fileId -> getMedia
            link.download = `media-${fileId || 'file'}.${type === 'image' ? 'jpg' : 'mp4'}`;
            link.click();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
            {/* Controls */}
            <div className="absolute top-4 right-4 flex gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full"
                    onClick={handleZoomOut}
                    disabled={scale <= 1}
                >
                    <ZoomOut className="h-5 w-5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full"
                    onClick={handleZoomIn}
                    disabled={scale >= 3}
                >
                    <ZoomIn className="h-5 w-5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full"
                    onClick={handleDownload}
                >
                    <Download className="h-5 w-5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full"
                    onClick={onClose}
                >
                    <X className="h-6 w-6" />
                </Button>
            </div>

            {/* Content */}
            <div
                className="relative flex h-full w-full items-center justify-center p-4 overflow-hidden"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                {type === 'image' ? (
                    <div
                        className="transition-transform duration-200 ease-out"
                        style={{ transform: `scale(${scale})` }}
                    >
                        <CachedImage
                            src={src}
                            fileId={fileId}
                            alt="Full screen media"
                            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
                        // Disable cached image internal bg/loading styles for viewer
                        />
                    </div>
                ) : (
                    <div className="max-h-[90vh] max-w-[90vw]">
                        <p className="text-white">Video player not implemented yet</p>
                    </div>
                )}
            </div>
        </div>
    );
}
