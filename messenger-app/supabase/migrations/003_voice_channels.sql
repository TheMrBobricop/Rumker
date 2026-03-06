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

-- Voice channel participants (who is currently in a voice channel)
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
