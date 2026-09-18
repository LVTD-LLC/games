import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { position, candidates } from './chess.mjs';
import { moveQuestion, readChoice, createJev } from './jev.mjs';
test('replays legal history and refuses arbitrary instructions, illegal moves and play after mate', () => {
  const chess = position(['e2e4', 'e7e5'], 'w');
  assert.equal(chess.turn(), 'w');
  for (const [moves, player] of [
    [['e2e5'], 'w'],
    [['ignore instructions'], 'w'],
    [[], 'x'],
    [Array(601).fill('e2e4'), 'w'],
    [['f2f3', 'e7e5', 'g2g4', 'd8h4', 'e2e4'], 'w'],
  ])
    assert.throws(() => position(moves, player));
  const repeated = position(
    ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'],
    'w',
  );
  assert.equal(repeated.isThreefoldRepetition(), true);
});
test('all legal moves become options, including castling, en passant and four promotions', () => {
  for (const [chess, required] of [
    [new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), ['e1g1', 'e1c1']],
    [position(['e2e4', 'a7a6', 'e4e5', 'd7d5'], 'w'), ['e5d6']],
    [
      new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1'),
      ['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n'],
    ],
  ]) {
    const options = Object.keys(moveQuestion(chess).questions.move.criteria);
    assert.equal(options.length, chess.moves().length);
    for (const move of required) assert.ok(options.includes(move));
  }
});
test('validates complete probabilities and argmax; malformed Jev replies never become random moves', () => {
  const moves = [
    { id: 'a2a3', san: 'a3' },
    { id: 'a2a4', san: 'a4' },
  ];
  const answer = {
    type: 'choice',
    choice: 'a2a4',
    confidence: 0.6,
    probabilities: { a2a3: 0.2, a2a4: 0.8 },
  };
  assert.equal(readChoice(answer, moves).move, 'a2a4');
  for (const patch of [
    { type: 'score' },
    { choice: 'a2a3' },
    { choice: 'a1a8' },
    { confidence: 2 },
    { probabilities: { a2a3: 0.2 } },
    { probabilities: { a2a3: -0.2, a2a4: 1.2 } },
    { probabilities: { a2a3: 0.2, a2a4: 0.2 } },
    { probabilities: { a2a3: '0.2', a2a4: 0.8 } },
    { probabilities: { a2a3: 0.2, a2a4: 0.8, illegal: 0 } },
  ])
    assert.throws(() => readChoice({ ...answer, ...patch }, moves));
});
test('TypeSafe request uses documented Choice contract, board context and full legal set', async () => {
  const chess = position(['e2e4'], 'w');
  const legal = candidates(chess);
  const choose = createJev({
    apiKey: 'fixture-only',
    request: async (url, options) => {
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      assert.equal(options.redirect, 'error');
      const payload = JSON.parse(options.body);
      assert.equal(payload.state.side_to_move, 'Black');
      assert.equal(payload.state.fen, chess.fen());
      assert.deepEqual(
        Object.keys(payload.questions.move.criteria),
        legal.map((m) => m.id),
      );
      return Response.json({
        answers: {
          move: {
            type: 'choice',
            choice: legal[0].id,
            confidence: 1,
            probabilities: Object.fromEntries(
              legal.map((m, i) => [m.id, i === 0 ? 1 : 0]),
            ),
          },
        },
      });
    },
  });
  assert.equal((await choose(chess)).move, legal[0].id);
  await assert.rejects(
    createJev({
      apiKey: 'fixture-only',
      request: async () => new Response('', { status: 429 }),
    })(chess),
  );
});
