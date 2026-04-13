import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Smile, TreePine, UtensilsCrossed, Plane, Dumbbell, Lightbulb, Hash, Flag, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Sticker } from '@/types';

interface EmojiPickerProps {
    anchorRef: React.RefObject<HTMLElement | null>;
    onEmojiSelect: (emoji: string) => void;
    onStickerSelect: (sticker: Sticker) => void;
    onClose: () => void;
}

// ─── Emoji Data ──────────────────────────────────────────────────────

const EMOJI_CATEGORIES = [
    { key: 'recent', label: 'Недавние', icon: Clock },
    { key: 'smileys', label: 'Смайлы', icon: Smile },
    { key: 'people', label: 'Люди', icon: Smile },
    { key: 'animals', label: 'Животные', icon: TreePine },
    { key: 'food', label: 'Еда', icon: UtensilsCrossed },
    { key: 'travel', label: 'Путешествия', icon: Plane },
    { key: 'activity', label: 'Активность', icon: Dumbbell },
    { key: 'objects', label: 'Объекты', icon: Lightbulb },
    { key: 'symbols', label: 'Символы', icon: Hash },
    { key: 'flags', label: 'Флаги', icon: Flag },
] as const;

const EMOJI_DATA: Record<string, string[]> = {
    smileys: [
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊',
        '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋',
        '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡',
        '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬',
        '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
        '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸',
        '😎', '🤓', '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯', '😲',
        '😳', '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭',
        '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡',
        '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺',
        '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽',
    ],
    people: [
        '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
        '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
        '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
        '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅',
        '🤳', '💪', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁',
        '🦷', '🦴', '👀', '👁️', '👅', '👄', '🫦', '👶', '🧒', '👦',
    ],
    animals: [
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨',
        '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒',
        '🐔', '🐧', '🐦', '🐤', '🐣', '🦆', '🦅', '🦉', '🦇', '🐺',
        '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜',
        '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎',
        '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🪸', '🐡', '🐠',
    ],
    food: [
        '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
        '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑',
        '🫛', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄',
        '🧅', '🥔', '🍠', '🫘', '🥐', '🥖', '🍞', '🥨', '🥯', '🧀',
        '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴',
        '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯',
    ],
    travel: [
        '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
        '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🛼',
        '✈️', '🛩️', '🚀', '🛸', '🚁', '⛵', '🚢', '🗼', '🗽', '🏰',
        '🏯', '🏟️', '🎡', '🎢', '🗿', '🌍', '🌎', '🌏', '🌋', '🗻',
        '🏕️', '🏖️', '🏜️', '🏝️', '🌄', '🌅', '🌆', '🌇', '🌉', '🌌',
    ],
    activity: [
        '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
        '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
        '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷',
        '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤸', '🤼', '🤽',
        '🧗', '🤺', '🏄', '🚣', '🧘', '🎪', '🎭', '🎨', '🎬', '🎤',
        '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🎻',
    ],
    objects: [
        '⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '💽', '💾',
        '💿', '📀', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️',
        '📺', '📻', '🎙️', '🔔', '🔕', '📢', '📣', '⏰', '⏱️', '⏲️',
        '🕰️', '💡', '🔦', '🕯️', '🧯', '🛒', '💰', '💳', '💎', '⚖️',
        '🔧', '🔨', '🛠️', '⛏️', '🔩', '⚙️', '🧲', '🔬', '🔭', '📡',
        '💊', '💉', '🩸', '🩹', '🩺', '🔑', '🗝️', '🚪', '🛋️', '🪑',
    ],
    symbols: [
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
        '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '❣️',
        '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️',
        '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎',
        '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️',
        '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮',
        '✅', '❌', '❓', '❗', '‼️', '⁉️', '💯', '🔥', '💫', '⭐',
    ],
    flags: [
        '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️',
        '🇷🇺', '🇺🇸', '🇬🇧', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇯🇵',
        '🇰🇷', '🇨🇳', '🇧🇷', '🇦🇷', '🇲🇽', '🇮🇳', '🇹🇷', '🇦🇺',
        '🇨🇦', '🇵🇱', '🇺🇦', '🇳🇱', '🇧🇪', '🇸🇪', '🇳🇴', '🇫🇮',
    ],
};

