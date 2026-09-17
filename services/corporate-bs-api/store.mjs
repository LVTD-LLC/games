import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { openPool, transaction } from '../database/pool.mjs';
import { migrate } from '../database/migrate.mjs';
import { RUBRIC_VERSION, verdict } from './scoring.mjs';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export async function openStore(connectionString) {
  const db = openPool(connectionString);
  try {
    await migrate(db);
  } catch (error) {
    await db.end();
    throw error;
  }
  await db.query(
    "INSERT INTO corporate_bs.settings VALUES ('ip_salt',$1) ON CONFLICT DO NOTHING",
    [randomBytes(32).toString('hex')],
  );
  const salt = (
    await db.query(
      "SELECT value FROM corporate_bs.settings WHERE key='ip_salt'",
    )
  ).rows[0].value;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const player = (token) =>
    token
      ? one('SELECT id,name FROM corporate_bs.players WHERE id=$1', [
          hash(token),
        ])
      : undefined;
  function publicResult(row) {
    return row
      ? {
          id: row.id,
          name: row.name || 'Anonymous',
          phrase: row.phrase,
          score: row.score,
          ...verdict(row.score),
          createdAt: Number(row.created_at),
        }
      : null;
  }
  const rankedSQL = `WITH best AS (SELECT r.*, p.name, ROW_NUMBER() OVER (PARTITION BY r.player_id ORDER BY r.score DESC, r.created_at, r.id) AS best
    FROM corporate_bs.results r JOIN corporate_bs.players p ON p.id=r.player_id WHERE r.rubric=$1)
    SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, created_at, id)::integer AS rank FROM best WHERE best=1`;
  return {
    db,
    player,
    async health() {
      await db.query('SELECT 1');
    },
    async session(token) {
      const existing = await player(token);
      if (existing) return { token, player: existing };
      token = randomBytes(32).toString('base64url');
      const id = hash(token);
      await db.query(
        'INSERT INTO corporate_bs.players(id,created_at) VALUES ($1,$2)',
        [id, Date.now()],
      );
      return { token, player: { id, name: '' } };
    },
    async profile(id, name, email) {
      await transaction(db, async (client) => {
        await client.query(
          'UPDATE corporate_bs.players SET name=$1 WHERE id=$2',
          [name, id],
        );
        if (email)
          await client.query(
            'INSERT INTO corporate_bs.subscribers VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING',
            [
              email,
              Date.now(),
              'games-updates-v1',
              randomBytes(32).toString('base64url'),
            ],
          );
      });
    },
    async unsubscribe(token) {
      await db.query(
        'DELETE FROM corporate_bs.subscribers WHERE unsubscribe_token=$1',
        [token],
      );
    },
    async allow(limits, now = Date.now()) {
      // Serialize this game's short budget transactions; never hold the lock during paid work.
      // Throwing the sentinel rolls back ALL reservations when any bucket is exhausted.
      const exhausted = new Error('Budget exhausted');
      try {
        return await transaction(db, async (client) => {
          await client.query('SELECT pg_advisory_xact_lock(734926111)');
          await client.query(
            'DELETE FROM corporate_bs.limits WHERE expires<=$1',
            [now],
          );
          for (const [key, max, window] of limits) {
            const bucket = hash(`${salt}:${key}:${Math.floor(now / window)}`);
            const result = await client.query(
              `INSERT INTO corporate_bs.limits VALUES ($1,1,$2)
              ON CONFLICT(key) DO UPDATE SET count=corporate_bs.limits.count+1
              WHERE corporate_bs.limits.count<$3 RETURNING count`,
              [bucket, (Math.floor(now / window) + 1) * window, max],
            );
            if (!result.rowCount || max < 1) throw exhausted;
          }
          return true;
        });
      } catch (error) {
        if (error === exhausted) return false;
        throw error;
      }
    },
    async cached(phrase) {
      const row = await one(
        'SELECT value FROM corporate_bs.score_cache WHERE key=$1',
        [hash(RUBRIC_VERSION + phrase)],
      );
      return row ? JSON.parse(row.value) : null;
    },
    async cache(phrase, value) {
      await db.query(
        'INSERT INTO corporate_bs.score_cache VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
        [hash(RUBRIC_VERSION + phrase), JSON.stringify(value)],
      );
    },
    async save(playerId, phrase, evaluation) {
      await db.query(
        'INSERT INTO corporate_bs.results VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(player_id,phrase_hash,rubric) DO NOTHING',
        [
          randomUUID(),
          playerId,
          phrase,
          hash(phrase),
          evaluation.score,
          RUBRIC_VERSION,
          evaluation.model,
          Date.now(),
        ],
      );
      const row = await one(
        'SELECT id FROM corporate_bs.results WHERE player_id=$1 AND phrase_hash=$2 AND rubric=$3',
        [playerId, hash(phrase), RUBRIC_VERSION],
      );
      return this.result(row.id);
    },
    async result(id) {
      return publicResult(
        await one(
          'SELECT r.*,p.name FROM corporate_bs.results r JOIN corporate_bs.players p ON p.id=r.player_id WHERE r.id=$1',
          [id],
        ),
      );
    },
    async leaderboard() {
      return (
        await db.query(
          `SELECT * FROM (${rankedSQL}) ranked ORDER BY rank LIMIT 10`,
          [RUBRIC_VERSION],
        )
      ).rows.map((row) => ({ ...publicResult(row), rank: row.rank }));
    },
    async rank(playerId) {
      return (
        (await one(
          `SELECT rank,score FROM (${rankedSQL}) ranked WHERE player_id=$2`,
          [RUBRIC_VERSION, playerId],
        )) || null
      );
    },
    async close() {
      await db.end();
    },
  };
}
