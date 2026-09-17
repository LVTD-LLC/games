import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { testDatabase } from '../../tests/database.mjs';
import { openPool } from './pool.mjs';
import { migrate } from './migrate.mjs';
import { openStore } from '../corporate-bs-api/store.mjs';
import { importSqlite } from './import-sqlite.mjs';
test('concurrent migrations run once; edits and failed migrations fail safely', async (t) => {
  const database = await testDatabase();
  const pool = openPool(database.url);
  const dir = await mkdtemp('/tmp/games-migrations-');
  const url = pathToFileURL(dir + '/');
  t.after(async () => {
    await pool.end();
    await database.close();
    await rm(dir, { recursive: true });
  });
  await writeFile(
    dir + '/0001_example.sql',
    'CREATE TABLE example (id integer);',
  );
  await Promise.all([migrate(pool, url), migrate(pool, url)]);
  assert.equal(
    (await pool.query('SELECT * FROM games_migrations')).rowCount,
    1,
  );
  await writeFile(dir + '/0001_example.sql', 'CREATE TABLE example (id text);');
  await assert.rejects(migrate(pool, url), /Changed applied migration/);
  await writeFile(
    dir + '/0001_example.sql',
    'CREATE TABLE example (id integer);',
  );
  await writeFile(
    dir + '/0002_failure.sql',
    'CREATE TABLE rollback_probe(id int); SELECT nonexistent;',
  );
  await assert.rejects(migrate(pool, url));
  assert.equal(
    (await pool.query("SELECT to_regclass('rollback_probe') t")).rows[0].t,
    null,
  );
  assert.equal(
    (await pool.query('SELECT * FROM games_migrations')).rowCount,
    1,
  );
});
test('concurrent budget reservations are atomic and duplicate scores are idempotent', async (t) => {
  const database = await testDatabase();
  const a = await openStore(database.url),
    b = await openStore(database.url);
  t.after(async () => {
    await a.close();
    await b.close();
    await database.close();
  });
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? a : b).allow([['global', 5, 60000]], 1000),
    ),
  );
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(
    await a.allow(
      [
        ['fresh', 1, 60000],
        ['global', 5, 60000],
      ],
      1000,
    ),
    false,
  );
  assert.equal(await b.allow([['fresh', 1, 60000]], 1000), true);
  const player = (await a.session()).player;
  const saved = await Promise.all([
    a.save(player.id, 'same phrase', { score: 50, model: 'test' }),
    b.save(player.id, 'same phrase', { score: 50, model: 'test' }),
  ]);
  assert.equal(saved[0].id, saved[1].id);
});
test('offline SQLite import preserves data and refuses a nonempty target', async (t) => {
  const database = await testDatabase(),
    pool = openPool(database.url),
    dir = await mkdtemp('/tmp/games-import-');
  t.after(async () => {
    await pool.end();
    await database.close();
    await rm(dir, { recursive: true });
  });
  const source = new DatabaseSync(dir + '/backup.sqlite');
  source.exec(`CREATE TABLE players(id TEXT,name TEXT,created_at INTEGER); INSERT INTO players VALUES ('player','Director',123);
 CREATE TABLE subscribers(email TEXT,consent_at INTEGER,consent_version TEXT,unsubscribe_token TEXT); INSERT INTO subscribers VALUES ('test@example.com',123,'v1','unsubscribe');
 CREATE TABLE results(id TEXT,player_id TEXT,phrase TEXT,phrase_hash TEXT,score REAL,rubric TEXT,model TEXT,created_at INTEGER); INSERT INTO results VALUES ('result','player','Legacy phrase','hash',91.3,'v1','model',123);
 CREATE TABLE score_cache(key TEXT,value TEXT); INSERT INTO score_cache VALUES ('cache','{}');
 CREATE TABLE limits(key TEXT,count INTEGER,expires INTEGER); INSERT INTO limits VALUES ('limit',4,9999999999999);
 CREATE TABLE settings(key TEXT,value TEXT); INSERT INTO settings VALUES ('ip_salt','old-salt');`);
  source.close();
  assert.deepEqual(await importSqlite(pool, dir + '/backup.sqlite'), {
    players: 1,
    subscribers: 1,
    results: 1,
    score_cache: 1,
    limits: 1,
    settings: 1,
  });
  assert.equal(
    (await pool.query('SELECT score FROM corporate_bs.results')).rows[0].score,
    91.3,
  );
  assert.equal(
    (await pool.query('SELECT value FROM corporate_bs.settings')).rows[0].value,
    'old-salt',
  );
  await assert.rejects(importSqlite(pool, dir + '/backup.sqlite'), /not empty/);
});
