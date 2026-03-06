import { supabase } from './supabase.js';

export interface AdminRights {
    can_change_info: boolean;
    can_delete_messages: boolean;
    can_ban_users: boolean;
    can_invite_users: boolean;
    can_pin_messages: boolean;
    can_promote_members: boolean;
    can_manage_voice_channels: boolean;
}

export interface ParticipantInfo {
    user_id: string;
    role: string;
    title: string | null;
    admin_rights: AdminRights | null;
    is_banned: boolean;
}

/** Fetch a participant's role and admin_rights from the DB */
export async function getParticipantInfo(
    chatId: string,
    userId: string
): Promise<ParticipantInfo | null> {
    const { data, error } = await supabase
        .from('chat_participants')
        .select('user_id, role, title, admin_rights, is_banned')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .single();

    if (error || !data) return null;
    return data as ParticipantInfo;
}

/** Check if a user has a specific admin right */
export function hasRight(
    participant: ParticipantInfo,
    right: keyof AdminRights
): boolean {
    if (participant.role === 'owner') return true;
    if (participant.role === 'admin' && participant.admin_rights) {
        return participant.admin_rights[right] === true;
    }
    return false;
}

/** Check if userA can promote/demote userB */
export function canPromote(
    actor: ParticipantInfo,
    target: ParticipantInfo
): boolean {
    if (!hasRight(actor, 'can_promote_members')) return false;
    if (target.role === 'owner') return false;
    // Admins cannot change other admins (only owner can)
    if (actor.role === 'admin' && target.role === 'admin') return false;
    return true;
}

function roleWeight(role: string): number {
    switch (role) {
        case 'owner': return 3;
        case 'admin': return 2;
        case 'member': return 1;
        default: return 0;
    }
}

/** Check if actor outranks target */
export function outranks(
    actor: ParticipantInfo,
    target: ParticipantInfo
): boolean {
    return roleWeight(actor.role) > roleWeight(target.role);
}
