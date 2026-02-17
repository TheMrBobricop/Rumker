/**
 * Print instructions for fixing DB constraints on startup.
 * Direct pg connection doesn't work with Supabase from most networks,
 * so we just log the SQL for the user to run in Supabase SQL Editor.
 */
export async function runStartupMigrations(): Promise<void> {
    console.log('');
    console.log('=== DB Setup: Run this SQL in Supabase SQL Editor if voice/video fails ===');
    console.log(`
-- Allow all message types
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check
CHECK (type IN ('text', 'image', 'video', 'voice', 'sticker', 'file', 'audio'));
    `.trim());
    console.log('========================================================================');
    console.log('');
}
