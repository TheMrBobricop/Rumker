import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { useState } from 'react';
import type { ConnectionQualityLevel } from '@/types';

const QUALITY_COLORS: Record<ConnectionQualityLevel, string> = {
    excellent: '#23a559',
    good: '#23a559',
    fair: '#faa61a',
    poor: '#ed4245',
};

const QUALITY_LABELS: Record<ConnectionQualityLevel, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
};

/** Discord-style connection quality signal bars with tooltip */
export function ConnectionQualityIndicator({ size = 20 }: { size?: number }) {
    const quality = useVoiceChannelStore((s) => s.connectionQuality);
    const stats = useVoiceChannelStore((s) => s.connectionStats);
    const [showTooltip, setShowTooltip] = useState(false);

    const color = QUALITY_COLORS[quality];
    const bars = quality === 'excellent' ? 4 : quality === 'good' ? 3 : quality === 'fair' ? 2 : 1;

    return (
        <div
            className="relative inline-flex items-center justify-center cursor-pointer"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                {/* 4 bars of increasing height */}
                <rect x="2" y="18" width="3" height="4" rx="0.5" fill={bars >= 1 ? color : '#4e5058'} />
                <rect x="7" y="14" width="3" height="8" rx="0.5" fill={bars >= 2 ? color : '#4e5058'} />
                <rect x="12" y="9" width="3" height="13" rx="0.5" fill={bars >= 3 ? color : '#4e5058'} />
                <rect x="17" y="4" width="3" height="18" rx="0.5" fill={bars >= 4 ? color : '#4e5058'} />
            </svg>

            {/* Tooltip */}
            {showTooltip && (
                <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
                    style={{ minWidth: 180 }}
                >
                    <div className="rounded-lg px-3 py-2.5 text-xs shadow-xl" style={{ background: '#111214', color: '#dbdee1' }}>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                            <span className="font-semibold">{QUALITY_LABELS[quality]}</span>
                        </div>
                        {stats && (
                            <div className="space-y-1 text-[11px]" style={{ color: '#949ba4' }}>
                                <div className="flex justify-between gap-4">
                                    <span>Ping</span>
                                    <span style={{ color: '#dbdee1' }}>{stats.rtt} ms</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span>Packet Loss</span>
                                    <span style={{ color: '#dbdee1' }}>{stats.packetLoss}%</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span>Bitrate</span>
                                    <span style={{ color: '#dbdee1' }}>{stats.bitrate} kbps</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span>Jitter</span>
                                    <span style={{ color: '#dbdee1' }}>{stats.jitter} ms</span>
                                </div>
                            </div>
                        )}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-[#111214]" />
                    </div>
                </div>
            )}
        </div>
    );
}
