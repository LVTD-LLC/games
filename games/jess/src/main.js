import { Chess } from 'chess.js';
import { pieceSVG, pieceName } from './pieces.js';
import { track } from './analytics.js';
import './style.css';
const $ = (id) => document.getElementById(id);
const KEY = 'lvtd-jess-v1:game';
const MAX_PLIES = 600;
const uci = (move) => move.from + move.to + (move.promotion || '');
const color = (side) => (side === 'w' ? 'White' : 'Black');
let chess = new Chess(),
  player = null,
  flipped = false,
  selected = null;
let busy = false,
  failure = '',
  insight = null,
  promotion = null,
  controller = null,
  generation = 0;
let focusSquare = 'e2';
function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (
      !data ||
      !['w', 'b'].includes(data.player) ||
      !Array.isArray(data.moves) ||
      data.moves.length > MAX_PLIES
    )
      return;
    const restored = new Chess();
    for (const move of data.moves) {
      if (
        typeof move !== 'string' ||
        !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) ||
        restored.isGameOver()
      )
        return;
      restored.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move[4],
      });
    }
    chess = restored;
    player = data.player;
    flipped = typeof data.flipped === 'boolean' ? data.flipped : player === 'b';
  } catch {
    /* Storage can be unavailable or corrupted. */
  }
}
function save() {
  try {
    if (!player) localStorage.removeItem(KEY);
    else
      localStorage.setItem(
        KEY,
        JSON.stringify({
          player,
          flipped,
          moves: chess.history({ verbose: true }).map(uci),
        }),
      );
  } catch {
    /* Play works without storage. */
  }
}
function finished() {
  return chess.isGameOver() || chess.history().length >= MAX_PLIES;
}
function outcome() {
  if (chess.isCheckmate())
    return chess.turn() === player
      ? 'Checkmate. Jev wins.'
      : 'Checkmate. You win!';
  if (chess.isStalemate()) return 'Draw by stalemate.';
  if (chess.isThreefoldRepetition()) return 'Draw by repetition.';
  if (chess.isInsufficientMaterial()) return 'Draw. Not enough material.';
  if (chess.isDrawByFiftyMoves()) return 'Draw by the 50-move rule.';
  if (chess.history().length >= MAX_PLIES)
    return 'Draw. Session limit reached.';
  return 'Draw.';
}
function squares() {
  const files = [...'abcdefgh'];
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
  if (flipped) {
    files.reverse();
    ranks.reverse();
  }
  return ranks.flatMap((rank) => files.map((file) => file + rank));
}
function renderBoard() {
  const active = document.activeElement?.dataset.square;
  const last = chess.history({ verbose: true }).at(-1);
  const legal = selected
    ? chess.moves({ square: selected, verbose: true })
    : [];
  const nodes = squares().map((square, index) => {
    const piece = chess.get(square),
      button = document.createElement('button');
    const target = legal.some((move) => move.to === square);
    button.className = [
      'square',
      (square.charCodeAt(0) + Number(square[1])) % 2 === 0 ? 'dark' : '',
      piece ? 'occupied' : '',
      last && [last.from, last.to].includes(square) ? 'last' : '',
      selected === square ? 'selected' : '',
      target ? 'legal' : '',
      piece?.type === 'k' && piece.color === chess.turn() && chess.isCheck()
        ? 'check'
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    button.dataset.square = square;
    button.tabIndex = square === focusSquare ? 0 : -1;
    button.setAttribute(
      'aria-label',
      `${square}, ${piece ? color(piece.color) + ' ' + pieceName[piece.type] : 'empty'}${target ? ', legal destination' : ''}`,
    );
    button.setAttribute('aria-pressed', String(selected === square));
    // Only locally defined SVG paths and validated board coordinates enter HTML.
    button.innerHTML =
      (piece ? pieceSVG(piece) : '') +
      (index % 8 === 0
        ? `<span class="coordinate rank" aria-hidden="true">${square[1]}</span>`
        : '') +
      (index >= 56
        ? `<span class="coordinate file" aria-hidden="true">${square[0]}</span>`
        : '');
    return button;
  });
  $('board').replaceChildren(...nodes);
  if (active)
    $('board')
      .querySelector(`[data-square="${active}"]`)
      ?.focus({ preventScroll: true });
}
function render() {
  renderBoard();
  const over = player && finished();
  $('setup').hidden = Boolean(player);
  $('game-status').hidden = !player;
  $('player-color').textContent = player
    ? `Playing ${color(player)}`
    : 'Pick your side';
  $('opponent-color').textContent = player
    ? `Playing ${color(player === 'w' ? 'b' : 'w')}`
    : 'Your AI opponent';
  $('player-badge').textContent =
    player && !over && chess.turn() === player ? 'YOUR TURN' : '';
  $('opponent-badge').textContent = !player
    ? 'READY WHEN YOU ARE'
    : busy
      ? 'THINKING…'
      : over
        ? 'GOOD GAME'
        : chess.turn() !== player
          ? 'JEV’S TURN'
          : '';
  $('move-number').textContent =
    `MOVE ${Math.floor(chess.history().length / 2) + 1}`;
  $('status').textContent = over
    ? outcome()
    : failure
      ? 'A moment, please.'
      : busy
        ? 'Jev is thinking…'
        : chess.isCheck()
          ? 'You’re in check.'
          : 'Your move.';
  $('status-detail').textContent = over
    ? 'Another game? Pick New game below the board.'
    : failure ||
      (busy
        ? 'One board. Every legal move. A judgment call.'
        : chess.isCheck()
          ? 'Protect your king. Legal escapes are highlighted when you select a piece.'
          : 'Select a piece to see where it can go.');
  $('retry').hidden = !failure || Boolean(over) || busy;
  $('undo').disabled =
    !player ||
    chess.history().length === 0 ||
    (player === 'b' && chess.history().length === 1);
  const history = chess.history();
  $('ply-count').textContent =
    `${history.length} ${history.length === 1 ? 'move' : 'moves'}`;
  $('empty-history').hidden = history.length > 0;
  const items = [];
  for (let i = 0; i < history.length; i += 2) {
    const item = document.createElement('li');
    for (const text of [
      String(i / 2 + 1) + '.',
      history[i],
      history[i + 1] || '—',
    ]) {
      const span = document.createElement('span');
      span.textContent = text;
      item.append(span);
    }
    items.push(item);
  }
  $('history').replaceChildren(...items);
  $('history').scrollTop = $('history').scrollHeight;
  $('probabilities').replaceChildren();
  $('insight-summary').textContent = insight
    ? `Jev played ${insight.san}, choosing from ${insight.probabilities.length} legal moves.`
    : 'A little peek into your opponent’s mind.';
  if (insight)
    for (const entry of insight.probabilities.slice(0, 3)) {
      const row = document.createElement('li');
      row.className = 'probability-row';
      const san = document.createElement('strong');
      san.textContent = entry.san;
      const meter = document.createElement('span');
      meter.className = 'meter';
      meter.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('i');
      fill.style.width = `${entry.probability * 100}%`;
      meter.append(fill);
      const value = document.createElement('span');
      value.textContent = `${(entry.probability * 100).toFixed(1)}%`;
      row.append(san, meter, value);
      $('probabilities').append(row);
    }
}
function cancelRequest() {
  generation++;
  controller?.abort();
  controller = null;
  busy = false;
  failure = '';
}
function recordFinish() {
  if (finished())
    track('game_completed', {
      outcome: chess.isCheckmate()
        ? chess.turn() === player
          ? 'loss'
          : 'win'
        : 'draw',
    });
}
async function askJev() {
  if (!player || finished() || chess.turn() === player || busy) return;
  busy = true;
  failure = '';
  selected = null;
  const turn = ++generation,
    fen = chess.fen();
  const requestController = new AbortController();
  controller = requestController;
  const timer = setTimeout(() => requestController.abort(), 18000);
  render();
  try {
    const response = await fetch('/api/jess/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player,
        moves: chess.history({ verbose: true }).map(uci),
      }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (turn !== generation || chess.fen() !== fen) return;
    if (!response.ok)
      throw new Error(
        typeof data.error === 'string'
          ? data.error
          : 'Jev is unavailable. Please retry.',
      );
    const legal = chess.moves({ verbose: true });
    const move = legal.find((m) => uci(m) === data.move);
    if (
      data.fen !== fen ||
      !move ||
      !Array.isArray(data.probabilities) ||
      data.probabilities.length !== legal.length ||
      new Set(data.probabilities.map((m) => m.id)).size !== legal.length ||
      data.probabilities.some(
        (entry) =>
          !legal.some((m) => uci(m) === entry.id) ||
          !Number.isFinite(entry.probability) ||
          entry.probability < 0 ||
          entry.probability > 1,
      )
    )
      throw new Error('Jev’s reply could not be read. Please retry.');
    insight = {
      san: move.san,
      probabilities: data.probabilities
        .map((entry) => ({
          ...entry,
          san: legal.find((m) => uci(m) === entry.id).san,
        }))
        .sort((a, b) => b.probability - a.probability),
    };
    chess.move(move);
    save();
    recordFinish();
    track('jess_move_played', {
      actor: 'jev',
      move_count: chess.history().length,
    });
  } catch (error) {
    if (turn === generation) {
      failure =
        error.name === 'AbortError'
          ? 'Jev took too long. Your board is safe; try again.'
          : error.message;
      track('game_api_failed', { operation: 'chess_move' });
    }
  } finally {
    clearTimeout(timer);
    if (turn === generation) {
      busy = false;
      controller = null;
      render();
    }
  }
}
function play(move) {
  chess.move(move);
  selected = null;
  promotion = null;
  insight = null;
  save();
  recordFinish();
  render();
  track('jess_move_played', {
    actor: 'human',
    move_count: chess.history().length,
  });
  void askJev();
}
function select(square) {
  focusSquare = square;
  if (!player || busy || finished() || chess.turn() !== player) return;
  const options = selected
    ? chess
        .moves({ square: selected, verbose: true })
        .filter((m) => m.to === square)
    : [];
  if (options.length) {
    if (options.some((m) => m.promotion)) {
      promotion = options;
      $('promotion').showModal();
    } else play(options[0]);
    return;
  }
  selected =
    chess.get(square)?.color === player && selected !== square ? square : null;
  renderBoard();
}
$('board').addEventListener('click', (event) => {
  const button = event.target.closest('[data-square]');
  if (button) select(button.dataset.square);
});
$('board').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    selected = null;
    renderBoard();
    return;
  }
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[
    event.key
  ];
  if (!delta) return;
  event.preventDefault();
  const order = squares();
  const index = order.indexOf(event.target.dataset.square);
  const next = index + delta;
  if (
    next < 0 ||
    next >= 64 ||
    (Math.abs(delta) === 1 && Math.floor(next / 8) !== Math.floor(index / 8))
  )
    return;
  focusSquare = order[next];
  for (const button of $('board').children)
    button.tabIndex = button.dataset.square === focusSquare ? 0 : -1;
  $('board').querySelector(`[data-square="${focusSquare}"]`).focus();
});
for (const button of document.querySelectorAll('[data-side]'))
  button.addEventListener('click', () => {
    cancelRequest();
    chess = new Chess();
    player =
      button.dataset.side === 'random'
        ? crypto.getRandomValues(new Uint8Array(1))[0] % 2
          ? 'w'
          : 'b'
        : button.dataset.side;
    flipped = player === 'b';
    selected = null;
    insight = null;
    focusSquare = player === 'w' ? 'e2' : 'e7';
    save();
    render();
    track('game_started', { mode: 'jev', side: player });
    $('board')
      .querySelector(`[data-square="${focusSquare}"]`)
      .focus({ preventScroll: true });
    void askJev();
  });
