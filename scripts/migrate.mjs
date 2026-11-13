import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

if (!process.env.DATABASE_URL) throw new Error('SplitGo: configure DATABASE_URL.');
const sql = await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8') + '\n' +
  await readFile(new URL('../prisma/constraints.sql', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(81940217)');
  await client.query('CREATE TABLE IF NOT EXISTS splitgo_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const { rows: [existing] } = await client.query('SELECT checksum FROM splitgo_migrations WHERE version = $1', ['001']);
  if (existing && existing.checksum !== checksum) throw new Error('SplitGo: migration 001 alterada após aplicação.');
  if (!existing) {
    await client.query(sql);
    await client.query('INSERT INTO splitgo_migrations(version, checksum) VALUES ($1, $2)', ['001', checksum]);
  }
  await client.query('COMMIT');
  console.log(existing ? 'SplitGo: banco atualizado.' : 'SplitGo: migration 001 aplicada.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { await client.end(); }
