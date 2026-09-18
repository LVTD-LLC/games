const parse = (rows) =>
  rows.flatMap((row, y) =>
    [...row].flatMap((cell, x) => (cell === 'O' ? [[x, y]] : [])),
  );
export const patterns = [
  {
    id: 'glider-gun',
    name: 'Glider gun',
    kind: 'An endless procession',
    cells: parse([
      '........................O...........',
      '......................O.O...........',
      '............OO......OO............OO',
      '...........O...O....OO............OO',
      'OO........O.....O...OO..............',
      'OO........O...O.OO....O.O...........',
      '..........O.....O.......O...........',
      '...........O...O....................',
      '............OO......................',
    ]),
  },
  {
    id: 'glider',
    name: 'Glider',
    kind: 'A tiny traveler',
    cells: parse(['.O.', '..O', 'OOO']),
  },
  {
    id: 'pulsar',
    name: 'Pulsar',
    kind: 'A three-beat rhythm',
    cells: parse([
      '..OOO...OOO..',
      '.............',
      'O....O.O....O',
      'O....O.O....O',
      'O....O.O....O',
      '..OOO...OOO..',
      '.............',
      '..OOO...OOO..',
      'O....O.O....O',
      'O....O.O....O',
      'O....O.O....O',
      '.............',
      '..OOO...OOO..',
    ]),
  },
  {
    id: 'blinker',
    name: 'Blinker',
    kind: 'The simplest oscillator',
    cells: parse(['OOO']),
  },
  {
    id: 'r-pentomino',
    name: 'R-pentomino',
    kind: 'Five cells, a long story',
    cells: parse(['.OO', 'OO.', '.O.']),
  },
  {
    id: 'acorn',
    name: 'Acorn',
    kind: 'A surprisingly wild seed',
    cells: parse(['.O.....', '...O...', 'OO..OOO']),
  },
];
export function seedPattern(pattern, size) {
  const cells = new Uint8Array(size * size);
  const width = Math.max(...pattern.cells.map(([x]) => x)) + 1;
  const height = Math.max(...pattern.cells.map(([, y]) => y)) + 1;
  const left = Math.floor((size - width) / 2);
  const top = Math.floor((size - height) / 2);
  for (const [x, y] of pattern.cells) cells[(top + y) * size + left + x] = 1;
  return cells;
}
