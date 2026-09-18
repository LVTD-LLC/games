import { track, analyticsHeaders, reportError } from './analytics.js';
import { patterns, seedPattern } from './patterns.mjs';

const SIZE = 64;
const $ = (id) => document.getElementById(id);
const canvas = $('board'),
  context = canvas.getContext('2d');
let cells = seedPattern(patterns[0], SIZE);
let baseline = cells.slice(),
  trails = new Uint8Array(SIZE * SIZE);
let started = false;
let generation = 0,
  playing = false,
  pending = null,
  epoch = 0;
let tool = 'draw',
  zoom = 1,
  cursor = [32, 32],
  keyboardCursor = false;
let pointer = null,
  lastCell = null,
  timer = null;
const notice = (text) => {
  $('notice').textContent = text;
};
function population() {
  return cells.reduce((sum, cell) => sum + cell, 0);
}
function render() {
  const unit = canvas.width / SIZE;
  context.fillStyle = '#19231d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < cells.length; i++) {
    const x = (i % SIZE) * unit,
      y = Math.floor(i / SIZE) * unit;
    if (cells[i]) context.fillStyle = '#c8eb83';
    else if (trails[i])
      context.fillStyle = [
        '#19231d',
        '#202f23',
        '#283b29',
        '#32492e',
        '#405a35',
      ][trails[i]];
    else context.fillStyle = '#202b23';
    context.fillRect(x + 1, y + 1, unit - 2, unit - 2);
  }
  if (keyboardCursor) {
    context.strokeStyle = '#fff';
    context.lineWidth = 2;
    context.strokeRect(
      cursor[0] * unit + 1,
      cursor[1] * unit + 1,
      unit - 2,
      unit - 2,
    );
  }
  $('generation').textContent = generation.toLocaleString();
  $('population').textContent = population().toLocaleString();
  canvas.dataset.generation = String(generation);
  canvas.dataset.population = String(population());
}
function state() {
  document.body.dataset.playing = String(playing);
  $('state').textContent = playing ? 'Growing' : 'Paused';
  $('play-label').textContent = playing ? 'Pause' : 'Play';
  $('play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('step').disabled = !!pending || playing;
  $('fast').disabled = !!pending || playing;
}
function pause() {
  if (playing) track('game_paused', { generation, population: population() });
  playing = false;
  clearTimeout(timer);
  epoch++;
  pending?.abort();
  pending = null;
  state();
}
function schedule() {
  clearTimeout(timer);
  if (playing)
    timer = setTimeout(() => advance(1), 1000 / Number($('speed').value));
}
async function advance(steps) {
  if (pending) return;
  if (!started) {
    track('game_started', { population: population() });
    started = true;
  }
  const controller = new AbortController(),
    version = epoch;
  pending = controller;
  state();
  const deadline = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/life/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...analyticsHeaders() },
      body: JSON.stringify({ board: cells.join(''), steps }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (version !== epoch) return;
    if (!response.ok)
      throw new Error(
        result.error || 'The simulation is unavailable. Try Play again.',
      );
    if (!/^[01]{4096}$/.test(result.board) || result.steps !== steps)
      throw new Error(
        'The simulation returned an incomplete board. Please try again.',
      );
    const next = Uint8Array.from(result.board, Number);
    for (let i = 0; i < cells.length; i++)
      trails[i] = cells[i] && !next[i] ? 4 : Math.max(0, trails[i] - 1);
    cells = next;
    generation += steps;
    render();
    if (!playing)
      track('simulation_advanced', {
        steps,
        generation,
        population: population(),
      });
    if (steps > 1)
      notice(
        `Advanced ${steps} generations. Bend took ${result.elapsedMs.toFixed(1)} ms, using ${result.threads} CPU threads.`,
      );
    if (population() === 0 && playing) {
      track('game_completed', { outcome: 'extinct', generation });
      playing = false;
      notice(
        'This world has gone quiet. Draw a new beginning or choose a pattern.',
      );
    }
  } catch (error) {
    if (version !== epoch) return;
    track('simulation_failed', {
      reason: error.name === 'AbortError' ? 'timeout' : 'unavailable',
    });
    reportError('simulation_unavailable');
    playing = false;
    notice(
      error.name === 'AbortError'
        ? 'The simulation took too long. Your board is saved here; try Play again.'
        : error.message,
    );
  } finally {
    clearTimeout(deadline);
    if (pending === controller) {
      pending = null;
      state();
      schedule();
    }
  }
}
function fresh(next, name, id = '') {
  pause();
  started = false;
  track('simulation_board_changed', {
    pattern:
      id ||
      (name === 'A clean slate'
        ? 'clear'
        : name === 'A new random world'
          ? 'random'
          : 'reset'),
  });
  cells = next;
  baseline = next.slice();
  trails.fill(0);
  generation = 0;
  for (const button of document.querySelectorAll('.pattern'))
    button.setAttribute('aria-pressed', String(button.dataset.pattern === id));
  notice(`${name}. Press Play or draw on the grid.`);
  render();
}
function togglePlay() {
  if (playing) pause();
  else {
    playing = true;
    track('simulation_played', {
      generation,
      population: population(),
      speed: Number($('speed').value),
    });
    state();
    advance(1);
  }
}
$('play').addEventListener('click', togglePlay);
$('step').addEventListener('click', () => advance(1));
$('fast').addEventListener('click', () => advance(100));
$('reset').addEventListener('click', () =>
  fresh(baseline.slice(), 'Back to your starting board'),
);
$('clear').addEventListener('click', () =>
  fresh(new Uint8Array(SIZE * SIZE), 'A clean slate'),
);
$('random').addEventListener('click', () =>
  fresh(
    Uint8Array.from({ length: SIZE * SIZE }, () =>
      Number(Math.random() < 0.28),
    ),
    'A new random world',
  ),
);
$('speed').addEventListener('input', () => {
  $('speed-value').textContent = `${$('speed').value} / sec`;
  schedule();
});
$('speed').addEventListener('change', () =>
  track('simulation_speed_changed', { speed: Number($('speed').value) }),
);
$('zoom').addEventListener('change', () => {
  zoom = Number($('zoom').value);
  canvas.style.setProperty('--board-width', `${zoom * 100}%`);
});
for (const button of document.querySelectorAll('[data-tool]'))
  button.addEventListener('click', () => {
    tool = button.dataset.tool;
    canvas.dataset.tool = tool;
    for (const item of document.querySelectorAll('[data-tool]'))
      if (item.tagName === 'BUTTON')
        item.setAttribute('aria-pressed', String(item.dataset.tool === tool));
  });
