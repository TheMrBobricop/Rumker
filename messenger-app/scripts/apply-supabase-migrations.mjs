import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.SUPABASE_DATABASE_URL;
if (!dbUrl) {
  console.error('Missing SUPABASE_DATABASE_URL in .env');
  process.exit(1);
}

const migrationsDir = path.resolve(__dirname, '../supabase/migrations');

const checks = {
  '001_initial_schema.sql': async (client) => {
    const { rows } = await client.query("SELECT to_regclass('public.users') AS t");
    return rows[0]?.t !== null;
  },
  '002_add_forward_fields.sql': async (client) => {
    const { rows } = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='forwarded_from_id' LIMIT 1"
    );
    return rows.length > 0;
  },
  '003_voice_channels.sql': async (client) => {
    const { rows } = await client.query("SELECT to_regclass('public.voice_channels') AS t");
    return rows[0]?.t !== null;
  },
  '004_polls_location_contact.sql': async (client) => {
    const { rows } = await client.query("SELECT to_regclass('public.polls') AS t");
    return rows[0]?.t !== null;
  },
  '005_message_reactions.sql': async (client) => {
    const { rows } = await client.query("SELECT to_regclass('public.message_reactions') AS t");
    return rows[0]?.t !== null;
  },
  '006_admin_rights.sql': async (client) => {
    const { rows } = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_participants' AND column_name='admin_rights' LIMIT 1"
    );
    return rows.length > 0;
  },
  '007_performance_indexes.sql': async (client) => {
    const { rows } = await client.query("SELECT to_regclass('public.message_reads') AS t");
    return rows[0]?.t !== null;
  },
  '008_privacy_settings.sql': async (client) => {
    const { rows } = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='privacy_settings' LIMIT 1"
    );
    return rows.length > 0;
  },
  '008_soundboard.sql': async (client) => {
    const { rows } = await client.query("SELECT to_regclass('public.soundboard_sounds') AS t");
    return rows[0]?.t !== null;
  },
};

async function ensureBucket(client) {
  const bucketId = 'chat-media';
  const { rows } = await client.query('SELECT id, public FROM storage.buckets WHERE id = $1', [bucketId]);
  if (rows.length === 0) {
    await client.query('INSERT INTO storage.buckets (id, name, public) VALUES ($1, $1, true)', [bucketId]);
    console.log('Created public storage bucket:', bucketId);
  } else if (rows[0].public !== true) {
    await client.query('UPDATE storage.buckets SET public = true WHERE id = $1', [bucketId]);
    console.log('Updated storage bucket to public:', bucketId);
  } else {
    console.log('Storage bucket ok:', bucketId);
  }
}

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const check = checks[file];
    if (check) {
      const already = await check(client);
      if (already) {
        console.log('Skip (already applied):', file);
        continue;
      }
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    console.log('Apply:', file);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Migration failed:', file);
      throw err;
    }
  }

  await ensureBucket(client);
  await client.end();
  console.log('Supabase migrations complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
