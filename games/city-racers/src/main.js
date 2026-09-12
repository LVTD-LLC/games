import './style.css';
import {
  COLORS,
  FINISH_DISTANCE,
  createRace,
  settingsFrom,
  tickRace,
} from './race.mjs';
import { createWorld } from './world.js';

const $ = (id) => document.getElementById(id);
const STORAGE = 'lvtd-city-racers-v1:settings';
let saved;
try {
  saved = JSON.parse(localStorage.getItem(STORAGE));
} catch {
  /* Storage is optional. */
}
let settings = settingsFrom(saved);
let race = createRace(settings);
let world;
let resumePhase = 'racing';
let last = performance.now();
let lastCount = '';
const keys = new Set();
const pointers = new Map();
const keyActions = {
  ArrowUp: 'accelerate',
  ArrowDown: 'brake',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
const colorNames = ['Coral', 'Blue', 'Green', 'Yellow', 'Purple'];

function clearInput() {
  keys.clear();
  pointers.clear();
  document
    .querySelectorAll('[data-drive]')
    .forEach((b) => b.classList.remove('pressed'));
}
function phase(value) {
  race.phase = value;
  $('game').dataset.phase = value;
}
function updateSettings() {
  $('car-count').value = settings.count;
  $('fewer').disabled = settings.count === 1;
  $('more').disabled = settings.count === 6;
  $('car-dots').replaceChildren(
    ...Array.from({ length: settings.count }, () =>
      document.createElement('i'),
    ),
  );
  document
    .querySelectorAll('[data-color]')
    .forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.color === settings.color),
      ),
    );
  race = createRace(settings);
  if (world) phase('garage');
  try {
    localStorage.setItem(STORAGE, JSON.stringify(settings));
  } catch {
    /* Keep playing without persistence. */
  }
}
COLORS.forEach((color, i) => {
  const button = document.createElement('button');
  button.dataset.color = color;
  button.style.backgroundColor = color;
  button.setAttribute('aria-label', colorNames[i]);
  button.addEventListener('click', () => {
    settings.color = color;
    updateSettings();
  });
  $('colors').append(button);
});
$('fewer').addEventListener('click', () => {
  settings.count = Math.max(1, settings.count - 1);
  updateSettings();
});
$('more').addEventListener('click', () => {
  settings.count = Math.min(6, settings.count + 1);
  updateSettings();
});
updateSettings();

