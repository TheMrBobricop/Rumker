-- Soundboard sounds table
CREATE TABLE IF NOT EXISTS soundboard_sounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT 'default',
    file_url TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soundboard_chat ON soundboard_sounds(chat_id);
CREATE INDEX IF NOT EXISTS idx_soundboard_uploaded_by ON soundboard_sounds(uploaded_by);

-- Soundboard favorites
CREATE TABLE IF NOT EXISTS soundboard_favorites (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sound_id UUID NOT NULL REFERENCES soundboard_sounds(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, sound_id)
);
