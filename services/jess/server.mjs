import { position, candidates, MAX_PLIES } from './chess.mjs';
export function createJess({
  store,
  choose,
  origin,
  trustProxy = false,
  dailyBudget = 3000,
}) {
  const pending = new Set();
  return async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
      });
      res.end(JSON.stringify(body));
    };
    if (req.url.split('?')[0] !== '/api/jess/move' || req.method !== 'POST')
      return send(404, { error: 'Not found' });
    if (
      req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin && req.headers.origin !== origin)
    )
      return send(403, { error: 'Play Jess on this website.' });
    if (!req.headers['content-type']?.startsWith('application/json'))
      return send(415, { error: 'Expected JSON.' });
    const ip = trustProxy
      ? String(req.headers['x-forwarded-for'] || '')
          .split(',')
          .at(-1)
          .trim() || req.socket.remoteAddress
      : req.socket.remoteAddress;
    if (pending.has(ip) || pending.size >= 32)
      return send(429, { error: 'Jev is busy. Please try again shortly.' });
    pending.add(ip);
    try {
      if (!(await store.allow([[`jess:request:${ip}`, 30, 60000]])))
        return send(429, {
          error: 'Too many moves. Wait a minute, then retry.',
        });
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 8000)
          return send(413, { error: 'Game is too large.' });
      }
      let chess, player;
      try {
        const data = JSON.parse(raw);
        if (
          !data ||
          typeof data !== 'object' ||
          Object.keys(data).some((key) => !['moves', 'player'].includes(key))
        )
          throw new Error();
        player = data.player;
        chess = position(data.moves, player);
      } catch {
        return send(400, { error: 'Invalid game. Start a new game.' });
      }
      if (chess.isGameOver() || chess.history().length >= MAX_PLIES)
        return send(409, { error: 'This game is over.' });
      if (chess.turn() === player)
        return send(409, { error: 'It is your turn.' });
      if (!choose)
        return send(503, {
          error: 'Jev is unavailable. Your board is safe; retry shortly.',
        });
      if (
        !(await store.allow([
          [`jess:paid:${ip}`, 300, 86400000],
          ['jess:global', dailyBudget, 86400000],
        ]))
      )
        return send(429, {
          error:
            'Today’s Jess move allowance is used up. Please come back tomorrow.',
        });
      const fen = chess.fen();
      const result = await choose(chess);
      if (!candidates(chess).some((move) => move.id === result.move))
        throw new Error('Illegal AI move');
      send(200, { ...result, fen });
    } catch {
      if (!res.headersSent && !res.destroyed)
        send(503, {
          error:
            'Jev could not choose a move. Your board is safe; retry shortly.',
        });
    } finally {
      pending.delete(ip);
    }
  };
}
