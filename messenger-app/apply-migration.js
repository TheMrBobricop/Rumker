import { supabase } from './server/lib/supabase.ts';
import fs from 'fs';
import path from 'path';

async function applyMigration() {
  try {
    console.log('Applying migration...');
    
    // Читаем файл миграции
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/001_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Migration SQL loaded, length:', migrationSQL.length);
    
    // Разделяем SQL на отдельные запросы
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log('Found', statements.length, 'SQL statements');
    
    // Выполняем каждый запрос
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        
        // Используем прямой SQL через raw query
        const { error } = await supabase
          .rpc('exec', { sql: statement });
        
        if (error) {
          console.error(`Error in statement ${i + 1}:`, error);
          console.log('Statement:', statement.substring(0, 100) + '...');
        } else {
          console.log(`Statement ${i + 1} executed successfully`);
        }
      }
    }
    
    console.log('Migration completed!');
    
    // Проверяем результат
    const { data: tables, error: tablesError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (tablesError) {
      console.error('Still error accessing users:', tablesError);
    } else {
      console.log('✅ Users table is now accessible!');
    }
    
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

applyMigration();
