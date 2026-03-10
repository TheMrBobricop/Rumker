-- Privacy settings column on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{"lastSeen":"everyone","profilePhoto":"everyone","phoneNumber":"contacts","readReceipts":true}'::jsonb;
