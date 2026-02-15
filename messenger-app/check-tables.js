import { supabase } from './server/lib/supabase.ts';

async function checkTables() {
  try {
    console.log('Checking tables in Supabase...');
    
    // Проверяем все таблицы
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
    
    if (tablesError) {
      console.error('Error getting tables:', tablesError);
      return;
    }
    
    console.log('Available tables:', tables?.map(t => t.table_name) || 'None');
    
    // Проверяем пользователей
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (usersError) {
      console.error('Users table error:', usersError);
    } else {
      console.log('Users table exists');
    }
    
  } catch (err) {
    console.error('Check failed:', err);
  }
}

checkTables();
