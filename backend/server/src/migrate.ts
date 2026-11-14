import { readFile } from 'node:fs/promises';
import { connectDatabase } from './db.js';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for a development PostgreSQL database.');
const pool = connectDatabase(process.env.DATABASE_URL);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const file of ['001_initial','002_offline_sales','003_password_recovery']) {
    await client.query(await readFile(new URL('../migrations/'+file+'.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(id) VALUES ($1) ON CONFLICT DO NOTHING',[file]);
  }
  await client.query("INSERT INTO schema_migrations(id) VALUES ('001_initial') ON CONFLICT DO NOTHING");
  await client.query('COMMIT');
  console.log('Online schema ready. Existing desktop SQLite was not modified.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
