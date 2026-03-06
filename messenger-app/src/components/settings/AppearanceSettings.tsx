import { useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
    Palette, Sun, Moon, Monitor, Check, Upload, Trash2,
    MessageSquare, CircleDot, Sparkles, RotateCcw,
    Eye, Minus, AlignLeft, Clock, Users, Paintbrush,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { THEME_PRESETS } from '@/lib/themes';

// --- Preset data ---

const BACKGROUND_COLORS = [
    { value: '#f5f6f8', name: 'Серый' },
    { value: '#e8f4f8', name: 'Голубой' },
    { value: '#e8f5e9', name: 'Мятный' },
    { value: '#f3e8f4', name: 'Лиловый' },
    { value: '#faf5e8', name: 'Кремовый' },
    { value: '#fce4ec', name: 'Розовый' },
    { value: '#1a202c', name: 'Тёмный' },
    { value: '#0f172a', name: 'Глубокий' },
];

const GRADIENT_PRESETS = [
    { value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', name: 'Фиолетовый' },
    { value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', name: 'Розовый' },
    { value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', name: 'Голубой' },
    { value: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', name: 'Зелёный' },
    { value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', name: 'Закат' },
    { value: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', name: 'Лаванда' },
    { value: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', name: 'Персик' },
    { value: 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)', name: 'Ночь' },
];

const BUBBLE_COLOR_PRESETS = {
    outgoing: [
        '#c6e9c6', '#EFFDDE', '#d1ecf1', '#e2d5f1', '#fce4ec',
        '#fff9c4', '#d7ccc8', '#2f855a', '#3182ce', '#805ad5',
    ],
    incoming: [
        '#ffffff', '#f7fafc', '#edf2f7', '#e2e8f0',
        '#2d3748', '#1a202c', '#f0fff4', '#ebf8ff',
    ],
};

const TEXT_COLOR_PRESETS = [
    '#2d3748', '#1a202c', '#000000',
    '#ffffff', '#e2e8f0', '#f7fafc',
    '#4a7c59', '#3182ce', '#805ad5', '#e53e3e',
];

export function AppearanceSettings() {
    const appearance = useSettingsStore((s) => s.appearance);
    const updateAppearance = useSettingsStore((s) => s.updateAppearance);
    const setTheme = useSettingsStore((s) => s.setTheme);
    const setThemePreset = useSettingsStore((s) => s.setThemePreset);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeSection, setActiveSection] = useState<string | null>(null);

    const handleThemeChange = (theme: 'light' | 'dark' | 'auto') => {
        setTheme(theme);
        toast.success(theme === 'light' ? 'Светлая тема' : theme === 'dark' ? 'Тёмная тема' : 'Авто');
    };

    const handleBackgroundColor = (value: string) => {
        updateAppearance({
            chatBackground: { ...appearance.chatBackground, type: 'color', value },
        });
    };

    const handleBackgroundGradient = (value: string) => {
        updateAppearance({
            chatBackground: { ...appearance.chatBackground, type: 'gradient', value },
        });
    };

    const handleBackgroundImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Выберите изображение');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            updateAppearance({
                chatBackground: {
                    ...appearance.chatBackground,
                    type: 'image',
                    value: reader.result as string,
                },
            });
            toast.success('Обои установлены');
        };
        reader.readAsDataURL(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRemoveWallpaper = () => {
        updateAppearance({
            chatBackground: { type: 'color', value: '#f5f6f8', opacity: 1 },
        });
        toast.success('Обои сброшены');
    };

    const handleOpacityChange = (value: number[]) => {
        updateAppearance({
            chatBackground: { ...appearance.chatBackground, opacity: value[0] },
        });
    };

    const handleBubbleProp = (key: string, value: string | number) => {
        updateAppearance({
            messageBubbles: { ...appearance.messageBubbles, [key]: value },
        });
    };

    const toggleSection = (section: string) => {
        setActiveSection(activeSection === section ? null : section);
    };

    const previewBg = appearance.chatBackground;
    const b = appearance.messageBubbles;

    return (
        <div className="space-y-4 animate-fade-slide-in">
            {/* Sticky Live Preview */}
            <div className="sticky top-0 z-10">
                <Card className="overflow-hidden shadow-lg border-border/60">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border/40">
                        <Sparkles className="h-3.5 w-3.5 text-tg-primary" />
                        <span className="text-xs font-medium text-muted-foreground">Предпросмотр</span>
                    </div>
                    <div className="relative h-[160px] overflow-hidden">
                        {/* Background layer with opacity + blur */}
                        <div
                            className="absolute inset-0 pointer-events-none transition-all duration-300"
                            style={{
                                ...(previewBg.type === 'gradient' ? {
                                    background: previewBg.value,
                                } : previewBg.type === 'image' ? {
                                    backgroundImage: `url(${previewBg.value})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                } : {
                                    backgroundColor: previewBg.value,
                                }),
                                opacity: previewBg.opacity,
                                filter: (previewBg.blur ?? 0) > 0
                                    ? `blur(${previewBg.blur}px)`
                                    : undefined,
                            }}
                        />
                        <div className="absolute inset-0 flex flex-col justify-end p-3 gap-1.5">
                            {/* Incoming */}
                            <div className="flex justify-start">
                                <div
                                    className="max-w-[70%] px-3 py-1.5 shadow-sm transition-all duration-200"
                                    style={{
                                        backgroundColor: b.incomingColor,
                                        borderRadius: `${b.borderRadius}px`,
                                        fontSize: `${b.fontSize}px`,
                                        color: b.incomingTextColor,
                                    }}
                                >
                                    Привет! Как дела? 👋
                                    <span className="text-[10px] opacity-40 float-right mt-0.5 ml-2">14:32</span>
                                </div>
                            </div>
                            {/* Outgoing */}
                            <div className="flex justify-end">
                                <div
                                    className="max-w-[70%] px-3 py-1.5 shadow-sm transition-all duration-200"
                                    style={{
                                        backgroundColor: b.outgoingColor,
                                        borderRadius: `${b.borderRadius}px`,
                                        fontSize: `${b.fontSize}px`,
                                        color: b.outgoingTextColor,
                                    }}
                                >
                                    Отлично! Настроил чат ✨
                                    <span className="text-[10px] opacity-40 float-right mt-0.5 ml-2">14:33 ✓✓</span>
                                </div>
                            </div>
                            {/* Incoming short */}
                            <div className="flex justify-start">
                                <div
                                    className="max-w-[70%] px-3 py-1.5 shadow-sm transition-all duration-200"
                                    style={{
                                        backgroundColor: b.incomingColor,
                                        borderRadius: `${b.borderRadius}px`,
                                        fontSize: `${b.fontSize}px`,
                                        color: b.incomingTextColor,
                                    }}
                                >
                                    Круто выглядит! 🔥
                                    <span className="text-[10px] opacity-40 float-right mt-0.5 ml-2">14:34</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Theme Presets */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Paintbrush className="h-4 w-4" />
                        Пресеты тем
                    </CardTitle>
                    <CardDescription>Полностью меняет оформление приложения</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {THEME_PRESETS.map((preset) => {
                            const isActive = appearance.themePreset === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    onClick={() => {
                                        setThemePreset(preset.id);
                                        toast.success(`Тема: ${preset.name}`);
                                    }}
                                    className={cn(
                                        'relative flex flex-col rounded-xl border-2 overflow-hidden transition-all duration-200',
                                        isActive
                                            ? 'border-tg-primary scale-[1.02] shadow-md'
                                            : 'border-border hover:border-tg-primary/40 hover:shadow-sm'
                                    )}
                                >
                                    {/* Mini preview */}
                                    <div className="flex h-[80px]">
                                        {/* Sidebar sliver */}
                                        <div
                                            className="w-[30%] flex flex-col"
                                            style={{ backgroundColor: preset.preview.sidebar }}
                                        >
                                            <div
                                                className="h-[14px] w-full"
                                                style={{ backgroundColor: preset.preview.header }}
                                            />
                                            <div className="flex-1 p-1 space-y-1">
                                                <div
                                                    className="h-1.5 w-full rounded-full opacity-30"
                                                    style={{ backgroundColor: preset.preview.accent }}
                                                />
                                                <div
                                                    className="h-1.5 w-[70%] rounded-full opacity-20"
                                                    style={{ backgroundColor: preset.preview.accent }}
                                                />
                                            </div>
                                        </div>
                                        {/* Chat area */}
                                        <div
                                            className="flex-1 flex flex-col justify-end p-1.5 gap-1"
                                            style={{ backgroundColor: preset.preview.chatBg }}
                                        >
                                            <div className="flex justify-start">
                                                <div
                                                    className="h-3 w-[60%] rounded-md"
                                                    style={{ backgroundColor: preset.preview.bubbleIn }}
                                                />
                                            </div>
                                            <div className="flex justify-end">
                                                <div
                                                    className="h-3 w-[55%] rounded-md"
                                                    style={{ backgroundColor: preset.preview.bubbleOut }}
                                                />
                                            </div>
                                            <div className="flex justify-start">
                                                <div
                                                    className="h-2.5 w-[40%] rounded-md"
                                                    style={{ backgroundColor: preset.preview.bubbleIn }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Label */}
                                    <div className="flex items-center justify-between px-2 py-1.5 bg-card">
                                        <div className="text-left">
                                            <div className="text-xs font-medium leading-tight">{preset.name}</div>
                                            <div className="text-[10px] text-muted-foreground leading-tight">{preset.description}</div>
                                        </div>
                                        {isActive && (
                                            <div className="h-4 w-4 rounded-full bg-tg-primary flex items-center justify-center shrink-0">
                                                <Check className="h-2.5 w-2.5 text-white" />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Theme */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Sun className="h-4 w-4" />
                        Тема
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-3">
                        {([
                            { key: 'light' as const, icon: Sun, label: 'Светлая' },
                            { key: 'dark' as const, icon: Moon, label: 'Тёмная' },
                            { key: 'auto' as const, icon: Monitor, label: 'Авто' },
                        ]).map(({ key, icon: Icon, label }) => (
                            <button
                                key={key}
                                onClick={() => handleThemeChange(key)}
                                className={cn(
                                    'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200',
                                    appearance.theme === key
                                        ? 'border-tg-primary bg-tg-primary/5 scale-[1.02]'
                                        : 'border-border hover:border-tg-primary/40 hover:bg-muted/50'
                                )}
                            >
                                <Icon className="h-5 w-5" />
                                <span className="text-xs font-medium">{label}</span>
                                {appearance.theme === key && <Check className="h-3.5 w-3.5 text-tg-primary" />}
                            </button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Chat Background */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Palette className="h-4 w-4" />
                        Фон чата
                    </CardTitle>
                    <CardDescription>Обои, цвет или градиент</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Upload wallpaper */}
                    <div className="flex gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleBackgroundImage}
                        />
                        <Button
                            variant="outline"
                            className="flex-1 gap-2"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="h-4 w-4" />
                            Загрузить обои
                        </Button>
                        {appearance.chatBackground.type === 'image' && (
                            <Button variant="outline" size="icon" onClick={handleRemoveWallpaper}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                        )}
                    </div>

                    {/* Current wallpaper preview */}
                    {appearance.chatBackground.type === 'image' && (
                        <div className="relative h-20 rounded-lg overflow-hidden border border-border">
                            <img
                                src={appearance.chatBackground.value}
                                alt="Wallpaper"
                                className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <span className="text-white text-xs font-medium bg-black/40 px-2 py-0.5 rounded-full">
                                    Текущие обои
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Solid colors */}
                    <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Однотонные</Label>
                        <div className="grid grid-cols-4 gap-2">
                            {BACKGROUND_COLORS.map((bg) => (
                                <button
                                    key={bg.value}
                                    onClick={() => handleBackgroundColor(bg.value)}
                                    className={cn(
                                        'flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all duration-200',
                                        appearance.chatBackground.type === 'color' && appearance.chatBackground.value === bg.value
                                            ? 'border-tg-primary scale-[1.05]'
                                            : 'border-transparent hover:border-tg-primary/30'
                                    )}
                                >
                                    <div
                                        className="w-full h-8 rounded-md shadow-inner"
                                        style={{ backgroundColor: bg.value }}
                                    />
                                    <span className="text-[10px] text-muted-foreground">{bg.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Gradients */}
                    <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Градиенты</Label>
                        <div className="grid grid-cols-4 gap-2">
                            {GRADIENT_PRESETS.map((grad) => (
                                <button
                                    key={grad.value}
                                    onClick={() => handleBackgroundGradient(grad.value)}
                                    className={cn(
                                        'flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all duration-200',
                                        appearance.chatBackground.type === 'gradient' && appearance.chatBackground.value === grad.value
                                            ? 'border-tg-primary scale-[1.05]'
                                            : 'border-transparent hover:border-tg-primary/30'
                                    )}
                                >
                                    <div
                                        className="w-full h-8 rounded-md"
                                        style={{ background: grad.value }}
                                    />
                                    <span className="text-[10px] text-muted-foreground">{grad.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Opacity */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Прозрачность фона</span>
                            <span className="tabular-nums">{Math.round(appearance.chatBackground.opacity * 100)}%</span>
                        </div>
                        <Slider
                            value={[appearance.chatBackground.opacity]}
                            onValueChange={handleOpacityChange}
                            min={0.3}
                            max={1}
                            step={0.05}
                        />
                    </div>

                    {/* Blur */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Размытие фона</span>
                            <span className="tabular-nums">{appearance.chatBackground.blur ?? 0}px</span>
                        </div>
                        <Slider
                            value={[appearance.chatBackground.blur ?? 0]}
                            onValueChange={(v) => updateAppearance({
                                chatBackground: { ...appearance.chatBackground, blur: v[0] },
                            })}
                            min={0}
                            max={20}
                            step={1}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Message Bubbles */}
            <Card>
                <button onClick={() => toggleSection('bubbles')} className="w-full text-left">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <MessageSquare className="h-4 w-4" />
                            Сообщения
                            <span className="ml-auto text-xs text-muted-foreground">
                                {activeSection === 'bubbles' ? '▲' : '▼'}
                            </span>
                        </CardTitle>
                        <CardDescription>Цвет фона, цвет текста, скругление</CardDescription>
                    </CardHeader>
                </button>

                <div className={cn(
                    'overflow-hidden transition-all duration-300',
                    activeSection === 'bubbles' ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
                )}>
                    <CardContent className="space-y-5 pt-0">
                        {/* Outgoing bubble color */}
                        <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">Фон исходящих</Label>
                            <ColorPicker
                                presets={BUBBLE_COLOR_PRESETS.outgoing}
                                value={b.outgoingColor}
                                onChange={(c) => handleBubbleProp('outgoingColor', c)}
                            />
                        </div>

                        {/* Outgoing text color */}
                        <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">Текст исходящих</Label>
                            <ColorPicker
                                presets={TEXT_COLOR_PRESETS}
                                value={b.outgoingTextColor}
                                onChange={(c) => handleBubbleProp('outgoingTextColor', c)}
                            />
                        </div>

                        <Separator />

                        {/* Incoming bubble color */}
                        <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">Фон входящих</Label>
                            <ColorPicker
                                presets={BUBBLE_COLOR_PRESETS.incoming}
                                value={b.incomingColor}
                                onChange={(c) => handleBubbleProp('incomingColor', c)}
                            />
                        </div>

                        {/* Incoming text color */}
                        <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">Текст входящих</Label>
                            <ColorPicker
                                presets={TEXT_COLOR_PRESETS}
                                value={b.incomingTextColor}
                                onChange={(c) => handleBubbleProp('incomingTextColor', c)}
                            />
                        </div>

                        <Separator />

                        {/* Border radius */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Скругление</span>
                                <span className="tabular-nums">{b.borderRadius}px</span>
                            </div>
                            <Slider
                                value={[b.borderRadius]}
                                onValueChange={(v) => handleBubbleProp('borderRadius', v[0])}
                                min={0}
                                max={24}
                                step={2}
                            />
                        </div>

                        {/* Font size */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Размер текста</span>
                                <span className="tabular-nums">{b.fontSize}px</span>
                            </div>
                            <Slider
                                value={[b.fontSize]}
                                onValueChange={(v) => handleBubbleProp('fontSize', v[0])}
                                min={12}
                                max={20}
                                step={1}
                            />
                        </div>
                    </CardContent>
                </div>
            </Card>

            {/* Display Options */}
            <Card>
                <button onClick={() => toggleSection('display')} className="w-full text-left">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Eye className="h-4 w-4" />
                            Отображение
                            <span className="ml-auto text-xs text-muted-foreground">
                                {activeSection === 'display' ? '▲' : '▼'}
                            </span>
                        </CardTitle>
                        <CardDescription>Интерфейс и элементы чата</CardDescription>
                    </CardHeader>
                </button>

                <div className={cn(
                    'overflow-hidden transition-all duration-300',
                    activeSection === 'display' ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                )}>
                    <CardContent className="space-y-1 pt-0">
                        <ToggleRow
                            icon={Users}
                            label="Аватары в чате"
                            description="Показывать аватары рядом с сообщениями в групповых чатах"
                            checked={appearance.showAvatars}
                            onChange={(v) => updateAppearance({ showAvatars: v })}
                        />
                        <Separator className="my-2" />
                        <ToggleRow
                            icon={Clock}
                            label="Время сообщений"
                            description="Отображать время отправки у каждого сообщения"
                            checked={appearance.showTimeStamps}
                            onChange={(v) => updateAppearance({ showTimeStamps: v })}
                        />
                        <Separator className="my-2" />
                        <ToggleRow
                            icon={Minus}
                            label="Компактный режим"
                            description="Уменьшить отступы — больше сообщений на экране"
                            checked={appearance.compactMode}
                            onChange={(v) => updateAppearance({ compactMode: v })}
                        />
                        <Separator className="my-2" />
                        <ToggleRow
                            icon={AlignLeft}
                            label="Хвостики сообщений"
                            description="Маленький треугольник у последнего сообщения в группе"
                            checked={appearance.showTails ?? true}
                            onChange={(v) => updateAppearance({ showTails: v })}
                        />
                    </CardContent>
                </div>
            </Card>

            {/* Reset */}
            <Button
                variant="outline"
                onClick={() => {
                    updateAppearance({
                        chatBackground: { type: 'color', value: '#f5f6f8', opacity: 1, blur: 0 },
                        messageBubbles: {
                            borderRadius: 12,
                            fontSize: 14,
                            outgoingColor: '#c6e9c6',
                            incomingColor: '#ffffff',
                            outgoingTextColor: '#2d3748',
                            incomingTextColor: '#2d3748',
                        },
                        compactMode: false,
                        showAvatars: true,
                        showTimeStamps: true,
                        showTails: true,
                    });
                    toast.success('Настройки сброшены');
                }}
                className="w-full gap-2"
            >
                <RotateCcw className="h-4 w-4" />
                Сбросить к стандартным
            </Button>
        </div>
    );
}

/** Reusable color picker with presets + custom */
function ColorPicker({ presets, value, onChange }: {
    presets: string[];
    value: string;
    onChange: (color: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {presets.map((color) => (
                <button
                    key={color}
                    onClick={() => onChange(color)}
                    className={cn(
                        'h-8 w-8 rounded-full border-2 transition-all duration-200 hover:scale-110',
                        value === color
                            ? 'border-tg-primary scale-110 ring-2 ring-tg-primary/30'
                            : 'border-border'
                    )}
                    style={{ backgroundColor: color }}
                />
            ))}
            <label
                className="h-8 w-8 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-tg-primary/50 transition-colors"
                title="Свой цвет"
            >
                <input
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="sr-only"
                />
                <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
            </label>
        </div>
    );
}

/** Toggle row with icon */
function ToggleRow({ icon: Icon, label, description, checked, onChange }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between py-2">
            <div className="flex items-start gap-3">
                <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                    <span className="text-sm font-medium">{label}</span>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </div>
            <Switch checked={checked} onCheckedChange={onChange} className="shrink-0 ml-3" />
        </div>
    );
}
