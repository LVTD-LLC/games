import { createRooms, GameError } from './rooms.mjs';

const prefix = '/quiz-club/api/';
export function createQuizApi({
  origin,
  trustProxy = false,
  ...settings
} = {}) {
  const rooms = createRooms(settings);
  const attempts = new Map();
  // Idle rooms and IP counters must also disappear when nobody is polling.
  const timer = setInterval(() => {
    rooms.sweep();
    for (const [ip, slot] of attempts)
      if (Date.now() >= slot.end) attempts.delete(ip);
  }, 15000).unref();
  async function handle(req, res) {
    const reply = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname.slice(prefix.length);
      if (req.method === 'GET' && route === 'rooms')
        return reply(200, rooms.publicRooms(url.searchParams.get('lang')));
      if (
        req.method === 'POST' &&
        req.headers.origin &&
        origin &&
        req.headers.origin !== origin
      )
        throw new GameError(403, 'origin');
      const token = req.headers['x-quiz-seat']?.match(/^[a-f0-9]{36}$/i)?.[0];
      if (!token) throw new GameError(403, 'expired');
      const match = /^rooms\/([A-Z2-9]{6})(?:\/(ready|answer|leave))?$/.exec(
        route,
      );
      if (req.method === 'GET' && match && !match[2])
        return reply(200, rooms.state(match[1], token));
      if (req.method !== 'POST') throw new GameError(405, 'invalid');
      if (req.headers['content-type']?.split(';')[0] !== 'application/json')
        throw new GameError(415, 'invalid');
      if (['create', 'join', 'match'].includes(route)) {
        const ip =
          (trustProxy &&
            req.headers['x-forwarded-for']?.split(',').at(-1)?.trim()) ||
          req.socket.remoteAddress;
        let slot = attempts.get(ip);
        if (!slot || Date.now() >= slot.end) {
          slot = { count: 0, end: Date.now() + 60000 };
          attempts.set(ip, slot);
        }
        if (++slot.count > 60) throw new GameError(429, 'busy');
      }
      let length = 0;
      const chunks = [];
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 1024) throw new GameError(413, 'invalid');
        chunks.push(chunk);
      }
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString());
      } catch {}
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new GameError(400, 'invalid');
      if (['create', 'join', 'match'].includes(route))
        return reply(200, rooms.enterGame(route, input, token));
      if (match?.[2])
        return reply(200, rooms.act(match[1], token, match[2], input));
      throw new GameError(404, 'invalid');
    } catch (e) {
      reply(
        e instanceof GameError ? e.status : 500,
        e instanceof GameError ? { error: e.message } : { error: 'server' },
      );
    }
  }
  return { handle, close: () => clearInterval(timer) };
}
