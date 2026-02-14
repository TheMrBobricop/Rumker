import { useSettingsStore } from '@/stores/settingsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Palette, Sun, Moon, Monitor, Check } from 'lucide-react';
import { toast } from 'sonner';

const BACKGROUND_OPTIONS = [
    { type: 'color', value: '#f5f6f8', name: 'Soft Gray', preview: 'bg-gray-100' },
    { type: 'color', value: '#e8f4f8', name: 'Ice Blue', preview: 'bg-blue-50' },
    { type: 'color', value: '#e8f5e9', name: 'Mint Green', preview: 'bg-green-50' },
    { type: 'color', value: '#f3e8f4', name: 'Soft Purple', preview: 'bg-purple-50' },
    { type: 'color', value: '#faf5e8', name: 'Warm Cream', preview: 'bg-yellow-50' },
    { type: 'color', value: '#1a202c', name: 'Dark', preview: 'bg-gray-900' },
];

export function AppearanceSettings() {
    const { appearance, updateAppearance, setTheme } = useSettingsStore();

    const handleThemeChange = (theme: 'light' | 'dark' | 'auto') => {
        setTheme(theme);
        toast.success(`Theme set to ${theme}`);
    };

    const handleBackgroundChange = (value: string) => {
        updateAppearance({
            chatBackground: {
                ...appearance.chatBackground,
                type: 'color',
                value,
            },
        });
    };

    const handleBorderRadiusChange = (value: number[]) => {
        updateAppearance({
            messageBubbles: {
                ...appearance.messageBubbles,
                borderRadius: value[0],
            },
        });
    };

    const handleFontSizeChange = (value: number[]) => {
        updateAppearance({
            messageBubbles: {
                ...appearance.messageBubbles,
                fontSize: value[0],
            },
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Appearance
                </CardTitle>
                <CardDescription>
                    Customize how Rumker looks and feels
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Theme Selection */}
                <div className="space-y-3">
                    <Label>Theme</Label>
                    <div className="grid grid-cols-3 gap-3">
                        <button
                            onClick={() => handleThemeChange('light')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                                appearance.theme === 'light'
                                    ? 'border-tg-primary bg-tg-primary/5'
                                    : 'border-border hover:border-tg-primary/50'
                            }`}
                        >
                            <Sun className="h-6 w-6" />
                            <span className="text-sm">Light</span>
                            {appearance.theme === 'light' && (
                                <Check className="h-4 w-4 text-tg-primary" />
                            )}
                        </button>
                        <button
                            onClick={() => handleThemeChange('dark')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                                appearance.theme === 'dark'
                                    ? 'border-tg-primary bg-tg-primary/5'
                                    : 'border-border hover:border-tg-primary/50'
                            }`}
                        >
                            <Moon className="h-6 w-6" />
                            <span className="text-sm">Dark</span>
                            {appearance.theme === 'dark' && (
                                <Check className="h-4 w-4 text-tg-primary" />
                            )}
                        </button>
                        <button
                            onClick={() => handleThemeChange('auto')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                                appearance.theme === 'auto'
                                    ? 'border-tg-primary bg-tg-primary/5'
                                    : 'border-border hover:border-tg-primary/50'
                            }`}
                        >
                            <Monitor className="h-6 w-6" />
                            <span className="text-sm">Auto</span>
                            {appearance.theme === 'auto' && (
                                <Check className="h-4 w-4 text-tg-primary" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Chat Background */}
                <div className="space-y-3">
                    <Label>Chat Background</Label>
                    <div className="grid grid-cols-3 gap-3">
                        {BACKGROUND_OPTIONS.map((bg) => (
                            <button
                                key={bg.value}
                                onClick={() => handleBackgroundChange(bg.value)}
                                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                                    appearance.chatBackground.value === bg.value
                                        ? 'border-tg-primary'
                                        : 'border-border hover:border-tg-primary/50'
                                }`}
                            >
                                <div className={`w-full h-12 rounded-md ${bg.preview}`} />
                                <span className="text-xs">{bg.name}</span>
                                {appearance.chatBackground.value === bg.value && (
                                    <Check className="h-4 w-4 text-tg-primary" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Message Bubbles */}
                <div className="space-y-4">
                    <Label>Message Bubble Style</Label>
                    
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Border Radius</span>
                            <span>{appearance.messageBubbles.borderRadius}px</span>
                        </div>
                        <Slider
                            value={[appearance.messageBubbles.borderRadius]}
                            onValueChange={handleBorderRadiusChange}
                            min={0}
                            max={24}
                            step={2}
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Font Size</span>
                            <span>{appearance.messageBubbles.fontSize}px</span>
                        </div>
                        <Slider
                            value={[appearance.messageBubbles.fontSize]}
                            onValueChange={handleFontSizeChange}
                            min={12}
                            max={18}
                            step={1}
                        />
                    </div>
                </div>

                {/* Display Options */}
                <div className="space-y-3">
                    <Label>Display Options</Label>
                    
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <span className="text-sm">Show Avatars</span>
                            <p className="text-xs text-muted-foreground">
                                Display user avatars in chat
                            </p>
                        </div>
                        <Switch
                            checked={appearance.showAvatars}
                            onCheckedChange={(checked) =>
                                updateAppearance({ showAvatars: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <span className="text-sm">Show Timestamps</span>
                            <p className="text-xs text-muted-foreground">
                                Show message time
                            </p>
                        </div>
                        <Switch
                            checked={appearance.showTimeStamps}
                            onCheckedChange={(checked) =>
                                updateAppearance({ showTimeStamps: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <span className="text-sm">Compact Mode</span>
                            <p className="text-xs text-muted-foreground">
                                Reduce spacing between messages
                            </p>
                        </div>
                        <Switch
                            checked={appearance.compactMode}
                            onCheckedChange={(checked) =>
                                updateAppearance({ compactMode: checked })
                            }
                        />
                    </div>
                </div>

                {/* Reset Button */}
                <Button
                    variant="outline"
                    onClick={() => {
                        updateAppearance({
                            chatBackground: { type: 'color', value: '#f5f6f8', opacity: 1 },
                            messageBubbles: {
                                borderRadius: 12,
                                fontSize: 14,
                                outgoingColor: '#c6e9c6',
                                incomingColor: '#ffffff',
                            },
                            theme: 'light',
                            compactMode: false,
                            showAvatars: true,
                            showTimeStamps: true,
                        });
                        toast.success('Appearance reset to defaults');
                    }}
                    className="w-full"
                >
                    Reset to Defaults
                </Button>
            </CardContent>
        </Card>
    );
}
