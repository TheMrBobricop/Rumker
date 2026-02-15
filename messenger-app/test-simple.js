import { supabase } from './server/lib/supabase.ts';

async function createSimpleUser() {
  try {
    console.log('Creating simple user to test table creation...');
    
    // Попробуем создать пользователя - это может создать таблицу если её нет
    const { data, error } = await supabase
      .from('users')
      .insert({
        username: 'admin',
        email: 'admin@test.com',
        password: 'test123',
        first_name: 'Admin',
        last_name: 'User'
      })
      .select();
    
    if (error) {
      console.error('Error creating user:', error);
      
      // Если таблица не существует, попробуем создать её через service role
      if (error.message?.includes('does not exist') || error.code === 'PGRST205') {
        console.log('Table does not exist. Please create tables manually in Supabase Dashboard.');
        console.log('Go to: https://banywouzalejioctaxqi.supabase.co/project/sql');
        console.log('And run the SQL from: supabase/migrations/001_initial_schema.sql');
      }
    } else {
      console.log('✅ User created successfully:', data);
    }
    
  } catch (err) {
    console.error('Test failed:', err);
  }
}

createSimpleUser();
