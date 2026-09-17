import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openPool, transaction } from './pool.mjs';
export async function migrate(
  pool,
  directory = new URL('./migrations/', import.meta.url),
) {
  // A transaction-scoped lock serializes all startup/CLI runners across replicas.
  return transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(734926110)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS public.games_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const files = (await readdir(directory))
      .filter((f) => /^\d+_[a-z0-9_]+\.sql$/.test(f))
      .sort();
    const applied = (
      await client.query(
        'SELECT name, checksum FROM public.games_migrations ORDER BY name',
      )
    ).rows;
    for (const row of applied)
      if (!files.includes(row.name))
        throw new Error(`Missing applied migration: ${row.name}`);
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = applied.find((row) => row.name === name);
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error(`Changed applied migration: ${name}`);
        continue;
      }
      if (applied.some((row) => row.name > name))
        throw new Error(`Out-of-order migration: ${name}`);
      await client.query(sql);
      await client.query(
        'INSERT INTO public.games_migrations(name, checksum) VALUES ($1,$2)',
        [name, checksum],
      );
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pool = openPool();
  try {
    await migrate(pool);
    console.log('Games migrations applied');
  } finally {
    await pool.end();
  }
}
