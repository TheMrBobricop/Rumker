-- Create missing tables before adding indexes

-- message_reads: tracks per-user read position in each chat
CREATE TABLE IF NOT EXISTS message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, chat_id)
);

-- Performance indexes for common query patterns
-- These indexes significantly speed up the most frequently used queries

-- Messages: used by GET /:chatId/messages, unread counts, pinned, media, search
CREATE INDEX IF NOT EXISTS idx_messages_chat_deleted_created
    ON messages (chat_id, is_deleted, created_at DESC);

-- Messages: used by unread count queries (filter by sender + timestamp)
CREATE INDEX IF NOT EXISTS idx_messages_chat_deleted_sender_created
    ON messages (chat_id, is_deleted, sender_id, created_at);

-- Messages: pinned messages lookup
CREATE INDEX IF NOT EXISTS idx_messages_chat_pinned
    ON messages (chat_id, is_pinned) WHERE is_pinned = true;

-- Chat participants: composite index for membership checks (used on nearly every API call)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_participants_chat_user
    ON chat_participants (chat_id, user_id);

-- Chat participants: lookup by user (used by GET /chats to find user's chats)
CREATE INDEX IF NOT EXISTS idx_chat_participants_user
    ON chat_participants (user_id);

-- Message reactions: batch fetch by message
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
    ON message_reactions (message_id);

-- Message reads: lookup by user + chat (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reads_user_chat
    ON message_reads (user_id, chat_id);

-- Friend requests: lookup by sender/receiver + status
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_status
    ON friend_requests (sender_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_status
    ON friend_requests (receiver_id, status);

-- Poll votes: batch fetch by poll
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll
    ON poll_votes (poll_id);

-- Sessions: lookup by token_hash (used by refresh endpoint)
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
    ON sessions (token_hash);

-- Voice channel participants: lookup by channel and user
CREATE INDEX IF NOT EXISTS idx_voice_channel_participants_channel
    ON voice_channel_participants (channel_id);
CREATE INDEX IF NOT EXISTS idx_voice_channel_participants_user
    ON voice_channel_participants (user_id);
