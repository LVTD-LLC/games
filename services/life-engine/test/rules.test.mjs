import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, CELL_COUNT, step, rule } from './bridge.mjs';
import {
  patterns,
  seedPattern,
} from '../../../games/game-of-life/src/patterns.mjs';
function board(points) {
  const cells = new Uint8Array(CELL_COUNT);
  for (const [x, y] of points)
    cells[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)] = 1;
  return cells;
}
function reference(cells) {
  return cells.map((alive, index) => {
    const x = index % SIZE,
      y = Math.floor(index / SIZE);
    let neighbors = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy)
          neighbors +=
            cells[((y + dy + SIZE) % SIZE) * SIZE + ((x + dx + SIZE) % SIZE)];
      }
    return Number(neighbors === 3 || (alive === 1 && neighbors === 2));
  });
}
test('compiled Bend implements every B3/S23 rule case', () => {
  for (let alive = 0; alive <= 1; alive++)
    for (let n = 0; n <= 8; n++) {
      assert.equal(rule(alive, n), Number(n === 3 || (alive === 1 && n === 2)));
    }
});
test('empty board and block stay still; a lone cell dies', () => {
  const empty = board([]),
    block = board([
      [5, 5],
      [6, 5],
      [5, 6],
      [6, 6],
    ]);
  assert.deepEqual(step(empty), empty);
  assert.deepEqual(step(block), block);
  assert.deepEqual(step(board([[5, 5]])), empty);
});
test('blinker updates simultaneously and repeats in two generations', () => {
  const horizontal = board([
    [9, 10],
    [10, 10],
    [11, 10],
  ]);
  const untouched = horizontal.slice();
  const next = step(horizontal);
  assert.deepEqual(
    next,
    board([
      [10, 9],
      [10, 10],
      [10, 11],
    ]),
  );
  assert.deepEqual(step(next), horizontal);
  assert.deepEqual(horizontal, untouched);
});
test('glider moves diagonally after four generations', () => {
  const points = patterns.find((p) => p.id === 'glider').cells;
  let cells = board(points);
  for (let n = 0; n < 4; n++) cells = step(cells);
  assert.deepEqual(cells, board(points.map(([x, y]) => [x + 1, y + 1])));
});
test('neighbor lookup wraps at both edges and corners', () => {
  const cells = board([
    [63, 63],
    [0, 63],
    [1, 63],
    [63, 0],
    [0, 1],
    [1, 1],
  ]);
  assert.deepEqual(step(cells), reference(cells));
});
test('seeded random worlds agree with an independent reference over multiple generations', () => {
  let state = 1234567;
  let cells = Uint8Array.from({ length: CELL_COUNT }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Number(state / 2 ** 32 < 0.28);
  });
  for (let n = 0; n < 5; n++) {
    const expected = reference(cells);
    cells = step(cells);
    assert.deepEqual(cells, expected);
  }
});
test('pulsar has period three', () => {
  const initial = seedPattern(
    patterns.find((p) => p.id === 'pulsar'),
    SIZE,
  );
  assert.deepEqual(step(step(step(initial))), initial);
});
test('invalid boards cannot cross the Bend boundary', () => {
  assert.throws(() => step(new Uint8Array(4)), TypeError);
  assert.throws(() => step(new Uint8Array(CELL_COUNT).fill(2)), TypeError);
});
