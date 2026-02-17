import { api } from './client';
import type { UserProfile } from '@/types';

export async function getUserById(userId: string): Promise<UserProfile> {
    const data = await api.get<{ user: UserProfile }>(`/users/id/${userId}`);
    return data.user;
}
