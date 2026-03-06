import { MapPin, ExternalLink } from 'lucide-react';
import type { LocationData } from '@/types';

interface LocationBubbleProps {
    locationData: LocationData;
}

export function LocationBubble({ locationData }: LocationBubbleProps) {
    const { latitude, longitude, address } = locationData;
    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    return (
        <div className="min-w-[200px] max-w-[300px]">
            {/* Map preview (fallback to colored box with pin) */}
            <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block -mx-2.5 -mt-1.5 mb-1.5 overflow-hidden rounded-t-[var(--message-border-radius,12px)] bg-green-500/10 hover:bg-green-500/15 transition-colors"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="h-[120px] flex flex-col items-center justify-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        {latitude.toFixed(5)}, {longitude.toFixed(5)}
                    </span>
                </div>
            </a>

            {/* Address if available */}
            {address && (
                <div className="text-sm mb-1">{address}</div>
            )}

            {/* Open in maps link */}
            <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                onClick={(e) => e.stopPropagation()}
            >
                <ExternalLink className="h-3 w-3" />
                Открыть в Google Maps
            </a>
        </div>
    );
}
