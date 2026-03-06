import { createClient } from '@supabase/supabase-js';

const MIGRATION_SQL = `
-- Chats table: add missing columns
ALTER TABLE chats ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar VARCHAR(512) DEFAULT NULL;

-- Allow all chat types (private, group, channel)
ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_type_check;
ALTER TABLE chats ADD CONSTRAINT chats_type_check
CHECK (type IN ('private', 'group', 'channel'));

-- Allow all message types (must match migration 004)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check
CHECK (type IN ('text', 'image', 'video', 'voice', 'sticker', 'file', 'audio', 'reply', 'forward', 'poll', 'location', 'contact'));

-- Message pinning support
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by UUID DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(chat_id, is_pinned) WHERE is_pinned = TRUE;

-- Chat pinning and muting (per-user)
ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- Call history (for logging)
CREATE TABLE IF NOT EXISTS call_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id),
    type VARCHAR(10) NOT NULL DEFAULT 'private',
    initiated_by UUID NOT NULL REFERENCES users(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS call_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES call_history(id),
    user_id UUID NOT NULL REFERENCES users(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ
);

-- Voice channels (Discord-style)
CREATE TABLE IF NOT EXISTS voice_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    category VARCHAR(100) DEFAULT 'general',
    max_participants INTEGER DEFAULT 50,
    is_locked BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_channels_chat ON voice_channels(chat_id);

CREATE TABLE IF NOT EXISTS voice_channel_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES voice_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_muted BOOLEAN DEFAULT FALSE,
    is_deafened BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vcp_channel ON voice_channel_participants(channel_id);
CREATE INDEX IF NOT EXISTS idx_vcp_user ON voice_channel_participants(user_id);
`.trim();

/**
 * Run critical migrations automatically via Supabase RPC,
 * and print full SQL as a fallback for manual execution.
 */
export async function runStartupMigrations(): Promise<void> {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!url || !key) {
        console.warn('[Migrate] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping migrations');
        return;
    }

    const supabase = createClient(url, key);

    // Try to run critical column additions automatically via rpc
    const criticalStatements = [
        'ALTER TABLE chats ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL',
        'ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar VARCHAR(512) DEFAULT NULL',
        'ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE',
        'ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT FALSE',
        'ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS role TEXT DEFAULT \'member\'',
        'ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE',
        'ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ DEFAULT NULL',
        'ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by UUID DEFAULT NULL',
    ];

    let autoMigrateOk = true;
    for (const sql of criticalStatements) {
        try {
            const { error } = await supabase.rpc('exec_sql', { query: sql });
            if (error) {
                // rpc 'exec_sql' may not exist — that's fine, fall back to manual
                autoMigrateOk = false;
                break;
            }
        } catch {
            autoMigrateOk = false;
            break;
        }
    }

    if (autoMigrateOk) {
        console.log('[Migrate] Critical columns verified/added automatically');
    } else {
        console.log('');
        console.log('=== DB Setup: Run this SQL in Supabase SQL Editor ===');
        console.log(MIGRATION_SQL);
        console.log('=======================================================');
        console.log('');
    }
}
