import { supabase } from './server/lib/supabase.ts';

async function testSupabaseConnection() {
  try {
    console.log('Testing Supabase connection...');
    
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Supabase error:', error);
      return false;
    }
    
    console.log('Supabase connection successful!');
    console.log('Data:', data);
    return true;
  } catch (err) {
    console.error('Connection test failed:', err);
    return false;
  }
}

testSupabaseConnection().then(success => {
  console.log('Test result:', success ? 'SUCCESS' : 'FAILED');
  process.exit(success ? 0 : 1);
});
