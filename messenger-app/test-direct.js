import { supabase } from './server/lib/supabase.ts';

async function testDirectQuery() {
  try {
    console.log('Testing direct query...');
    
    // Пробуем простой запрос
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Direct query error:', error);
      
      // Пробуем создать пользователя напрямую
      const { data: insertData, error: insertError } = await supabase
        .from('users')
        .insert({
          username: 'test_user',
          email: 'test@example.com',
          password_hash: 'test_hash',
          first_name: 'Test',
          last_name: 'User'
        })
        .select();
      
      if (insertError) {
        console.error('Insert error:', insertError);
      } else {
        console.log('Insert successful:', insertData);
      }
    } else {
      console.log('Query successful:', data);
    }
    
  } catch (err) {
    console.error('Test failed:', err);
  }
}

testDirectQuery();
