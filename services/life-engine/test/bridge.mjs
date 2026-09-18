import Life from '../bend/life.bend';

export const SIZE = 64;
export const CELL_COUNT = SIZE * SIZE;
const DEPTH = 12;

// This is the representation boundary only. All evolution happens in Bend.
function toBoard(cells, depth = DEPTH, index = 0, stride = 1) {
  if (depth === 0) return { $: 'Cell', value: cells[index] };
  return {
    $: 'Branch',
    left: toBoard(cells, depth - 1, index, stride * 2),
    right: toBoard(cells, depth - 1, index + stride, stride * 2),
  };
}
function writeCells(tree, cells, index = 0, stride = 1) {
  if (tree.$ === 'Cell') cells[index] = tree.value;
  else {
    writeCells(tree.left, cells, index, stride * 2);
    writeCells(tree.right, cells, index + stride, stride * 2);
  }
}
export function step(cells) {
  if (
    !(cells instanceof Uint8Array) ||
    cells.length !== CELL_COUNT ||
    cells.some((cell) => cell > 1)
  ) {
    throw new TypeError('Expected a 64 × 64 binary Uint8Array');
  }
  const next = new Uint8Array(CELL_COUNT);
  writeCells(Life.step(toBoard(cells)), next);
  return next;
}
export const rule = (alive, neighbors) => Life.rule(alive, neighbors);
