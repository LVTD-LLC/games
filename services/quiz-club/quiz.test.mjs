import test from 'node:test';
import assert from 'node:assert/strict';
import { bankQuestion, bankSizes, fallbackDeck, topics } from './bank.mjs';
import { createQuestionSource, parseDeck } from './questions.mjs';
import { createRooms } from './rooms.mjs';
const settings = { topic: 'mixed', lang: 'en', public: true };
const deck = Array.from({ length: 10 }, (_, i) => ({
  ...bankQuestion('numbers', i, 'en'),
  correct: 2,
}));
function table() {
  let clock = 1000,
    generated = 0;
  const api = createRooms({
    now: () => clock,
    questions: async () => {
      generated++;
      return { deck, source: 'openrouter' };
    },
  });
  const room = api.enterGame('create', settings, 'one').code;
  const action = (who, what, body = {}) => api.act(room, who, what, body);
  return {
    api,
    room,
    action,
    tick: (ms) => (clock += ms),
    view: () => api.state(room, 'one'),
    generated: () => generated,
  };
}
test('both languages have thousands of distinct playable prompts per topic', () => {
  for (const lang of ['en', 'ru']) {
    for (const topic of topics) {
      assert.ok(bankSizes[topic] >= 2000);
      const prompts = new Set();
      // Validate the compact data and all number recipes without generating millions of distractors.
      for (let i = 0; i < bankSizes[topic]; i += topic === 'numbers' ? 1 : 19) {
        const q = bankQuestion(topic, i, lang);
        assert.ok(!prompts.has(q.prompt));
        prompts.add(q.prompt);
        assert.equal(new Set(q.options).size, 4);
        assert.ok(q.correct >= 0 && q.correct < 4 && q.options.every(Boolean));
      }
    }
    const batch = fallbackDeck({ ...settings, lang });
    assert.equal(new Set(batch.map((q) => q.prompt)).size, 10);
    assert.equal(new Set(batch.map((q) => q.topic)).size, 3);
  }
});
test('AI deck validation and provider fallback use the room settings', async () => {
  const raw = JSON.stringify({ questions: deck });
  const parsed = parseDeck(raw, settings);
  assert.deepEqual(
    parsed.map((q) => q.options[q.correct]),
    deck.map((q) => q.options[q.correct]),
  );
  assert.throws(() => parseDeck(raw, { ...settings, lang: 'ru' }));
  assert.throws(() =>
    parseDeck(JSON.stringify({ questions: Array(10).fill(deck[0]) }), settings),
  );
  assert.throws(() =>
    parseDeck(
      JSON.stringify({ questions: deck.map((q) => ({ ...q, correct: 4 })) }),
      settings,
    ),
  );
  let requests = 0;
  const source = createQuestionSource({
    apiKey: 'test',
    fetcher: async (url, { body }) => {
      requests++;
      const req = JSON.parse(body);
      assert.ok(
        req.models.every((m) => m.endsWith(':free') || m === 'openrouter/free'),
      );
      return Response.json({
        choices: [{ message: { content: requests === 1 ? raw : 'oops' } }],
      });
    },
  });
  assert.equal((await source(settings)).source, 'openrouter');
  const fallback = await source({ ...settings, lang: 'ru', topic: 'art' });
  assert.equal(fallback.source, 'bank');
  assert.ok(
    fallback.deck.every((q) => q.topic === 'art' && /[А-Яа-я]/.test(q.prompt)),
  );
});
test('public matchmaking, private codes, ten seats, retries and expiration', () => {
  const { api, room, tick, action } = table();
  const privateRoom = api.enterGame(
    'create',
    { ...settings, public: false },
    'private',
  ).code;
  assert.deepEqual(
    api.publicRooms('en').map((r) => r.code),
    [room],
  );
  assert.deepEqual(api.publicRooms('ru'), []);
  assert.equal(api.enterGame('match', settings, 'two').code, room);
  assert.equal(
    api.enterGame('join', { code: privateRoom }, 'friend').code,
    privateRoom,
  );
  for (let i = 3; i <= 10; i++)
    api.enterGame('join', { code: room }, String(i));
  assert.equal(api.enterGame('join', { code: room }, 'two').players.length, 10);
  assert.throws(() => api.enterGame('join', { code: room }, 'extra'), /closed/);
  assert.throws(() => api.state(room, 'other'), /expired/);
  assert.deepEqual(api.publicRooms('en'), []);
  action('two', 'leave');
  assert.equal(api.publicRooms('en')[0].count, 9);
  tick(121000);
  api.sweep();
  assert.throws(() => api.state(room, 'one'), /missing/);
});
test('shared deadlines, answer secrecy, retries, all ten reveals, and a fresh rematch', async () => {
  const { api, room, tick, view, action, generated } = table();
  action('one', 'ready');
  assert.equal(view().phase, 'lobby');
  api.enterGame('join', { code: room }, 'two');
  action('two', 'ready');
  action('two', 'ready');
  await Promise.resolve();
  assert.equal(generated(), 1);
  for (let index = 0; index < 10; index++) {
    const play = view();
    assert.equal(play.index, index);
    assert.equal(play.phase, 'question');
    assert.equal(play.until - play.now, 30000);
    assert.equal(play.question.correct, undefined);
    action('one', 'answer', { round: play.round, index, answer: 2 });
    action('one', 'answer', { round: play.round, index, answer: 1 });
    assert.equal(api.state(room, 'two').players[0].answer, undefined);
    if (index === 2) tick(30000);
    else action('two', 'answer', { round: play.round, index, answer: 3 });
    const reveal = view();
    assert.equal(reveal.phase, 'reveal');
    assert.equal(reveal.question.correct, 2);
    assert.equal(reveal.players[0].score, index + 1);
    assert.equal(reveal.players[1].score, 0);
    assert.equal(reveal.players[1].answer, index === 2 ? null : 3);
    tick(7000);
    action('two', 'answer', { round: play.round, index, answer: 2 });
  }
  assert.equal(view().phase, 'results');
  action('one', 'ready');
  assert.equal(view().phase, 'results');
  action('two', 'ready');
  await Promise.resolve();
  assert.equal(view().phase, 'question');
  assert.equal(view().players[0].score, 0);
  assert.equal(generated(), 2);
  action('one', 'answer', { round: 1, index: 0, answer: 2 });
  assert.equal(view().players[0].answered, false);
  tick(370000);
  assert.equal(view().phase, 'results');
  action('two', 'leave');
  assert.equal(view().standings.length, 2);
});
