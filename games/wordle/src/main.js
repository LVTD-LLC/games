import './style.css';
import dictionary from './allowed.json';
import {
  ANSWERS,
  normalize,
  score,
  dailyAnswer,
  dayKey,
  restore,
  shareText,
} from './engine.mjs';

const $ = (id) => document.getElementById(id);
const allowed = new Set([...dictionary, ...ANSWERS]);
const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Play remains available when storage is blocked. */
    }
  },
};
let mode = 'daily',
  date = dayKey(),
  answer,
  guesses = [],
  input = '';
const keyPrefix = 'lvtd-wordle-v1:';
const stateKey = () => keyPrefix + (mode === 'daily' ? date : 'practice');
const finished = () => guesses.includes(answer) || guesses.length === 6;
const announce = (text) => {
  $('message').textContent = text;
};
const randomAnswer = (previous) => {
  const candidates = ANSWERS.filter((word) => word !== previous);
  return candidates[
    crypto.getRandomValues(new Uint32Array(1))[0] % candidates.length
  ];
};

function loadGame(nextMode, fresh = false) {
  mode = nextMode;
  date = dayKey();
  input = '';
  let raw = storage.get(stateKey());
  if (mode === 'daily') answer = dailyAnswer(date);
  else {
    let saved;
    try {
      saved = JSON.parse(raw);
    } catch {
      /* Start a new practice round. */
    }
    answer =
      !fresh && ANSWERS.includes(saved?.answer)
        ? saved.answer
        : randomAnswer(answer);
    if (fresh || answer !== saved?.answer) raw = null;
  }
  guesses = restore(raw, answer, allowed);
  save();
  render();
  announce(
    finished()
      ? guesses.includes(answer)
        ? 'Отличная работа!'
        : 'Хорошая попытка. Продолжим?'
      : 'Начните с любого слова из пяти букв',
  );
}
function save() {
  storage.set(stateKey(), {
    guesses,
    ...(mode === 'practice' ? { answer } : {}),
  });
  if (mode === 'daily' && finished()) {
    let history;
    try {
      history = JSON.parse(storage.get(keyPrefix + 'history')) || {};
    } catch {
      history = {};
    }
    if (!history || typeof history !== 'object' || Array.isArray(history))
      history = {};
    history[date] = { won: guesses.includes(answer), attempts: guesses.length };
    storage.set(keyPrefix + 'history', history);
  }
}
function render() {
  $('daily').setAttribute('aria-pressed', String(mode === 'daily'));
  $('practice').setAttribute('aria-pressed', String(mode === 'practice'));
  $('puzzle-label').textContent =
    mode === 'daily'
      ? new Intl.DateTimeFormat('ru-RU', {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }).format(new Date(date))
      : 'БЕЗ ОГРАНИЧЕНИЙ';
  $('attempts').textContent = `${guesses.length} / 6 попыток`;
  $('mode-note').textContent =
    mode === 'daily'
      ? 'Новое слово каждый день в 00:00 UTC.'
      : 'Новое слово — когда захотите.';
  $('new-practice').hidden = mode !== 'practice' || finished();
  const fragment = document.createDocumentFragment();
  const keyStates = {};
  const priority = { absent: 1, present: 2, correct: 3 };
  const labels = {
    correct: 'на месте',
    present: 'в другом месте',
    absent: 'нет в слове',
  };
  for (let row = 0; row < 6; row++) {
    const word = guesses[row] || (row === guesses.length ? input : '');
    const states = guesses[row] ? score(word, answer) : [];
    const line = document.createElement('div');
    line.className = 'row';
    line.setAttribute('role', 'group');
    line.setAttribute('aria-label', `Попытка ${row + 1}`);
    for (let col = 0; col < 5; col++) {
      const tile = document.createElement('div');
      const letter = word[col] || '';
      tile.className = `tile ${states[col] || (letter ? 'filled' : '')} ${row === guesses.length && !finished() ? 'active' : ''}`;
      tile.textContent = letter.toUpperCase();
      tile.setAttribute(
        'aria-label',
        letter
          ? `${letter.toUpperCase()}${states[col] ? ': ' + labels[states[col]] : ''}`
          : `Пустая клетка ${col + 1}`,
      );
      line.append(tile);
      if (
        states[col] &&
        priority[states[col]] > (priority[keyStates[letter]] || 0)
      )
        keyStates[letter] = states[col];
    }
    fragment.append(line);
  }
  $('board').replaceChildren(fragment);
  document.querySelectorAll('[data-key]').forEach((button) => {
    const letter = button.dataset.key;
    button.className = `key ${letter.length > 1 ? 'wide' : ''} ${keyStates[letter] || ''}`;
    button.setAttribute(
      'aria-label',
      letter === 'Enter'
        ? 'Проверить слово'
        : letter === 'Backspace'
          ? 'Удалить букву'
          : `${letter.toUpperCase()}${keyStates[letter] ? ': ' + labels[keyStates[letter]] : ''}`,
    );
    button.disabled = finished();
  });
  $('result').hidden = !finished();
  $('share-fallback').hidden = true;
  if (finished()) {
    $('result-text').textContent = guesses.includes(answer)
      ? `Есть! ${answer.toUpperCase()} — за ${guesses.length} ${guesses.length === 1 ? 'попытку' : guesses.length < 5 ? 'попытки' : 'попыток'}.`
      : `Загаданное слово — ${answer.toUpperCase()}.`;
    $('next').textContent =
      mode === 'daily' ? 'Играть в практике →' : 'Ещё слово →';
  }
}
function handleKey(key) {
  if (mode === 'daily' && date !== dayKey()) {
    loadGame('daily');
    announce('Наступил новый день — новое слово уже здесь!');
    return;
  }
  if (finished()) return;
  if (key === 'Backspace') input = input.slice(0, -1);
  else if (key === 'Enter') {
    if (input.length !== 5) {
      announce('Нужно пять букв');
      return;
    }
    if (!allowed.has(input)) {
      announce('Такого слова нет в словаре. Попробуйте существительное.');
      return;
    }
    if (guesses.includes(input)) {
      announce('Это слово уже было — попробуйте другое');
      return;
    }
    guesses.push(input);
    input = '';
    save();
    announce(
      finished()
        ? guesses.includes(answer)
          ? 'Слово найдено! Отличная работа.'
          : 'Все шесть попыток использованы'
        : 'Попытка принята. Посмотрите на цвета букв.',
    );
  } else if (/^[а-яё]$/i.test(key) && input.length < 5) {
    document.activeElement?.blur();
    input += normalize(key);
  }
  render();
}
for (const row of [
  'йцукенгшщзхъ',
  'фывапролджэ',
  'Enter ячсмитьбю Backspace',
]) {
  const line = document.createElement('div');
  line.className = 'key-row';
  const keys = row.includes(' ')
    ? ['Enter', ...'ячсмитьбю', 'Backspace']
    : [...row];
  keys.forEach((key) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = key;
    button.textContent =
      key === 'Enter' ? 'Ввод' : key === 'Backspace' ? '⌫' : key.toUpperCase();
    button.addEventListener('click', () => handleKey(key));
    line.append(button);
  });
  $('keyboard').append(line);
}
const latin = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const cyrillic = 'йцукенгшщзхъфывапролджэячсмитьбюё';
document.addEventListener('keydown', (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    document.querySelector('dialog[open]') ||
    ['TEXTAREA', 'INPUT'].includes(event.target.tagName)
  )
    return;
  // Enter/Space on a focused control must retain native keyboard activation.
  if (event.key === 'Enter' && event.target.closest('button,a')) return;
  let key = event.key;
  if (key.length === 1) {
    const index = latin.indexOf(key.toLowerCase());
    if (index !== -1) key = cyrillic[index];
  }
  if (key === 'Enter' || key === 'Backspace' || /^[а-яё]$/i.test(key)) {
    event.preventDefault();
    handleKey(key);
  }
});
// Clicked virtual keys should not trap later physical Enter on that letter.
$('keyboard').addEventListener('click', (event) => {
  if (event.target.matches('button')) event.target.blur();
});
$('daily').onclick = () => loadGame('daily');
$('practice').onclick = () => loadGame('practice');
$('next').onclick = () => loadGame('practice', true);
$('new-practice').onclick = () => loadGame('practice', true);
$('help').onclick = () => $('help-dialog').showModal();
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.querySelector('.close').onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
});
$('share').onclick = async () => {
  const text = shareText(guesses, answer, mode === 'daily' ? date : 'Практика');
  try {
    await navigator.clipboard.writeText(text);
    announce('Результат скопирован — можно отправлять друзьям');
  } catch {
    $('share-fallback').hidden = false;
    $('share-fallback').value = text;
    $('share-fallback').focus();
    $('share-fallback').select();
    announce('Скопируйте результат из поля ниже');
  }
};
$('stats').onclick = () => {
  let history;
  try {
    history = JSON.parse(storage.get(keyPrefix + 'history'));
  } catch {
    /* Empty stats. */
  }
  const entries = Object.entries(history || {}).filter(
    ([d, v]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      v &&
      typeof v.won === 'boolean' &&
      Number.isInteger(v.attempts) &&
      v.attempts >= 1 &&
      v.attempts <= 6,
  );
  const wins = entries.filter(([, v]) => v.won);
  const container = $('stats-content');
  container.replaceChildren();
  const summary = document.createElement('div');
  summary.className = 'stats-summary';
  for (const [value, label] of [
    [entries.length, 'Сыграно'],
    [
      entries.length
        ? Math.round((wins.length / entries.length) * 100) + '%'
        : '—',
      'Побед',
    ],
    [
      wins.length
        ? (
            wins.reduce((sum, [, v]) => sum + v.attempts, 0) / wins.length
          ).toFixed(1)
        : '—',
      'В среднем',
    ],
  ]) {
    const item = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = value;
    const small = document.createElement('span');
    small.textContent = label;
    item.append(strong, small);
    summary.append(item);
  }
  container.append(summary);
  const title = document.createElement('h3');
  title.textContent = 'Распределение побед';
  container.append(title);
  for (let n = 1; n <= 6; n++) {
    const count = wins.filter(([, v]) => v.attempts === n).length;
    const row = document.createElement('div');
    row.className = 'stat-row';
    const label = document.createElement('span');
    label.textContent = String(n);
    const bar = document.createElement('b');
    bar.style.width = `${Math.max(8, (count / Math.max(wins.length, 1)) * 100)}%`;
    bar.textContent = String(count);
    row.append(label, bar);
    container.append(row);
  }
  $('stats-dialog').showModal();
};
window.addEventListener('focus', () => {
  if (mode === 'daily' && date !== dayKey()) loadGame('daily');
});
loadGame('daily');
