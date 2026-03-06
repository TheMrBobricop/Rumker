import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff, Settings } from 'lucide-react';
import { useVoiceChannelStore } from '@/stores/voiceChannelStore';
import { cn } from '@/lib/utils';

interface MicrophoneSelectorProps {
    onDeviceChange?: (deviceId: string) => void;
    className?: string;
}

export function MicrophoneSelector({ onDeviceChange, className }: MicrophoneSelectorProps) {
    const audioDevices = useVoiceChannelStore((s) => s.audioDevices);
    const voiceSettings = useVoiceChannelStore((s) => s.voiceSettings);
    const setInputDevice = useVoiceChannelStore((s) => s.setInputDevice);
    const setAudioDevices = useVoiceChannelStore((s) => s.setAudioDevices);
    const setVoiceSettings = useVoiceChannelStore((s) => s.setVoiceSettings);
    
    const [isRecording, setIsRecording] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Load audio devices on mount
    useEffect(() => {
        const loadAudioDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioDevices = devices.filter(device => 
                    device.kind === 'audioinput'
                ).map(device => ({
                    deviceId: device.deviceId,
                    label: device.label || `Микрофон ${device.deviceId.slice(0, 8)}`,
                    kind: device.kind as 'audioinput',
                }));
                setAudioDevices(audioDevices);
            } catch (error) {
                console.error('Failed to load audio devices:', error);
            }
        };

        loadAudioDevices();
        
        // Listen for device changes
        navigator.mediaDevices?.addEventListener('devicechange', loadAudioDevices);
        return () => {
            navigator.mediaDevices?.removeEventListener('devicechange', loadAudioDevices);
        };
    }, [setAudioDevices]);

    // Monitor audio level
    const startAudioMonitoring = async (deviceId?: string) => {
        try {
            // Stop previous monitoring
            stopAudioMonitoring();
            
            const constraints: MediaStreamConstraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true,
                video: false,
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            
            // Setup audio context
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            source.connect(analyserRef.current);
            
            // Start monitoring
            const updateAudioLevel = () => {
                if (!analyserRef.current) return;
                
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);
                
                const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
                const normalizedLevel = Math.min(100, (average / 128) * 100);
                setAudioLevel(normalizedLevel);
                
                animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
            };
            
            updateAudioLevel();
        } catch (error) {
            console.error('Failed to start audio monitoring:', error);
        }
    };

    const stopAudioMonitoring = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        
        analyserRef.current = null;
        setAudioLevel(0);
    };

    // Start monitoring when device changes
    useEffect(() => {
        if (voiceSettings.inputDeviceId) {
            startAudioMonitoring(voiceSettings.inputDeviceId);
        }
        
        return () => {
            stopAudioMonitoring();
        };
    }, [voiceSettings.inputDeviceId]);

    const handleDeviceChange = (deviceId: string) => {
        setInputDevice(deviceId);
        onDeviceChange?.(deviceId);
    };

    const toggleRecording = () => {
        setIsRecording(!isRecording);
    };

    const inputDevices = audioDevices.filter(device => device.kind === 'audioinput');
    const selectedDevice = inputDevices.find(device => device.deviceId === voiceSettings.inputDeviceId);

    return (
        <div className={cn("flex items-center gap-2", className)}>
            {/* Microphone Level Indicator */}
            <div className="flex items-center gap-2">
                <div className="relative">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleRecording}
                        className={cn(
                            "h-8 w-8 rounded-full",
                            isRecording ? "bg-red-500 hover:bg-red-600 text-white" : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    
                    {/* Audio level indicator */}
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-gray-200 overflow-hidden">
                        <div 
                            className="h-full bg-green-500 transition-all duration-100"
                            style={{ width: `${audioLevel}%` }}
                        />
                    </div>
                </div>
                
                {/* Device selector */}
                <Select value={voiceSettings.inputDeviceId || ''} onValueChange={handleDeviceChange}>
                    <SelectTrigger className="w-48 h-8 text-xs">
                        <SelectValue placeholder="Выберите микрофон">
                            <div className="flex items-center gap-2">
                                <Mic className="h-3 w-3" />
                                <span className="truncate">
                                    {selectedDevice?.label || 'Микрофон по умолчанию'}
                                </span>
                            </div>
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {inputDevices.map((device) => (
                            <SelectItem key={device.deviceId} value={device.deviceId}>
                                <div className="flex items-center gap-2">
                                    <Mic className="h-3 w-3" />
                                    <span className="truncate">{device.label}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                
                {/* Settings button */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(!showSettings)}
                    className="h-8 w-8 text-gray-500 hover:text-gray-700"
                >
                    <Settings className="h-4 w-4" />
                </Button>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="absolute bottom-full left-0 mb-2 p-4 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-80">
                    <h4 className="font-semibold text-gray-900 mb-4">Настройки микрофона</h4>
                    
                    <div className="space-y-4">
                        {/* Input Volume */}
                        <div>
                            <label className="text-sm text-gray-700 block mb-2">
                                Усиление микрофона: {voiceSettings.inputVolume}%
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={voiceSettings.inputVolume}
                                onChange={(e) => setVoiceSettings({ inputVolume: parseInt(e.target.value) })}
                                className="w-full"
                            />
                        </div>
                        
                        {/* Noise Suppression */}
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-700">Подавление шума</label>
                            <input
                                type="checkbox"
                                checked={voiceSettings.noiseSuppression}
                                onChange={(e) => setVoiceSettings({ noiseSuppression: e.target.checked })}
                                className="rounded"
                            />
                        </div>
                        
                        {/* Echo Cancellation */}
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-700">Эхоподавление</label>
                            <input
                                type="checkbox"
                                checked={voiceSettings.echoCancellation}
                                onChange={(e) => setVoiceSettings({ echoCancellation: e.target.checked })}
                                className="rounded"
                            />
                        </div>
                        
                        {/* Auto Gain Control */}
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-700">Автоусиление</label>
                            <input
                                type="checkbox"
                                checked={voiceSettings.autoGainControl}
                                onChange={(e) => setVoiceSettings({ autoGainControl: e.target.checked })}
                                className="rounded"
                            />
                        </div>
                        
                        {/* Audio Level Visualization */}
                        <div>
                            <label className="text-sm text-gray-700 block mb-2">Уровень звука</label>
                            <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-400 transition-all duration-100"
                                    style={{ width: `${audioLevel}%` }}
                                />
                            </div>
                        </div>
                    </div>
                    
                    <Button
                        onClick={() => setShowSettings(false)}
                        className="w-full mt-4"
                        variant="outline"
                    >
                        Закрыть
                    </Button>
                </div>
            )}
        </div>
    );
}
