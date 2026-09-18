import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { position, candidates, MAX_PLIES } from './chess.mjs';
import {
  createRecords,
  ownerHash,
  verifiedPosition,
  completion,
  publicResult,
} from './records.mjs';
const COOKIE = 'lvtd_jess_player';
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function identity(data) {
  if (
    typeof data.name !== 'string' ||
    typeof data.email !== 'string' ||
    typeof data.subscribe !== 'boolean'
  )
    throw new HttpError(400, 'Please check the optional fields.');
  const name = data.name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const email = data.email.trim().toLowerCase();
  if (name.length > 40 || /[\p{Cc}\p{Cf}<>]/u.test(name))
    throw new HttpError(
      400,
      'Use a name of 40 characters or fewer, without markup or hidden characters.',
    );
  if (
    email &&
    (!data.subscribe ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    throw new HttpError(
      400,
      'Enter a valid email and check the newsletter opt-in, or leave email blank.',
    );
  if (data.subscribe && !email)
    throw new HttpError(
      400,
      'Enter your email to subscribe, or leave the opt-in unchecked.',
    );
  return { name, email };
}
export function createJess({
  store,
  choose,
  nameAllowed,
  origin,
  secure = true,
  trustProxy = false,
  dailyBudget = 3000,
  records = store.db ? createRecords(store.db) : null,
}) {
  const pending = new Set();
  return async (req, res) => {
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
      });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    const pathname = req.url.split('?')[0];
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .at(-1)
      .trim();
    const ip =
      trustProxy && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
    const token = String(req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(COOKIE + '='))
      ?.slice(COOKIE.length + 1);
    const owner =
      token && /^[A-Za-z0-9_-]{43}$/.test(token) ? ownerHash(token) : null;
    let locked = false;
    try {
      if (
        req.method !== 'GET' &&
        (req.headers['sec-fetch-site'] === 'cross-site' ||
          (req.headers.origin && req.headers.origin !== origin))
      )
        throw new HttpError(403, 'Play Jess on this website.');
      const unsubscribe = pathname.match(
        /^\/api\/jess\/unsubscribe\/([A-Za-z0-9_-]{43})\/?$/,
      );
      if (unsubscribe && ['GET', 'POST'].includes(req.method)) {
        if (req.method === 'POST') await records.unsubscribe(unsubscribe[1]);
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        );
        return send(
          200,
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Game updates</title><main><h1>${req.method === 'POST' ? 'You’re unsubscribed.' : 'Stop game updates?'}</h1>${req.method === 'POST' ? '<p>Your email has been removed.</p>' : '<form method="post"><button>Unsubscribe</button></form>'}<p><a href="/jess/">Back to Jess</a></p></main></html>`,
          'text/html; charset=utf-8',
        );
      }
      if (req.method === 'GET' && pathname === '/api/jess/leaderboard')
        return send(200, { entries: await records.leaderboard() });
      if (
        req.method !== 'POST' ||
        ![
          '/api/jess/start',
          '/api/jess/move',
          '/api/jess/finish',
          '/api/jess/identity',
        ].includes(pathname)
      )
        throw new HttpError(404, 'Not found');
      if (!req.headers['content-type']?.startsWith('application/json'))
        throw new HttpError(415, 'Expected JSON.');
      if (pending.has(ip) || pending.size >= 32)
        throw new HttpError(429, 'Jev is busy. Please try again shortly.');
      pending.add(ip);
      locked = true;
      if (!(await store.allow([[`jess:request:${ip}`, 30, 60000]])))
        throw new HttpError(
          429,
          'Too many requests. Wait a minute, then retry.',
        );
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 8000)
          throw new HttpError(413, 'Game is too large.');
      }
      let data;
      try {
        data = JSON.parse(raw);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw 0;
      } catch {
        throw new HttpError(400, 'Invalid game. Start a new game.');
      }
      if (pathname === '/api/jess/start') {
        if (!UUID.test(data.id) || !['w', 'b'].includes(data.player))
          throw new HttpError(400, 'Invalid game.');
        let sessionOwner = owner;
        if (!sessionOwner) {
          const sessionToken = randomBytes(32).toString('base64url');
          sessionOwner = ownerHash(sessionToken);
          res.setHeader(
            'Set-Cookie',
            `${COOKIE}=${sessionToken}; Path=/api/jess/; HttpOnly; SameSite=Lax; Max-Age=7776000${secure ? '; Secure' : ''}`,
          );
        }
        let game = await records.get(data.id, sessionOwner);
        if (!game) {
          if (!(await store.allow([[`jess:starts:${ip}`, 100, 86400000]])))
            throw new HttpError(429, 'Today’s new-game allowance is used up.');
          game = await records.start(data.id, sessionOwner, data.player);
        }
        if (!game || game.side !== data.player)
          throw new HttpError(
            409,
            'This saved game belongs to another browser. Start a new game.',
          );
        return send(200, { id: game.id });
      }
      let game;
      if (data.gameId !== undefined) {
        if (!UUID.test(data.gameId) || !owner)
          throw new HttpError(
            403,
            'Your game session is missing. Start a new game.',
          );
        game = await records.get(data.gameId, owner);
        if (!game)
          throw new HttpError(
            404,
            'This saved game could not be found. Start a new game.',
          );
      }
      if (pathname === '/api/jess/identity') {
        if (!game?.winner)
          throw new HttpError(409, 'Finish a recorded game first.');
        const { name, email } = identity(data);
        if (name && name !== game.name) {
          if (
            !(await store.allow([
              ['jess:global', dailyBudget, 86400000],
              [`jess:names:${owner}`, 10, 86400000],
            ]))
          )
            throw new HttpError(
              429,
              'Name checks are busy. You can keep your Anonymous result.',
            );
          if (!nameAllowed || !(await nameAllowed(name)))
            throw new HttpError(
              400,
              'Please choose another public name, or leave it blank.',
            );
        }
        return send(200, { result: await records.identity(game, name, email) });
      }
      if (
        Object.keys(data).some(
          (key) => !['moves', 'player', 'gameId'].includes(key),
        )
      )
        throw new HttpError(400, 'Invalid game.');
      if (
        game &&
        pathname === '/api/jess/move' &&
        game.last_response &&
        equal(data.moves, game.moves.slice(0, -1)) &&
        data.player === game.side
      )
        return send(200, game.last_response);
      if (game?.winner) {
        if (
          pathname === '/api/jess/finish' &&
          equal(data.moves, game.moves) &&
          data.player === game.side
        )
          return send(200, { result: publicResult(game) });
        throw new HttpError(409, 'This game is over. Start a new game.');
      }
      let chess;
      try {
        chess = game
          ? verifiedPosition(game, data.moves, data.player)
          : position(data.moves, data.player);
      } catch {
        throw new HttpError(400, 'Invalid or unverified game history.');
      }
      if (pathname === '/api/jess/finish') {
        if (!game)
          throw new HttpError(
            409,
            'Older games cannot be ranked. Start a new game to record a result.',
          );
        const result = completion(chess, game.side);
        if (!result) throw new HttpError(409, 'This game is not finished.');
        return send(200, {
          result: publicResult(await records.commit(game, data.moves, result)),
        });
      }
      if (chess.isGameOver() || chess.history().length >= MAX_PLIES)
        throw new HttpError(409, 'This game is over.');
      if (chess.turn() === data.player)
        throw new HttpError(409, 'It is your turn.');
      if (!choose)
        throw new HttpError(
          503,
          'Jev is unavailable. Your board is safe; retry shortly.',
        );
      if (
        !(await store.allow([
          [`jess:paid:${ip}`, 300, 86400000],
          ['jess:global', dailyBudget, 86400000],
        ]))
      )
        throw new HttpError(
          429,
          'Today’s Jess move allowance is used up. Please come back tomorrow.',
        );
      const fen = chess.fen();
      const result = await choose(chess);
      if (!candidates(chess).some((move) => move.id === result.move))
        throw new Error('Illegal AI move');
      const response = { ...result, fen };
      if (game) {
        chess.move({
          from: result.move.slice(0, 2),
          to: result.move.slice(2, 4),
          promotion: result.move[4],
        });
        await records.commit(
          game,
          [...data.moves, result.move],
          completion(chess, game.side),
          response,
        );
      }
      send(200, response);
    } catch (error) {
      if (!res.headersSent && !res.destroyed)
        send(error.status || 503, {
          error: error.status
            ? error.message
            : 'Jess could not save or complete that request. Your board is safe; retry shortly.',
        });
    } finally {
      if (locked) pending.delete(ip);
    }
  };
}
