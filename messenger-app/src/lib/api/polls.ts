import { api } from './client';
import type { PollData } from '@/types';

export interface CreatePollData {
    chatId: string;
    question: string;
    options: string[];
    isAnonymous?: boolean;
    isMultipleChoice?: boolean;
}

export async function createPoll(data: CreatePollData): Promise<any> {
    return api.post('/polls', data);
}

export async function votePoll(pollId: string, optionIds: string[]): Promise<PollData> {
    return api.post<PollData>(`/polls/${pollId}/vote`, { optionIds });
}

export async function closePoll(pollId: string): Promise<PollData> {
    return api.post<PollData>(`/polls/${pollId}/close`, {});
}

export async function getPoll(pollId: string): Promise<PollData> {
    return api.get<PollData>(`/polls/${pollId}`);
}
