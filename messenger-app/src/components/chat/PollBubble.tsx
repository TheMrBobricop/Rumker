import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Check, Lock, BarChart3, Circle, Square } from 'lucide-react';
import type { PollData } from '@/types';
import { votePoll, closePoll } from '@/lib/api/polls';
import { useAuthStore } from '@/stores/authStore';

interface PollBubbleProps {
    pollData: PollData;
    isMe: boolean;
    onPollUpdate?: (pollData: PollData) => void;
}

/** Russian plural for "голос" */
function pluralVotes(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'голос';
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'голоса';
    return 'голосов';
}

export function PollBubble({ pollData, isMe, onPollUpdate }: PollBubbleProps) {
    const [poll, setPoll] = useState(pollData);
    const [voting, setVoting] = useState(false);
    const currentUserId = useAuthStore((s) => s.user?.id);
    const hasVoted = (poll.votedOptionIds?.length ?? 0) > 0;
    const showResults = hasVoted || poll.isClosed;

    const handleVote = async (optionId: string) => {
        if (poll.isClosed || voting) return;

        setVoting(true);
        try {
            let optionIds: string[];
            if (poll.isMultipleChoice) {
                const current = new Set(poll.votedOptionIds || []);
                if (current.has(optionId)) {
                    current.delete(optionId);
                } else {
                    current.add(optionId);
                }
                optionIds = Array.from(current);
                if (optionIds.length === 0) {
                    setVoting(false);
                    return;
                }
            } else {
                optionIds = [optionId];
            }

            const updated = await votePoll(poll.id, optionIds);
            setPoll(updated);
            onPollUpdate?.(updated);
        } catch (err) {
            console.error('Failed to vote:', err);
        } finally {
            setVoting(false);
        }
    };

    const handleClose = async () => {
        try {
            const updated = await closePoll(poll.id);
            setPoll(updated);
            onPollUpdate?.(updated);
        } catch (err) {
            console.error('Failed to close poll:', err);
        }
    };

    // Update poll when external update comes in (via props)
    useEffect(() => {
        if (pollData.totalVotes !== poll.totalVotes || pollData.isClosed !== poll.isClosed) {
            setPoll(pollData);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pollData.totalVotes, pollData.isClosed]);

    // Find max vote count for highlighting the "winner"
    const maxVotes = Math.max(...poll.options.map(o => o.voterCount), 0);

    return (
        <div className="min-w-[260px] max-w-[340px]">
            {/* Question */}
            <div className="flex items-start gap-2 mb-3">
                <BarChart3 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span className="font-semibold text-sm leading-snug">{poll.question}</span>
            </div>

            {/* Options */}
            <div className="space-y-1.5">
                {poll.options.map((option) => {
                    const isVoted = poll.votedOptionIds?.includes(option.id);
                    const percentage = poll.totalVotes > 0
                        ? Math.round((option.voterCount / poll.totalVotes) * 100)
                        : 0;
                    const isWinner = showResults && option.voterCount > 0 && option.voterCount === maxVotes;

                    if (!showResults) {
                        // ── Before voting: clean option buttons ──
                        return (
                            <button
                                key={option.id}
                                onClick={() => handleVote(option.id)}
                                disabled={poll.isClosed || voting}
                                className={cn(
                                    "w-full text-left rounded-xl border transition-all duration-200",
                                    "px-3.5 py-2.5 text-sm",
                                    "border-primary/30 hover:border-primary/60 hover:bg-primary/5",
                                    "active:scale-[0.98]",
                                    poll.isClosed ? "cursor-default opacity-60" : "cursor-pointer"
                                )}
                            >
                                <div className="flex items-center gap-2.5">
                                    {poll.isMultipleChoice ? (
                                        <Square className="h-4 w-4 text-primary/50 shrink-0" />
                                    ) : (
                                        <Circle className="h-4 w-4 text-primary/50 shrink-0" />
                                    )}
                                    <span className="text-foreground">{option.text}</span>
                                </div>
                            </button>
                        );
                    }

                    // ── After voting: progress bars with results ──
                    return (
                        <div
                            key={option.id}
                            onClick={() => !poll.isClosed && !voting && handleVote(option.id)}
                            className={cn(
                                "relative w-full rounded-xl overflow-hidden transition-all duration-200",
                                "px-3.5 py-2.5 text-sm",
                                !poll.isClosed && "cursor-pointer hover:brightness-95 active:scale-[0.99]",
                                poll.isClosed && "cursor-default"
                            )}
                        >
                            {/* Background progress bar */}
                            <div
                                className={cn(
                                    "absolute inset-y-0 left-0 rounded-xl transition-all duration-700 ease-out",
                                    isVoted
                                        ? "bg-primary/25"
                                        : isWinner
                                            ? "bg-primary/15"
                                            : "bg-muted-foreground/10"
                                )}
                                style={{ width: `${percentage}%` }}
                            />

                            {/* Content */}
                            <div className="relative flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    {isVoted ? (
                                        <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                                            <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                                        </div>
                                    ) : (
                                        <div className="w-4 shrink-0" />
                                    )}
                                    <span className={cn(
                                        "truncate",
                                        isVoted && "font-semibold",
                                        isWinner && !isVoted && "font-medium"
                                    )}>
                                        {option.text}
                                    </span>
                                </div>
                                <span className={cn(
                                    "text-xs shrink-0 font-medium tabular-nums",
                                    isVoted ? "text-primary" : "text-muted-foreground"
                                )}>
                                    {percentage}%
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>
                    {poll.totalVotes} {pluralVotes(poll.totalVotes)}
                    {poll.isAnonymous && ' \u00b7 \u0410\u043d\u043e\u043d\u0438\u043c\u043d\u044b\u0439'}
                    {poll.isMultipleChoice && !poll.isAnonymous && ' \u00b7 \u041d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043e\u0442\u0432\u0435\u0442\u043e\u0432'}
                </span>
                {poll.isClosed && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Закрыт
                    </span>
                )}
                {!poll.isClosed && isMe && poll.createdBy === currentUserId && (
                    <button
                        onClick={handleClose}
                        className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                        Закрыть
                    </button>
                )}
            </div>
        </div>
    );
}
