import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { RUBRIC_VERSION, verdict } from './scoring.mjs';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function openStore(filename) {
  if (filename !== ':memory:')
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, consent_at INTEGER NOT NULL, consent_version TEXT NOT NULL, unsubscribe_token TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), phrase TEXT NOT NULL, phrase_hash TEXT NOT NULL, score REAL NOT NULL CHECK(score BETWEEN 0 AND 100), rubric TEXT NOT NULL, model TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(player_id, phrase_hash, rubric));
    CREATE INDEX IF NOT EXISTS result_ranking ON results(rubric, score DESC, created_at, id);
    CREATE TABLE IF NOT EXISTS score_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
  // IP addresses are never stored: short-lived counters use a private per-database salt.
  db.exec(
    'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  );
  db.prepare("INSERT OR IGNORE INTO settings VALUES ('ip_salt', ?)").run(
    randomBytes(32).toString('hex'),
  );
  const salt = db
    .prepare("SELECT value FROM settings WHERE key='ip_salt'")
    .get().value;
  function player(token) {
    return token
      ? db.prepare('SELECT id, name FROM players WHERE id=?').get(hash(token))
      : undefined;
  }
  function publicResult(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name || 'Anonymous',
      phrase: row.phrase,
      score: row.score,
      ...verdict(row.score),
      createdAt: row.created_at,
    };
  }
  const rankedSQL = `WITH best AS (SELECT r.*, p.name, ROW_NUMBER() OVER (PARTITION BY r.player_id ORDER BY r.score DESC, r.created_at, r.id) AS best
    FROM results r JOIN players p ON p.id=r.player_id WHERE p.name != '' AND r.rubric=?)
    SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, created_at, id) AS rank FROM best WHERE best=1`;
  return {
    db,
    player,
    session(token) {
      const existing = player(token);
      if (existing) return { token, player: existing };
      token = randomBytes(32).toString('base64url');
      const id = hash(token);
      db.prepare('INSERT INTO players(id, created_at) VALUES (?,?)').run(
        id,
        Date.now(),
      );
      return { token, player: { id, name: '' } };
    },
    profile(id, name, email) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE players SET name=? WHERE id=?').run(name, id);
        if (email)
          db.prepare(
            'INSERT INTO subscribers VALUES (?,?,?,?) ON CONFLICT(email) DO NOTHING',
          ).run(
            email,
            Date.now(),
            'games-updates-v1',
            randomBytes(32).toString('base64url'),
          );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    unsubscribe(token) {
      db.prepare('DELETE FROM subscribers WHERE unsubscribe_token=?').run(
        token,
      );
    },
    // Check and reserve all counters in one synchronous transaction before paid work.
    allow(limits, now = Date.now()) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM limits WHERE expires<=?').run(now);
        for (const [key, max, window] of limits) {
          const bucket = hash(`${salt}:${key}:${Math.floor(now / window)}`);
          const row = db
            .prepare('SELECT count FROM limits WHERE key=?')
            .get(bucket);
          if ((row?.count || 0) >= max) {
            db.exec('ROLLBACK');
            return false;
          }
          db.prepare(
            'INSERT INTO limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
          ).run(bucket, (Math.floor(now / window) + 1) * window);
        }
        db.exec('COMMIT');
        return true;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    cached(phrase) {
      const r = db
        .prepare('SELECT value FROM score_cache WHERE key=?')
        .get(hash(RUBRIC_VERSION + phrase));
      return r ? JSON.parse(r.value) : null;
    },
    cache(phrase, value) {
      db.prepare('INSERT OR REPLACE INTO score_cache VALUES (?,?)').run(
        hash(RUBRIC_VERSION + phrase),
        JSON.stringify(value),
      );
    },
    existing(playerId, phrase) {
      return db
        .prepare(
          'SELECT id FROM results WHERE player_id=? AND phrase_hash=? AND rubric=?',
        )
        .get(playerId, hash(phrase), RUBRIC_VERSION);
    },
    save(playerId, phrase, evaluation) {
      const existing = this.existing(playerId, phrase);
      if (existing) return this.result(existing.id);
      const id = randomUUID();
      db.prepare('INSERT INTO results VALUES (?,?,?,?,?,?,?,?)').run(
        id,
        playerId,
        phrase,
        hash(phrase),
        evaluation.score,
        RUBRIC_VERSION,
        evaluation.model,
        Date.now(),
      );
      return this.result(id);
    },
    result(id) {
      return publicResult(
        db
          .prepare(
            'SELECT r.*,p.name FROM results r JOIN players p ON p.id=r.player_id WHERE r.id=?',
          )
          .get(id),
      );
    },
    leaderboard() {
      return db
        .prepare(`SELECT * FROM (${rankedSQL}) LIMIT 10`)
        .all(RUBRIC_VERSION)
        .map((r) => ({ ...publicResult(r), rank: r.rank }));
    },
    rank(playerId) {
      const row = db
        .prepare(`SELECT rank,score FROM (${rankedSQL}) WHERE player_id=?`)
        .get(RUBRIC_VERSION, playerId);
      return row || null;
    },
    close() {
      db.close();
    },
  };
}
