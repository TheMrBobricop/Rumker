import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnimatedMount, ANIM_MODAL, ANIM_BACKDROP } from '@/lib/hooks/useAnimatedMount';

interface PollCreatorProps {
    open: boolean;
    onClose: () => void;
    onCreatePoll: (data: {
        question: string;
        options: string[];
        isAnonymous: boolean;
        isMultipleChoice: boolean;
    }) => void;
}

export function PollCreator({ open, onClose, onCreatePoll }: PollCreatorProps) {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [isMultipleChoice, setIsMultipleChoice] = useState(false);
    const { mounted: backdropMounted, className: backdropClass } = useAnimatedMount(open, ANIM_BACKDROP);
    const { mounted: modalMounted, className: modalClass } = useAnimatedMount(open, ANIM_MODAL);

    if (!backdropMounted && !modalMounted) return null;

    const handleAddOption = () => {
        if (options.length < 10) {
            setOptions([...options, '']);
        }
    };

    const handleRemoveOption = (index: number) => {
        if (options.length > 2) {
            setOptions(options.filter((_, i) => i !== index));
        }
    };

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleSubmit = () => {
        const validOptions = options.filter(o => o.trim());
        if (!question.trim() || validOptions.length < 2) return;
        onCreatePoll({
            question: question.trim(),
            options: validOptions,
            isAnonymous,
            isMultipleChoice,
        });
        // Reset
        setQuestion('');
        setOptions(['', '']);
        setIsAnonymous(false);
        setIsMultipleChoice(false);
        onClose();
    };

    const isValid = question.trim() && options.filter(o => o.trim()).length >= 2;

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${backdropClass}`} onClick={onClose}>
            <div
                className={`bg-card rounded-xl mx-4 max-w-md w-full shadow-xl ${modalClass} overflow-hidden`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="text-lg font-semibold text-foreground">Создать опрос</h3>
                    <button
                        onClick={onClose}
                        className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Question */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground block mb-1.5">Вопрос</label>
                        <input
                            type="text"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Задайте вопрос..."
                            className="w-full px-3 py-2.5 rounded-lg bg-muted text-foreground border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            autoFocus
                        />
                    </div>

                    {/* Options */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground block mb-1.5">Варианты ответа</label>
                        <div className="space-y-2">
                            {options.map((option, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={option}
                                        onChange={(e) => handleOptionChange(index, e.target.value)}
                                        placeholder={`Вариант ${index + 1}`}
                                        className="flex-1 px-3 py-2 rounded-lg bg-muted text-foreground border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                    {options.length > 2 && (
                                        <button
                                            onClick={() => handleRemoveOption(index)}
                                            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full hover:bg-red-500/10 text-red-500 transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {options.length < 10 && (
                            <button
                                onClick={handleAddOption}
                                className="flex items-center gap-2 mt-2 text-sm text-primary hover:text-primary/80 transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                                Добавить вариант
                            </button>
                        )}
                    </div>

                    {/* Flags */}
                    <div className="space-y-3 pt-1">
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-sm text-foreground">Анонимное голосование</span>
                            <ToggleSwitch checked={isAnonymous} onChange={setIsAnonymous} />
                        </label>
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-sm text-foreground">Несколько ответов</span>
                            <ToggleSwitch checked={isMultipleChoice} onChange={setIsMultipleChoice} />
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 text-sm rounded-lg hover:bg-muted transition-colors text-foreground"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid}
                        className={cn(
                            "flex-1 py-2.5 text-sm rounded-lg transition-colors font-medium",
                            isValid
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                        )}
                    >
                        Создать
                    </button>
                </div>
            </div>
        </div>
    );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                checked ? "bg-primary" : "bg-muted-foreground/30"
            )}
        >
            <span
                className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                    checked ? "translate-x-[18px]" : "translate-x-[3px]"
                )}
            />
        </button>
    );
}
