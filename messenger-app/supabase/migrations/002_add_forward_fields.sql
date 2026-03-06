-- Добавление полей для пересылки сообщений
ALTER TABLE messages 
ADD COLUMN forwarded_from_id UUID REFERENCES users(id),
ADD COLUMN forwarded_from_name VARCHAR(255);

-- Добавление полей для закрепленных сообщений
ALTER TABLE messages
ADD COLUMN is_pinned BOOLEAN DEFAULT false,
ADD COLUMN pinned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN pinned_by UUID REFERENCES users(id);

-- Добавление полей для участников чатов
ALTER TABLE chat_participants
ADD COLUMN is_pinned BOOLEAN DEFAULT false,
ADD COLUMN is_muted BOOLEAN DEFAULT false,
ADD COLUMN last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Создание индексов для оптимизации
CREATE INDEX idx_messages_forwarded_from_id ON messages(forwarded_from_id);
CREATE INDEX idx_messages_pinned ON messages(is_pinned);
CREATE INDEX idx_chat_participants_pinned ON chat_participants(is_pinned);
