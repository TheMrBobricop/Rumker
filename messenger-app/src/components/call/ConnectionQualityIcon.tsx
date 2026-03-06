import { cn } from '@/lib/utils';
import type { ConnectionQuality } from '@/lib/webrtc/PeerManager';

interface ConnectionQualityIconProps {
    quality: ConnectionQuality;
    className?: string;
}

const QUALITY_COLORS: Record<ConnectionQuality, string> = {
    excellent: '#23a559',
    good: '#23a559',
    poor: '#faa61a',
    disconnected: '#ed4245',
};

const QUALITY_BARS: Record<ConnectionQuality, number> = {
    excellent: 4,
    good: 3,
    poor: 2,
    disconnected: 1,
};

export function ConnectionQualityIcon({ quality, className }: ConnectionQualityIconProps) {
    const activeBars = QUALITY_BARS[quality];
    const color = QUALITY_COLORS[quality];

    return (
        <div className={cn('flex items-end gap-[2px] h-4', className)}>
            {[1, 2, 3, 4].map((bar) => (
                <div
                    key={bar}
                    className="w-[3px] rounded-[1px] transition-colors"
                    style={{
                        height: `${bar * 25}%`,
                        backgroundColor: bar <= activeBars ? color : '#4e5058',
                    }}
                />
            ))}
        </div>
    );
}