// Simple keyword map for search
const EMOJI_KEYWORDS: Record<string, string[]> = {
    '😀': ['smile', 'happy', 'улыбка'], '😂': ['laugh', 'cry', 'смех'], '❤️': ['heart', 'love', 'сердце', 'любовь'],
    '👍': ['thumb', 'like', 'лайк', 'палец'], '🔥': ['fire', 'hot', 'огонь'], '😭': ['cry', 'sad', 'плакать'],
    '🥰': ['love', 'hearts', 'любовь'], '😍': ['love', 'eyes', 'глаза'], '🤔': ['think', 'думать'],
    '👋': ['wave', 'hi', 'привет'], '🙏': ['pray', 'please', 'молить'], '💀': ['skull', 'dead', 'череп'],
    '😎': ['cool', 'sun', 'крутой'], '🤣': ['rofl', 'laugh', 'ржать'], '😊': ['smile', 'blush', 'стесняться'],
    '💯': ['hundred', 'perfect', 'сотка'], '🎉': ['party', 'celebrate', 'праздник'], '😢': ['cry', 'sad', 'грустный'],
    '😮': ['wow', 'surprise', 'удивление'], '🤗': ['hug', 'обнять'], '😘': ['kiss', 'поцелуй'],
};

// Demo stickers (large emoji characters)
const DEMO_STICKERS: Sticker[] = [
    '😀', '😎', '🥰', '😤', '🤯', '🥳', '😈', '🤖', '👻', '💀',
    '🐶', '🐱', '🦊', '🐻', '🐼', '🦄', '🐸', '🦋', '🌸', '🌈',
    '🔥', '💎', '⭐', '🎉', '🎸', '🎨', '🏆', '💪', '👑', '🦸',
    '❤️', '💔', '💕', '🖤', '💜', '💙', '💚', '💛', '🧡', '🤍',
].map((emoji, i) => ({
    id: `sticker-${i}`,
    emoji,
    imageUrl: '',
    packId: 'demo',
}));

const RECENT_KEY = 'rumker-recent-emojis';
const MAX_RECENT = 24;

