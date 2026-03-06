-- ============================================================
-- Migration 006: Admin Rights & Custom Titles
-- ============================================================

-- 1. Add role column (owner, admin, member)
ALTER TABLE chat_participants
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member';

-- Add constraint separately (IF NOT EXISTS not supported for CHECK)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chat_participants_role_check'
    ) THEN
        ALTER TABLE chat_participants
        ADD CONSTRAINT chat_participants_role_check
        CHECK (role IN ('owner', 'admin', 'member'));
    END IF;
END $$;

-- 2. Custom admin title (e.g. "майонез дуче")
ALTER TABLE chat_participants
ADD COLUMN IF NOT EXISTS title VARCHAR(64) DEFAULT NULL;

-- 3. Granular admin rights as JSONB
ALTER TABLE chat_participants
ADD COLUMN IF NOT EXISTS admin_rights JSONB DEFAULT NULL;

-- 4. Ban tracking
ALTER TABLE chat_participants
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

ALTER TABLE chat_participants
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE chat_participants
ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES users(id) DEFAULT NULL;

-- 5. Set existing owners based on chats.created_by
UPDATE chat_participants cp
SET role = 'owner'
FROM chats c
WHERE cp.chat_id = c.id
  AND cp.user_id = c.created_by
  AND (cp.role = 'member' OR cp.role IS NULL);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_chat_participants_role ON chat_participants(chat_id, role);
CREATE INDEX IF NOT EXISTS idx_chat_participants_banned ON chat_participants(is_banned) WHERE is_banned = true;