$('retry').addEventListener('click', () => void askJev());
$('flip').addEventListener('click', () => {
  flipped = !flipped;
  save();
  renderBoard();
});
$('undo').addEventListener('click', () => {
  cancelRequest();
  selected = null;
  insight = null;
  chess.undo();
  if (chess.turn() !== player) chess.undo();
  save();
  render();
  track('jess_takeback');
});
function reset() {
  cancelRequest();
  chess = new Chess();
  player = null;
  selected = null;
  insight = null;
  flipped = false;
  save();
  render();
  document.querySelector('[data-side="w"]').focus();
}
$('new-game').addEventListener('click', () => {
  if (player) $('restart').showModal();
  else reset();
});
$('cancel-restart').addEventListener('click', () => $('restart').close());
$('confirm-restart').addEventListener('click', () => {
  $('restart').close();
  reset();
});
$('cancel-promotion').addEventListener('click', () => {
  promotion = null;
  $('promotion').close();
});
$('promotion').addEventListener('cancel', () => {
  promotion = null;
});
for (const button of document.querySelectorAll('[data-promotion]'))
  button.addEventListener('click', () => {
    const move = promotion?.find(
      (m) => m.promotion === button.dataset.promotion,
    );
    if (!move) return;
    $('promotion').close();
    play(move);
  });
restore();
render();
void askJev();
