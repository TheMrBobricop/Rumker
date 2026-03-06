// Скрипт для применения миграции к Supabase
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  try {
    console.log('🚀 Applying migration 002_add_forward_fields.sql...');
    
    // Читаем файл миграции
    const migrationSQL = readFileSync('./supabase/migrations/002_add_forward_fields.sql', 'utf8');
    
    console.log('Please run this migration manually in Supabase SQL Editor:');
    console.log('=====================================');
    console.log(migrationSQL);
    console.log('=====================================');
    
  } catch (error) {
    console.error('❌ Error reading migration:', error);
  }
}

applyMigration();
