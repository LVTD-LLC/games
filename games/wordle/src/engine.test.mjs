import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANSWERS,
  normalize,
  score,
  dailyAnswer,
  dayKey,
  restore,
  shareText,
} from './engine.mjs';

test('repeated letters consume the answer count, with exact positions first', () => {
  for (const [guess, answer, expected] of [
    ['сосна', 'маска', ['absent', 'absent', 'correct', 'absent', 'correct']],
    ['каска', 'маска', ['absent', 'correct', 'correct', 'correct', 'correct']],
    ['банка', 'кабан', ['present', 'correct', 'present', 'present', 'present']],
    ['слово', 'слово', Array(5).fill('correct')],
  ])
    assert.deepEqual(score(guess, answer), expected);
});
test('daily words use UTC and answer pool is valid', () => {
  assert.equal(dayKey(new Date('2026-09-12T01:30:00+03:00')), '2026-09-11');
  assert.equal(dailyAnswer('2026-09-11'), 'рукав');
  assert.notEqual(dailyAnswer('2026-09-11'), dailyAnswer('2026-09-12'));
  assert.equal(new Set(ANSWERS).size, ANSWERS.length);
  assert.ok(ANSWERS.every((word) => /^[а-я]{5}$/.test(word)));
  assert.equal(normalize('ЁЖИКИ'), 'ежики');
});
test('saved rounds reject malformed, duplicate, and post-win guesses', () => {
  const allowed = new Set(['слово', 'маска']);
  for (const raw of [
    'broken',
    'null',
    '{}',
    '{"guesses":[42]}',
    '{"guesses":["маска","маска"]}',
    '{"guesses":["слово","маска"]}',
    '{"guesses":["xxxxx"]}',
  ])
    assert.deepEqual(restore(raw, 'слово', allowed), []);
  assert.deepEqual(restore('{"guesses":["маска","слово"]}', 'слово', allowed), [
    'маска',
    'слово',
  ]);
});
test('share text includes score and colours without revealing the answer', () => {
  const text = shareText(
    ['маска', 'слово'],
    'слово',
    '2026-09-11',
    'https://games.example.test/wordle/',
  );
  assert.match(text, /2\/6/);
  assert.match(text, /🟩🟩🟩🟩🟩/);
  assert.ok(!text.includes('слово'));
  assert.ok(text.endsWith('https://games.example.test/wordle/'));
});
