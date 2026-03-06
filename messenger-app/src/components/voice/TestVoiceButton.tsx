import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Users, X } from 'lucide-react';

export function TestVoiceButton() {
    const [showPanel, setShowPanel] = useState(false);

    return (
        <>
            {/* Test Button */}
            <Button
                onClick={() => setShowPanel(!showPanel)}
                className="fixed right-4 bottom-4 h-12 w-12 rounded-full bg-purple-600 hover:bg-purple-700 shadow-lg z-[9999] flex items-center justify-center"
                size="icon"
            >
                {showPanel ? <X className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            </Button>

            {/* Test Panel */}
            {showPanel && (
                <div className="fixed right-4 bottom-20 w-64 h-48 bg-purple-900 text-white p-4 rounded-lg shadow-xl z-[9999]">
                    <h3 className="font-semibold mb-2">Voice Channels Test</h3>
                    <p className="text-sm opacity-80">If you see this, the voice system is working!</p>
                    <div className="mt-4 space-y-2">
                        <div className="text-xs">✅ Button works</div>
                        <div className="text-xs">✅ Panel renders</div>
                        <div className="text-xs">✅ Z-index correct</div>
                    </div>
                </div>
            )}
        </>
    );
}