for (const pattern of patterns) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pattern';
  button.dataset.pattern = pattern.id;
  button.setAttribute('aria-pressed', String(pattern.id === patterns[0].id));
  button.setAttribute('aria-label', `${pattern.name} — ${pattern.kind}`);
  const preview = document.createElement('canvas');
  preview.width = 108;
  preview.height = 90;
  preview.setAttribute('aria-hidden', 'true');
  const ctx = preview.getContext('2d');
  const w = Math.max(...pattern.cells.map(([x]) => x)) + 1,
    h = Math.max(...pattern.cells.map(([, y]) => y)) + 1;
  const cell = Math.min(12, 100 / w, 76 / h);
  ctx.fillStyle = '#607e45';
  for (const [x, y] of pattern.cells)
    ctx.fillRect(
      x * cell,
      (90 - h * cell) / 2 + y * cell,
      Math.max(1, cell - 1),
      Math.max(1, cell - 1),
    );
  const name = document.createElement('span');
  name.className = 'pattern-name';
  name.textContent = pattern.name;
  button.append(preview, name);
  button.addEventListener('click', () =>
    fresh(seedPattern(pattern, SIZE), pattern.kind, pattern.id),
  );
  $('patterns').append(button);
}
function point(event) {
  const rect = canvas.getBoundingClientRect();
  return [
    Math.max(
      0,
      Math.min(
        63,
        Math.floor(((event.clientX - rect.left) / rect.width) * SIZE),
      ),
    ),
    Math.max(
      0,
      Math.min(
        63,
        Math.floor(((event.clientY - rect.top) / rect.height) * SIZE),
      ),
    ),
  ];
}
function paint(to) {
  const from = lastCell || to,
    length = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  for (let n = 0; n <= length; n++) {
    const t = length ? n / length : 0;
    const x = Math.round(from[0] + (to[0] - from[0]) * t),
      y = Math.round(from[1] + (to[1] - from[1]) * t);
    cells[y * SIZE + x] = Number(tool !== 'erase');
    trails[y * SIZE + x] = 0;
  }
  lastCell = to;
  cursor = to;
  generation = 0;
  baseline = cells.slice();
  render();
  for (const button of document.querySelectorAll('.pattern'))
    button.setAttribute('aria-pressed', 'false');
}
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || pointer) return;
  if (tool === 'pan' && event.pointerType === 'touch') return;
  pointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    left: $('viewport').scrollLeft,
    top: $('viewport').scrollTop,
  };
  canvas.setPointerCapture(event.pointerId);
  if (tool !== 'pan') {
    pause();
    keyboardCursor = false;
    lastCell = null;
    paint(point(event));
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (tool === 'pan') {
    $('viewport').scrollLeft = pointer.left - (event.clientX - pointer.x);
    $('viewport').scrollTop = pointer.top - (event.clientY - pointer.y);
  } else paint(point(event));
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(name, () => {
    if (pointer && tool !== 'pan')
      track('simulation_board_edited', { tool, population: population() });
    pointer = null;
    lastCell = null;
  });
canvas.addEventListener('keydown', (event) => {
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    keyboardCursor = true;
    const delta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    cursor = cursor.map((value, index) => (value + delta[index] + SIZE) % SIZE);
    const view = $('viewport'),
      unit = canvas.getBoundingClientRect().width / SIZE;
    const x = cursor[0] * unit,
      y = cursor[1] * unit;
    if (x < view.scrollLeft || x + unit > view.scrollLeft + view.clientWidth)
      view.scrollLeft = x - view.clientWidth / 2;
    if (y < view.scrollTop || y + unit > view.scrollTop + view.clientHeight)
      view.scrollTop = y - view.clientHeight / 2;
    render();
  } else if (event.code === 'Space') {
    event.preventDefault();
    pause();
    keyboardCursor = true;
    const index = cursor[1] * SIZE + cursor[0];
    cells[index] = 1 - cells[index];
    track('simulation_board_edited', {
      tool: 'keyboard',
      population: population(),
    });
    trails[index] = 0;
    generation = 0;
    baseline = cells.slice();
    for (const button of document.querySelectorAll('.pattern'))
      button.setAttribute('aria-pressed', 'false');
    render();
  } else return;
  $('cursor-status').textContent =
    `Row ${cursor[1] + 1}, column ${cursor[0] + 1}, ${cells[cursor[1] * SIZE + cursor[0]] ? 'alive' : 'empty'}`;
});
document.addEventListener('keydown', (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.repeat ||
    ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(
      event.target.tagName,
    )
  )
    return;
  if (event.code === 'Space' && event.target !== canvas) {
    event.preventDefault();
    togglePlay();
  }
  if (event.code === 'KeyN' && !playing) {
    event.preventDefault();
    advance(1);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('pagehide', pause);
for (const id of ['play', 'step', 'fast', 'reset', 'random', 'clear'])
  $(id).disabled = false;
render();
state();
canvas.dataset.ready = 'true';
notice(
  'Glider gun loaded. This little factory makes a new glider every 30 generations.',
);
