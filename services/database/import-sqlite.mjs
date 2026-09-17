// One-time, offline import of a consistent legacy backup. Never run against a live writer.
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { openPool, transaction } from './pool.mjs';
import { migrate } from './migrate.mjs';
export const tables = [
  'players',
  'subscribers',
  'results',
  'score_cache',
  'limits',
  'settings',
];
export async function importSqlite(pool, filename) {
  const source = new DatabaseSync(filename, { readOnly: true });
  try {
    await migrate(pool);
    return await transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(734926111)');
      // Import only into a fresh target; never overwrite newer PostgreSQL writes.
      for (const table of tables) {
        if (
          (await client.query(`SELECT 1 FROM corporate_bs.${table} LIMIT 1`))
            .rowCount
        )
          throw new Error(`Target table is not empty: ${table}`);
      }
      const counts = {};
      for (const table of tables) {
        const rows = source.prepare(`SELECT * FROM ${table}`).all();
        for (const row of rows) {
          const columns = Object.keys(row);
          if (!columns.every((c) => /^[a-z_]+$/.test(c)))
            throw new Error('Invalid source column');
          await client.query(
            `INSERT INTO corporate_bs.${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(',')})`,
            Object.values(row),
          );
        }
        counts[table] = rows.length;
        const count = Number(
          (await client.query(`SELECT count(*) n FROM corporate_bs.${table}`))
            .rows[0].n,
        );
        if (count !== rows.length)
          throw new Error(`Import count mismatch: ${table}`);
      }
      return counts;
    });
  } finally {
    source.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.argv[2])
    throw new Error(
      'Usage: node services/database/import-sqlite.mjs /path/to/offline-backup.sqlite',
    );
  const pool = openPool();
  try {
    console.log(JSON.stringify(await importSqlite(pool, process.argv[2])));
  } finally {
    await pool.end();
  }
}
