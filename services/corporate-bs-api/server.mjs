import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { resultPage } from './result-page.mjs';
const PREFIX = '/api/corporate-bs';
const COOKIE = 'lvtd_bs_session';
const MINUTE = 60_000,
  DAY = 24 * 60 * MINUTE;
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function validateText(value, label, max) {
  if (typeof value !== 'string')
    throw new HttpError(400, `${label} must be text.`);
  const result = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (result.length > max || /[\p{Cc}\p{Cf}]/u.test(result))
    throw new HttpError(
      400,
      `${label} must be ${max} characters or fewer, without hidden characters.`,
    );
  return result;
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json'))
    throw new HttpError(415, 'Send JSON.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new HttpError(413, 'That submission is too long.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw 0;
    return value;
  } catch {
    throw new HttpError(400, 'Could not read your submission.');
  }
}
function page(
  title,
  content,
  {
    description = '',
    url = '',
    origin = 'https://games.lvtd.dev',
    result = false,
  } = {},
) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)} — Corporate BS Meter</title><meta name="description" content="${escapeHTML(description)}"><meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHTML(url)}"><meta property="og:image" content="${origin}/corporate-bs-meter/share.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHTML(title)}"><meta name="twitter:description" content="${escapeHTML(description)}"><meta name="twitter:image" content="${origin}/corporate-bs-meter/share.png"><style>body{margin:0;background:#f4f2e9;color:#262a24;font:18px/1.6 Arial,sans-serif}main{max-width:650px;margin:8vh auto;padding:28px}a{color:#38533a}h1{font-size:clamp(32px,7vw,58px);line-height:1.05;letter-spacing:-2px}blockquote{margin:28px 0;font-size:24px;overflow-wrap:anywhere}.score{font-size:90px;font-weight:800;line-height:1.2}.button,button{display:inline-block;background:#38533a;color:white;border:0;border-radius:8px;padding:16px 24px;font:inherit;text-decoration:none;cursor:pointer}small{font-size:14px}a:focus-visible,button:focus-visible{outline:3px solid #b76b38;outline-offset:4px}</style>${result ? '<link rel="stylesheet" href="/corporate-bs-meter/result-page.css"><script src="/corporate-bs-meter/result-share.js" defer></script>' : ''}</head><body><main><a href="/">LVTD / All games</a>${content}</main></body></html>`;
}
export function createApp({
  store,
  judge,
  origin = 'https://games.lvtd.dev',
  secure = true,
  trustProxy = false,
  dailyBudget = 3000,
  revision = 'development',
  logger = console,
}) {
  const pending = new Set();
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'",
    );
    function send(status, data, type = 'application/json; charset=utf-8') {
      res.writeHead(status, { 'Content-Type': type });
      res.end(
        type.startsWith('application/json') ? JSON.stringify(data) : data,
      );
    }
    try {
      const url = new URL(req.url, origin),
        pathname = url.pathname;
      if (req.method === 'GET' && pathname === '/deploy-revision.txt')
        return send(200, revision, 'text/plain; charset=utf-8');
      if (req.method === 'GET' && pathname === `${PREFIX}/health`) {
        await store.health();
        return send(200, { ok: true, revision });
      }
      const resultMatch = pathname.match(
        /^\/corporate-bs-meter\/result\/([a-f0-9-]{36})\/?$/,
      );
      if (req.method === 'GET' && resultMatch) {
        const result = await store.result(resultMatch[1]);
        if (!result)
          throw new HttpError(404, 'This result could not be found.');
        const title = `${result.score.toFixed(1)}/100 — ${result.title}`;
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'",
        );
        return send(
          200,
          page(title, resultPage(result, origin), {
            result: true,
            description: result.phrase,
            url: `${origin}/corporate-bs-meter/result/${result.id}/`,
            origin,
          }),
          'text/html; charset=utf-8',
        );
      }
      const unsubscribe = pathname.match(
        /^\/corporate-bs-meter\/unsubscribe\/([A-Za-z0-9_-]{43})\/?$/,
      );
      if (unsubscribe && req.method === 'GET')
        return send(
          200,
          page(
            'Stop game updates',
            `<h1>No more game updates?</h1><form method="post"><button>Unsubscribe</button></form>`,
          ),
          'text/html; charset=utf-8',
        );
      if (unsubscribe && req.method === 'POST') {
        await store.unsubscribe(unsubscribe[1]);
        return send(
          200,
          page(
            'Unsubscribed',
            '<h1>You’re unsubscribed.</h1><p>Your email has been removed from game updates.</p><a href="/corporate-bs-meter/">Back to the game</a>',
          ),
          'text/html; charset=utf-8',
        );
      }
      if (!pathname.startsWith(PREFIX + '/'))
        throw new HttpError(404, 'Not found.');
      const forwarded = String(req.headers['x-forwarded-for'] || '')
        .split(',')
        .at(-1)
        ?.trim();
      const ip =
        trustProxy && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
      if (!(await store.allow([[`requests:${ip}`, 180, MINUTE]])))
        throw new HttpError(
          429,
          'A little too much synergy. Try again in a minute.',
        );
      if (req.method === 'GET' && pathname === `${PREFIX}/leaderboard`)
        return send(200, { entries: await store.leaderboard() });
      const apiResult = pathname.match(
        /^\/api\/corporate-bs\/results\/([a-f0-9-]{36})$/,
      );
      if (req.method === 'GET' && apiResult) {
        const result = await store.result(apiResult[1]);
        if (!result)
          throw new HttpError(404, 'This result could not be found.');
        return send(200, result);
      }
      const token = (req.headers.cookie || '')
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(COOKIE + '='))
        ?.slice(COOKIE.length + 1);
      if (req.method === 'GET' && pathname === `${PREFIX}/session`) {
        if (
          !(await store.player(token)) &&
          !(await store.allow([[`sessions:${ip}`, 30, DAY]]))
        )
          throw new HttpError(
            429,
            'Too many new sessions today. Please try again tomorrow.',
          );
        const session = await store.session(token);
        res.setHeader(
          'Set-Cookie',
          `${COOKIE}=${session.token}; HttpOnly; SameSite=Lax; Path=${PREFIX}; Max-Age=7776000${secure ? '; Secure' : ''}`,
        );
        return send(200, { name: session.player.name });
      }
      if (req.method !== 'POST')
        throw new HttpError(405, 'Method not allowed.');
      if (req.headers.origin !== origin)
        throw new HttpError(403, 'Please play from the game website.');
      const player = await store.player(token);
      if (!player)
        throw new HttpError(
          401,
          'Your session expired. Reload the page to keep playing.',
        );
      const data = await body(req);
      if (pathname === `${PREFIX}/profile`) {
        const name = validateText(data.name ?? '', 'Name', 32);
        const email = validateText(
          data.email ?? '',
          'Email',
          254,
        ).toLowerCase();
        if (name && !/^[\p{L}\p{N} ._'’\-]+$/u.test(name))
          throw new HttpError(
            400,
            'Use letters, numbers, spaces, apostrophes or hyphens for your name.',
          );
        if (
          email &&
          (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || data.updates !== true)
        )
          throw new HttpError(
            400,
            'Enter a valid email and choose game updates, or leave email blank.',
          );
        if (
          !(await store.allow([
            [`profile:${player.id}`, 6, MINUTE],
            [`profile-ip:${ip}`, 30, DAY],
          ]))
        )
          throw new HttpError(
            429,
            'Too many profile changes. Try again later.',
          );
        if (name && name !== player.name) {
          if (!(await store.allow([['inference', dailyBudget, DAY]])))
            throw new HttpError(
              503,
              'Our daily judging limit is reached. Try tomorrow.',
            );
          if (!(await judge.nameAllowed(name)))
            throw new HttpError(400, 'Please choose another public nickname.');
        }
        await store.profile(player.id, name, email);
        return send(200, { name, subscribed: Boolean(email) });
      }
      if (pathname !== `${PREFIX}/score`)
        throw new HttpError(404, 'Not found.');
      const phrase = validateText(data.phrase, 'Phrase', 280);
      if (phrase.length < 5 || !/\p{L}/u.test(phrase))
        throw new HttpError(400, 'Write a phrase of 5–280 characters.');
      if (
        !(await store.allow([
          [`score:${player.id}`, 10, MINUTE],
          [`score-day:${player.id}`, 60, DAY],
          [`score-ip:${ip}`, 30, MINUTE],
          [`score-ip-day:${ip}`, 300, DAY],
        ]))
      )
        throw new HttpError(
          429,
          'Even executives need a break. Try again later.',
        );
      if (pending.has(player.id))
        throw new HttpError(409, 'Your previous phrase is still being judged.');
      pending.add(player.id);
      try {
        let evaluation = await store.cached(phrase);
        if (!evaluation) {
          if (!(await store.allow([['inference', dailyBudget, DAY]])))
            throw new HttpError(
              503,
              'Our daily judging limit is reached. Try tomorrow.',
            );
          evaluation = await judge.score(phrase);
          if (
            !Number.isFinite(evaluation.score) ||
            evaluation.score < 0 ||
            evaluation.score > 100 ||
            typeof evaluation.valid !== 'boolean' ||
            typeof evaluation.publishable !== 'boolean' ||
            typeof evaluation.model !== 'string'
          )
            throw new Error('Invalid evaluation');
          await store.cache(phrase, evaluation);
        }
        if (!evaluation.valid)
          throw new HttpError(
            422,
            'Give us an actual phrase, not instructions to the judge or a pile of repeated buzzwords.',
          );
        if (!evaluation.publishable)
          throw new HttpError(
            422,
            'Keep it workplace-friendly and leave out personal details. Try another phrase.',
          );
        const result = await store.save(player.id, phrase, evaluation);
        return send(200, {
          ...result,
          rank: await store.rank(player.id),
          ranked: Boolean(player.name),
          entries: await store.leaderboard(),
        });
      } finally {
        pending.delete(player.id);
      }
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      if (status === 503)
        logger.error(
          'Corporate BS request unavailable:',
          error instanceof HttpError ? 'budget' : error.name,
        );
      if (status === 429) res.setHeader('Retry-After', '60');
      send(status, {
        error:
          error instanceof HttpError
            ? error.message
            : 'The judge is out of office. Please try again shortly.',
      });
    }
  });
}