function getRecentEmojis(): string[] {
    try {
        const stored = localStorage.getItem(RECENT_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function addRecentEmoji(emoji: string) {
    const recent = getRecentEmojis().filter(e => e !== emoji);
    recent.unshift(emoji);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function EmojiPicker({ anchorRef, onEmojiSelect, onStickerSelect, onClose }: EmojiPickerProps) {
    const [activeTab, setActiveTab] = useState<'emoji' | 'sticker'>('emoji');
    const [activeCategory, setActiveCategory] = useState('smileys');
    const [search, setSearch] = useState('');
    const [recentEmojis, setRecentEmojis] = useState<string[]>(getRecentEmojis);
    const pickerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const isMobile = window.innerWidth < 640;

    // Position the picker
    const [position, setPosition] = useState({ bottom: 60, right: 16 });

    useEffect(() => {
        if (anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            if (isMobile) {
                setPosition({ bottom: window.innerHeight - rect.top + 8, right: 0 });
            } else {
                setPosition({
                    bottom: window.innerHeight - rect.top + 8,
                    right: Math.max(16, window.innerWidth - rect.right - 160),
                });
            }
        }
    }, [anchorRef, isMobile]);

    // Close on click outside / Escape
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
                anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose, anchorRef]);

    const handleEmojiClick = useCallback((emoji: string) => {
        addRecentEmoji(emoji);
        setRecentEmojis(getRecentEmojis());
        onEmojiSelect(emoji);
    }, [onEmojiSelect]);

    // Filter emojis by search
    const filteredEmojis = search.trim()
        ? Object.values(EMOJI_DATA).flat().filter(emoji => {
            const keywords = EMOJI_KEYWORDS[emoji] || [];
            const q = search.toLowerCase();
            return emoji.includes(q) || keywords.some(k => k.includes(q));
        })
        : null;

    const scrollToCategory = (key: string) => {
        setActiveCategory(key);
        const el = document.getElementById(`emoji-cat-${key}`);
        if (el && scrollRef.current) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const content = (
        <div
            ref={pickerRef}
            className={cn(
                "fixed z-[90] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-picker-slide-up",
                isMobile ? "left-2 right-2 max-h-[50vh]" : "w-[360px] max-w-[90vw] max-h-[420px]"
            )}
            style={isMobile ? { bottom: position.bottom } : { bottom: position.bottom, right: position.right }}
        >
            {/* Tabs: Emoji / Sticker */}
            <div className="flex border-b border-border shrink-0">
                <button
                    onClick={() => setActiveTab('emoji')}
                    className={cn(
                        "flex-1 py-2 text-xs font-medium transition-colors",
                        activeTab === 'emoji' ? 'text-tg-primary border-b-2 border-tg-primary' : 'text-muted-foreground'
                    )}
                >
                    Эмодзи
                </button>
                <button
                    onClick={() => setActiveTab('sticker')}
                    className={cn(
                        "flex-1 py-2 text-xs font-medium transition-colors",
                        activeTab === 'sticker' ? 'text-tg-primary border-b-2 border-tg-primary' : 'text-muted-foreground'
                    )}
                >
                    Стикеры
                </button>
            </div>

            {activeTab === 'emoji' ? (
                <>
                    {/* Search */}
                    <div className="px-3 py-2 shrink-0">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Поиск..."
                                className="w-full bg-muted rounded-lg pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-tg-primary/30"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Category strip */}
                    {!search && (
                        <div className="flex items-center gap-0.5 px-2 pb-1 shrink-0 overflow-x-auto scrollbar-thin">
                            {EMOJI_CATEGORIES.map(cat => {
                                const Icon = cat.icon;
                                return (
                                    <button
                                        key={cat.key}
                                        onClick={() => scrollToCategory(cat.key)}
                                        className={cn(
                                            "h-7 w-7 shrink-0 flex items-center justify-center rounded transition-colors",
                                            activeCategory === cat.key ? 'bg-tg-primary/10 text-tg-primary' : 'text-muted-foreground hover:text-foreground'
                                        )}
                                        title={cat.label}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Emoji grid */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2">
                        {filteredEmojis ? (
                            <div className="grid grid-cols-8 gap-0.5">
                                {filteredEmojis.map((emoji, i) => (
                                    <button
                                        key={`search-${i}`}
                                        onClick={() => handleEmojiClick(emoji)}
                                        className="h-9 w-full flex items-center justify-center rounded hover:bg-muted text-xl transition-colors active:scale-110"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                                {filteredEmojis.length === 0 && (
                                    <div className="col-span-8 text-center text-xs text-muted-foreground py-8">
                                        Ничего не найдено
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Recent */}
                                {recentEmojis.length > 0 && (
                                    <div id="emoji-cat-recent" className="mb-2">
                                        <div className="text-[10px] text-muted-foreground font-medium px-1 py-1">Недавние</div>
                                        <div className="grid grid-cols-8 gap-0.5">
                                            {recentEmojis.map((emoji, i) => (
                                                <button
                                                    key={`recent-${i}`}
                                                    onClick={() => handleEmojiClick(emoji)}
                                                    className="h-9 w-full flex items-center justify-center rounded hover:bg-muted text-xl transition-colors active:scale-110"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Categories */}
                                {Object.entries(EMOJI_DATA).map(([key, emojis]) => {
                                    const cat = EMOJI_CATEGORIES.find(c => c.key === key);
                                    return (
                                        <div key={key} id={`emoji-cat-${key}`} className="mb-2">
                                            <div className="text-[10px] text-muted-foreground font-medium px-1 py-1">
                                                {cat?.label || key}
                                            </div>
                                            <div className="grid grid-cols-8 gap-0.5">
                                                {emojis.map((emoji, i) => (
                                                    <button
                                                        key={`${key}-${i}`}
                                                        onClick={() => handleEmojiClick(emoji)}
                                                        className="h-9 w-full flex items-center justify-center rounded hover:bg-muted text-xl transition-colors active:scale-110"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </>
            ) : (
                /* Sticker grid */
                <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
                    <div className="grid grid-cols-4 gap-2">
                        {DEMO_STICKERS.map(sticker => (
                            <button
                                key={sticker.id}
                                onClick={() => onStickerSelect(sticker)}
                                className="aspect-square flex items-center justify-center rounded-xl hover:bg-muted transition-colors text-5xl active:scale-95"
                            >
                                {sticker.emoji}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(content, document.body);
}
