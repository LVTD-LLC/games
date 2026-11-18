import { randomInt, randomUUID } from 'node:crypto';
import { topics } from './bank.mjs';
import { createQuestionSource } from './questions.mjs';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export class GameError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}
function fail(status, code) {
  throw new GameError(status, code);
}
export function createRooms({
  now = Date.now,
  questions = createQuestionSource(),
  questionMs = 30000,
  revealMs = 7000,
} = {}) {
  const rooms = new Map();
  function begin(r, start) {
    r.index++;
    r.phase = 'question';
    r.until = start + questionMs;
    for (const p of r.players) p.answer = null;
  }
  function reveal(r, start) {
    r.phase = 'reveal';
    r.until = start + revealMs;
    for (const p of r.players)
      if (p.answer === r.deck[r.index].correct) p.score++;
  }
  function advance(r) {
    while (['question', 'reveal'].includes(r.phase) && now() >= r.until) {
      if (r.phase === 'question') reveal(r, r.until);
      else if (r.index === 9) {
        r.phase = 'results';
        r.standings = r.players.map(({ id, name, score }) => ({
          id,
          name,
          score,
        }));
        r.until = null;
      } else begin(r, r.until);
    }
  }
  function maybeStart(r) {
    if (
      !['lobby', 'results'].includes(r.phase) ||
      r.players.length < 2 ||
      !r.players.every((p) => p.ready)
    )
      return;
    r.phase = 'preparing';
    r.round++;
    r.standings = null;
    for (const p of r.players) {
      p.ready = false;
      p.score = 0;
      p.answer = null;
    }
    const preparation = Symbol();
    r.preparation = preparation;
    questions({ topic: r.topic, lang: r.lang }).then(({ deck, source }) => {
      if (rooms.get(r.code) !== r || r.preparation !== preparation) return;
      r.deck = deck;
      r.source = source;
      r.index = -1;
      begin(r, now());
    });
  }
  function departed(r) {
    if (!r.players.length) {
      rooms.delete(r.code);
      return;
    }
    if (r.phase === 'preparing' && r.players.length < 2) {
      r.phase = 'lobby';
      r.preparation = null;
    }
    if (r.phase === 'question' && r.players.every((p) => p.answer !== null))
      reveal(r, now());
    maybeStart(r);
  }
  function sweep() {
    for (const r of rooms.values()) {
      advance(r);
      const count = r.players.length;
      r.players = r.players.filter((p) => now() - p.seen < 120000);
      if (r.players.length !== count) departed(r);
    }
  }
  function open(input) {
    if (
      !['en', 'ru'].includes(input.lang) ||
      !['mixed', ...topics].includes(input.topic) ||
      typeof input.public !== 'boolean'
    )
      fail(400, 'settings');
    if (rooms.size >= 300) fail(429, 'busy');
    let code;
    do {
      code = Array.from(
        { length: 6 },
        () => alphabet[randomInt(alphabet.length)],
      ).join('');
    } while (rooms.has(code));
    const r = {
      code,
      lang: input.lang,
      topic: input.topic,
      public: input.public,
      phase: 'lobby',
      players: [],
      index: -1,
      until: null,
      serial: 0,
      round: 0,
      standings: null,
    };
    rooms.set(code, r);
    return r;
  }
  function enter(r, name, token) {
    if (r.players.some((p) => p.token === token)) return;
    if (r.phase !== 'lobby' || r.players.length >= 10) fail(409, 'closed');
    r.serial++;
    const clean =
      typeof name === 'string'
        ? name
            .replace(/[\p{C}]/gu, '')
            .trim()
            .slice(0, 24)
        : '';
    r.players.push({
      id: randomUUID(),
      token,
      name: clean || (r.lang === 'en' ? 'Guest ' : 'Гость ') + r.serial,
      ready: false,
      score: 0,
      answer: null,
      seen: now(),
    });
  }
  function list(lang) {
    sweep();
    return [...rooms.values()].filter(
      (r) =>
        r.public &&
        r.lang === lang &&
        r.phase === 'lobby' &&
        r.players.length < 10,
    );
  }
  function enterGame(action, input, token) {
    sweep();
    const existing = [...rooms.values()].find((r) =>
      r.players.some((p) => p.token === token),
    );
    if (existing && (action !== 'join' || existing.code === input.code))
      return state(existing.code, token);
    if (existing) fail(409, 'already');
    let r;
    if (action === 'join') {
      r = rooms.get(input.code);
      if (!r) fail(404, 'missing');
    } else if (action === 'match')
      r =
        shuffleOne(list(input.lang)) ??
        open({ lang: input.lang, topic: 'mixed', public: true });
    else r = open(input);
    enter(r, input.name, token);
    return state(r.code, token);
  }
  function member(code, token) {
    const r = rooms.get(code);
    if (!r) fail(404, 'missing');
    const p = r.players.find((p) => p.token === token);
    if (!p) fail(403, 'expired');
    advance(r);
    p.seen = now();
    return [r, p];
  }
  function state(code, token) {
    const [r, p] = member(code, token),
      live = ['question', 'reveal'].includes(r.phase);
    const q = live ? r.deck[r.index] : null;
    return {
      code: r.code,
      lang: r.lang,
      topic: r.topic,
      public: r.public,
      phase: r.phase,
      round: r.round,
      standings: r.standings,
      index: r.index,
      until: r.until,
      now: now(),
      me: p.id,
      source: live || r.phase === 'results' ? r.source : null,
      question: q
        ? {
            prompt: q.prompt,
            topic: q.topic,
            options: q.options,
            ...(r.phase === 'reveal' ? { correct: q.correct } : {}),
          }
        : null,
      players: r.players.map((a) => ({
        id: a.id,
        name: a.name,
        score: a.score,
        ready: a.ready,
        answered: a.answer !== null,
        ...(p === a || r.phase === 'reveal' ? { answer: a.answer } : {}),
      })),
    };
  }
  function act(code, token, action, input) {
    const [r, p] = member(code, token);
    if (action === 'leave') {
      r.players = r.players.filter((a) => a !== p);
      departed(r);
      return {};
    }
    if (action === 'ready') {
      if (['lobby', 'results'].includes(r.phase)) {
        p.ready = true;
        maybeStart(r);
      }
    } else if (action === 'answer') {
      if (
        r.phase === 'question' &&
        input.round === r.round &&
        input.index === r.index &&
        p.answer === null
      ) {
        if (
          !Number.isInteger(input.answer) ||
          input.answer < 0 ||
          input.answer > 3
        )
          fail(400, 'invalid');
        p.answer = input.answer;
        if (r.players.every((a) => a.answer !== null)) reveal(r, now());
      }
    } else fail(404, 'invalid');
    return state(code, token);
  }
  return {
    enterGame,
    state,
    act,
    sweep,
    publicRooms(lang) {
      return list(lang).map((r) => ({
        code: r.code,
        topic: r.topic,
        count: r.players.length,
      }));
    },
  };
}
function shuffleOne(items) {
  return items.length ? items[randomInt(items.length)] : null;
}