function showModal(finished) {
  clearInput();
  $('countdown').hidden = true;
  $('drive-hint').hidden = true;
  $('touch-controls').hidden = true;
  $('pause').hidden = true;
  $('modal').hidden = false;
  $('result-title').textContent = finished
    ? 'Nice driving!'
    : 'Taking a little break';
  $('result-copy').textContent = finished
    ? 'You made it all the way around the city. Let’s do it again!'
    : 'Your car is right where you left it.';
  $('result-icon').textContent = finished ? '★' : 'Ⅱ';
  $('continue').replaceChildren(
    document.createTextNode(finished ? 'Race again →' : 'Keep driving →'),
  );
  $('continue').focus();
  $('garage').inert = true;
  $('hud').inert = true;
  document.querySelector('.topbar').inert = true;
}
function closeModal() {
  $('modal').hidden = true;
  $('garage').inert = false;
  $('hud').inert = false;
  document.querySelector('.topbar').inert = false;
}
function start() {
  if (!world) return;
  clearInput();
  closeModal();
  race = createRace(settings);
  phase('countdown');
  lastCount = '';
  $('garage').hidden = true;
  $('route-card').hidden = true;
  $('hud').hidden = false;
  $('pause').hidden = false;
  $('touch-controls').hidden = false;
  $('start').blur();
  $('pause').focus({ preventScroll: true });
  world.resetCamera();
}
function pause() {
  if (!['racing', 'countdown'].includes(race.phase)) return;
  resumePhase = race.phase;
  phase('paused');
  showModal(false);
}
function resume() {
  clearInput();
  closeModal();
  phase(resumePhase);
  $('pause').hidden = false;
  $('touch-controls').hidden = false;
  $('pause').focus({ preventScroll: true });
  lastCount = '';
  last = performance.now();
}
$('start').addEventListener('click', start);
$('pause').addEventListener('click', pause);
$('continue').addEventListener('click', () =>
  race.phase === 'paused' ? resume() : start(),
);
$('garage-button').addEventListener('click', () => {
  clearInput();
  closeModal();
  race = createRace(settings);
  phase('garage');
  $('garage').hidden = false;
  $('route-card').hidden = false;
  $('hud').hidden = true;
  $('pause').hidden = true;
  $('touch-controls').hidden = true;
  $('start').focus();
  world.resetCamera();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (race.phase === 'paused') resume();
    else pause();
    return;
  }
  if (keyActions[event.key] && ['countdown', 'racing'].includes(race.phase)) {
    event.preventDefault();
    keys.add(keyActions[event.key]);
  }
  if (event.key === 'Tab' && !$('modal').hidden) {
    const first = $('continue'),
      end = $('garage-button');
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      end.focus();
    } else if (!event.shiftKey && document.activeElement === end) {
      event.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener('keyup', (event) => {
  keys.delete(keyActions[event.key]);
});
window.addEventListener('blur', () => {
  clearInput();
  pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInput();
    pause();
  }
});
document.querySelectorAll('[data-drive]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    if (!['countdown', 'racing'].includes(race.phase)) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button.dataset.drive);
    button.classList.add('pressed');
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    if (![...pointers.values()].includes(button.dataset.drive))
      button.classList.remove('pressed');
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
});

function fail() {
  clearInput();
  phase('error');
  closeModal();
  for (const id of [
    'garage',
    'hud',
    'pause',
    'countdown',
    'drive-hint',
    'touch-controls',
    'route-card',
  ])
    $(id).hidden = true;
  $('error').textContent =
    'Your browser couldn’t start the 3D city. Try reloading, or open this game in a browser with graphics acceleration enabled. You can also go back to All games.';
  $('error').hidden = false;
}
async function boot() {
  try {
    world = await createWorld($('world'), settings);
    phase('garage');
    $('start-label').textContent = 'Let’s drive!';
    $('start').disabled = false;
    // Make a lost device recoverable rather than leaving a frozen race on screen.
    world.renderer.onDeviceLost = () => fail();
    world.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      fail();
    });
    const animate = (now) => {
      if (race.phase === 'error') return;
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      const input = Object.fromEntries(
        [...keys, ...pointers.values()].map((key) => [key, true]),
      );
      const previous = race.phase;
      tickRace(race, input, dt);
      if (race.phase !== previous) {
        $('game').dataset.phase = race.phase;
        if (race.phase === 'finished') showModal(true);
      }
      if (race.phase === 'countdown') {
        const count = String(Math.ceil(race.countdown));
        if (lastCount !== count) {
          $('countdown').textContent = count;
          lastCount = count;
        }
        $('countdown').hidden = false;
      } else if (race.phase === 'racing' && race.elapsed < 0.9) {
        if (lastCount !== 'Go!') {
          $('countdown').textContent = 'Go!';
          lastCount = 'Go!';
        }
        $('countdown').hidden = false;
      } else $('countdown').hidden = true;
      $('drive-hint').hidden = race.phase !== 'racing' || race.speed > 3;
      const percent = Math.round((race.distance / FINISH_DISTANCE) * 100);
      $('progress').style.width = `${percent}%`;
      $('progress').parentElement.setAttribute('aria-valuenow', percent);
      $('speed').textContent = Math.round(race.speed * 3.6);
      try {
        world.draw(race, settings, dt, race.phase === 'garage');
      } catch {
        fail();
        return;
      }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  } catch {
    fail();
  }
}
boot();
