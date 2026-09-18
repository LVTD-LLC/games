import { createHash, randomBytes } from 'node:crypto';
import { transaction } from '../database/pool.mjs';
import { position, MAX_PLIES } from './chess.mjs';
export const ownerHash = (token) =>
  createHash('sha256').update(token).digest('hex');
export const publicResult = (game) => ({
  id: game.id,
  name: game.name || 'Anonymous',
  winner: game.winner,
  moves: game.move_count,
  finishedAt: Number(game.finished_at),
});
export function completion(chess, side) {
  if (!chess.isGameOver() && chess.history().length < MAX_PLIES) return null;
  return {
    winner: chess.isCheckmate()
      ? chess.turn() === side
        ? 'jev'
        : 'human'
      : 'draw',
    moves: Math.ceil(chess.history().length / 2),
  };
}
// A client may extend a verified line by ONE human move, or take back to a
// verified prefix. It may never invent or replace a Jev move.
export function verifiedPosition(game, moves, side) {
  if (side !== game.side) throw new Error('Wrong side');
  const chess = position(moves, side);
  let common = 0;
  while (
    common < moves.length &&
    common < game.moves.length &&
    moves[common] === game.moves[common]
  )
    common++;
  if (common !== moves.length) {
    if (
      moves.length !== common + 1 ||
      position(moves.slice(0, common), side).turn() !== side
    )
      throw new Error('Unverified game history');
  }
  return chess;
}
export function createRecords(db) {
  return {
    async start(id, owner, side) {
      await db.query(
        'INSERT INTO jess.games(id,owner,side,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [id, owner, side, Date.now()],
      );
      return this.get(id, owner);
    },
    async get(id, owner) {
      return (
        await db.query('SELECT * FROM jess.games WHERE id=$1 AND owner=$2', [
          id,
          owner,
        ])
      ).rows[0];
    },
    async commit(game, moves, result, response = null) {
      const row = (
        await db.query(
          `UPDATE jess.games SET moves=$1, last_response=$2, winner=$3, move_count=$4, finished_at=$5
        WHERE id=$6 AND owner=$7 AND moves=$8 AND winner IS NULL RETURNING *`,
          [
            JSON.stringify(moves),
            response ? JSON.stringify(response) : null,
            result?.winner || null,
            result?.moves || null,
            result ? Date.now() : null,
            game.id,
            game.owner,
            JSON.stringify(game.moves),
          ],
        )
      ).rows[0];
      if (!row) throw new Error('Game changed');
      return row;
    },
    async leaderboard() {
      return (
        await db.query(
          "SELECT id,name,winner,move_count,finished_at FROM jess.games WHERE winner='human' ORDER BY move_count,finished_at,id LIMIT 10",
        )
      ).rows.map(publicResult);
    },
    async identity(game, name, email) {
      await transaction(db, async (client) => {
        await client.query(
          'UPDATE jess.games SET name=$1 WHERE id=$2 AND owner=$3 AND winner IS NOT NULL',
          [name, game.id, game.owner],
        );
        if (email)
          await client.query(
            'INSERT INTO jess.subscribers VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING',
            [
              email,
              Date.now(),
              'games-updates-v1',
              randomBytes(32).toString('base64url'),
            ],
          );
      });
      return publicResult({ ...game, name });
    },
    async unsubscribe(token) {
      await db.query(
        'DELETE FROM jess.subscribers WHERE unsubscribe_token=$1',
        [token],
      );
    },
  };
}
