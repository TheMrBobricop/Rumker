import { supabase } from './server/lib/supabase.ts';

async function createTables() {
  try {
    console.log('Creating tables...');
    
    // Создаем таблицу users
    const { error: usersError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100),
          avatar TEXT,
          is_online BOOLEAN DEFAULT false,
          last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      `
    });
    
    if (usersError) {
      console.error('Error creating users table:', usersError);
    } else {
      console.log('Users table created successfully');
    }
    
    // Создаем таблицу chats
    const { error: chatsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS chats (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name TEXT,
          type VARCHAR(20) NOT NULL CHECK (type IN ('private', 'group')),
          created_by UUID REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type);
        CREATE INDEX IF NOT EXISTS idx_chats_created_by ON chats(created_by);
      `
    });
    
    if (chatsError) {
      console.error('Error creating chats table:', chatsError);
    } else {
      console.log('Chats table created successfully');
    }
    
    // Создаем таблицу chat_participants
    const { error: participantsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS chat_participants (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(chat_id, user_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_chat_participants_chat_id ON chat_participants(chat_id);
        CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON chat_participants(user_id);
      `
    });
    
    if (participantsError) {
      console.error('Error creating chat_participants table:', participantsError);
    } else {
      console.log('Chat_participants table created successfully');
    }
    
    console.log('Tables creation completed!');
    
  } catch (err) {
    console.error('Creation failed:', err);
  }
}

createTables();
