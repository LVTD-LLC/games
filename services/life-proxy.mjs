// Public boundary for the private native engine. Never forward arbitrary paths.
export function createLifeProxy({
  origin,
  engineUrl = process.env.LIFE_ENGINE_URL || 'http://127.0.0.1:4180',
  trustProxy = false,
} = {}) {
  const clients = new Map();
  return async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(body));
    };
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const route =
      pathname === '/api/life/health' && req.method === 'GET'
        ? '/health'
        : pathname === '/api/life/step' && req.method === 'POST'
          ? '/step'
          : null;
    if (!route) return send(404, { error: 'Not found' });
    if (
      req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin && origin && req.headers.origin !== origin)
    )
      return send(403, { error: 'Use the game on this website' });
    let body;
    if (route === '/step') {
      const ip = trustProxy
        ? String(req.headers['x-forwarded-for'] || '')
            .split(',')
            .at(-1)
            .trim() || req.socket.remoteAddress
        : req.socket.remoteAddress;
      const now = Date.now();
      if (clients.size >= 10000)
        for (const [key, item] of clients)
          if (now - item.start > 1000) clients.delete(key);
      const record = clients.get(ip);
      if (record && now - record.start < 1000) {
        if (++record.count > 25)
          return send(429, { error: 'Slow down and try again' });
      } else {
        if (clients.size >= 10000)
          return send(503, { error: 'Simulation is busy' });
        clients.set(ip, { start: now, count: 1 });
      }
      if (!req.headers['content-type']?.startsWith('application/json'))
        return send(415, { error: 'Expected JSON' });
      body = '';
      try {
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 5000)
            return send(413, { error: 'Board is too large' });
        }
      } catch {
        return;
      }
    }
    try {
      const response = await fetch(new URL(route, engineUrl), {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(12000),
        redirect: 'error',
      });
      const text = await response.text();
      if (text.length > 6000) throw new Error('Invalid engine response');
      res.writeHead(response.status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(response.status === 503 ? { 'Retry-After': '1' } : {}),
      });
      res.end(text);
    } catch {
      send(503, {
        error:
          'The simulation is reconnecting. Your board is still here; try Play again shortly.',
      });
    }
  };
}
