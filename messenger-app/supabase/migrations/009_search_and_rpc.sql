-- 009_search_and_rpc.sql
-- Full-text search for messages + RPC for last messages per chat

-- 1. Full-text search vector (Russian config) with GIN index
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('russian', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_messages_search
    ON messages USING GIN (search_vector);

-- 2. RPC: get exactly one last non-deleted message per chat (replaces heuristic LIMIT)
CREATE OR REPLACE FUNCTION get_last_messages(p_chat_ids UUID[])
RETURNS TABLE (
    id UUID,
    chat_id UUID,
    sender_id UUID,
    type TEXT,
    content TEXT,
    media_url TEXT,
    created_at TIMESTAMPTZ,
    sender_username TEXT,
    sender_first_name TEXT
) AS $$
    SELECT DISTINCT ON (m.chat_id)
        m.id,
        m.chat_id,
        m.sender_id,
        m.type,
        m.content,
        m.media_url,
        m.created_at,
        u.username AS sender_username,
        u.first_name AS sender_first_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.chat_id = ANY(p_chat_ids)
      AND m.is_deleted = false
    ORDER BY m.chat_id, m.created_at DESC;
$$ LANGUAGE sql STABLE;

-- 3. RPC: load messages around a specific message (for search jump-to-message)
CREATE OR REPLACE FUNCTION get_messages_around(
    p_chat_id UUID,
    p_message_id UUID,
    p_count INT DEFAULT 25
)
RETURNS TABLE (
    id UUID,
    chat_id UUID,
    sender_id UUID,
    type TEXT,
    content TEXT,
    media_url TEXT,
    media_metadata JSONB,
    reply_to_id UUID,
    forwarded_from_chat_id UUID,
    forwarded_from_message_id UUID,
    is_edited BOOLEAN,
    is_pinned BOOLEAN,
    is_deleted BOOLEAN,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    target_ts TIMESTAMPTZ;
BEGIN
    SELECT m.created_at INTO target_ts
    FROM messages m
    WHERE m.id = p_message_id AND m.chat_id = p_chat_id;

    IF target_ts IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY (
        -- Messages before (older)
        (SELECT m.id, m.chat_id, m.sender_id, m.type, m.content, m.media_url,
                m.media_metadata, m.reply_to_id, m.forwarded_from_chat_id,
                m.forwarded_from_message_id, m.is_edited, m.is_pinned,
                m.is_deleted, m.metadata, m.created_at, m.updated_at
         FROM messages m
         WHERE m.chat_id = p_chat_id AND m.is_deleted = false
           AND m.created_at <= target_ts
         ORDER BY m.created_at DESC
         LIMIT p_count)
        UNION ALL
        -- Messages after (newer)
        (SELECT m.id, m.chat_id, m.sender_id, m.type, m.content, m.media_url,
                m.media_metadata, m.reply_to_id, m.forwarded_from_chat_id,
                m.forwarded_from_message_id, m.is_edited, m.is_pinned,
                m.is_deleted, m.metadata, m.created_at, m.updated_at
         FROM messages m
         WHERE m.chat_id = p_chat_id AND m.is_deleted = false
           AND m.created_at > target_ts
         ORDER BY m.created_at ASC
         LIMIT p_count)
    ) ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;
