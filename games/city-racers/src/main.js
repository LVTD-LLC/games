import './style.css';
import {
  COLORS,
  createRace,
  settingsFrom,
  tickRace,
  getTrack,
} from './race.mjs';
import { KEY_ACTIONS, readInputs } from './input.mjs';
import { createWorld } from './world.js';
const $ = (id) => document.getElementById(id);
const STORAGE = 'lvtd-city-racers-v1:settings';
let saved;
try {
  saved = JSON.parse(localStorage.getItem(STORAGE));
} catch {
  /* Optional storage. */
}
let settings = settingsFrom(saved),
  race = createRace(settings),
  world;
let resumePhase = 'racing',
  last = performance.now(),
  lastCount = '';
const keys = new Set(),
  pointers = new Map();
const colorNames = ['Coral', 'Blue', 'Green', 'Yellow', 'Purple'];

// Both touch pads use the same pointer pipeline, including simultaneous holds.
const secondPad = $('touch-controls').cloneNode(true);
secondPad.id = 'touch-controls-two';
secondPad.classList.add('touch-controls-two');
secondPad.setAttribute('aria-label', 'Player 2 driving controls');
secondPad.querySelectorAll('[data-drive]').forEach((button) => {
  button.dataset.player = '1';
  button.setAttribute(
    'aria-label',
    `Player 2 ${button.getAttribute('aria-label').toLowerCase()}`,
  );
  button.textContent = { accelerate: 'W', brake: 'S', left: 'A', right: 'D' }[
    button.dataset.drive
  ];
});
$('touch-controls').after(secondPad);
const secondCountdown = $('countdown').cloneNode(true);
secondCountdown.id = 'countdown-two';
secondCountdown.removeAttribute('role');
secondCountdown.removeAttribute('aria-live');
secondCountdown.setAttribute('aria-hidden', 'true');
$('countdown').after(secondCountdown);
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
  settings = settingsFrom(settings);
  $('car-count').value = settings.count;
  $('fewer').disabled = settings.count === settings.players;
  $('more').disabled = settings.count === 6;
  $('car-dots').replaceChildren(
    ...Array.from({ length: settings.count }, () =>
      document.createElement('i'),
    ),
  );
  $('solo').setAttribute('aria-pressed', String(settings.players === 1));
  $('duo').setAttribute('aria-pressed', String(settings.players === 2));
  $('player-two-color').hidden = settings.players !== 2;
  $('color-label').textContent =
    settings.players === 2 ? 'Player 1 · Arrow keys' : 'Pick your color';
  $('count-note').textContent =
    settings.players === 2 ? 'including both drivers' : 'including you';
  $('players-help').textContent =
    settings.players === 2
      ? 'Same keyboard · 1: Arrows · 2: WASD'
      : 'Arrow keys · A little help with the corners';
  $('map').value = settings.map;
  $('route-name').textContent = getTrack(settings.map).name;
  $('route-description').textContent = getTrack(settings.map).description;
  document.querySelectorAll('[data-color]').forEach((button) => {
    const second = button.dataset.player === '1';
    button.setAttribute(
      'aria-pressed',
      String(
        button.dataset.color === (second ? settings.color2 : settings.color),
      ),
    );
    button.disabled = second && button.dataset.color === settings.color;
  });
  $('game').style.setProperty('--player-one', settings.color);
  $('game').style.setProperty('--player-two', settings.color2);
  race = createRace(settings);
  if (world) {
    phase('garage');
    world.resetCamera();
  }
  try {
    localStorage.setItem(STORAGE, JSON.stringify(settings));
  } catch {
    /* Keep playing. */
  }
}
for (const player of [0, 1])
  COLORS.forEach((color, i) => {
    const button = document.createElement('button');
    button.dataset.color = color;
    button.dataset.player = String(player);
    button.style.backgroundColor = color;
    button.setAttribute(
      'aria-label',
      `${player ? 'Player 2 ' : ''}${colorNames[i]}`,
    );
    button.addEventListener('click', () => {
      settings[player ? 'color2' : 'color'] = color;
      updateSettings();
    });
    $(player ? 'colors-two' : 'colors').append(button);
  });
$('solo').addEventListener('click', () => {
  settings.players = 1;
  updateSettings();
});
$('duo').addEventListener('click', () => {
  settings.players = 2;
  updateSettings();
});
$('map').addEventListener('change', () => {
  settings.map = $('map').value;
  updateSettings();
});
$('fewer').addEventListener('click', () => {
  settings.count--;
  updateSettings();
});
$('more').addEventListener('click', () => {
  settings.count++;
  updateSettings();
});
updateSettings();

function drivingUI(show) {
  const two = settings.players === 2;
  $('game').classList.toggle('split', show && two);
  $('hud').hidden = !show;
  $('hud-two').hidden = !show || !two;
  $('driver-tag').hidden = !two;
  $('split-divider').hidden = !show || !two;
  $('touch-controls').hidden = !show;
  secondPad.hidden = !show || !two;
  $('pause').hidden = !show;
}
function showModal(finished) {
  clearInput();
  for (const id of [
    'countdown',
    'countdown-two',
    'drive-hint',
    'drive-hint-two',
    'touch-controls',
    'touch-controls-two',
    'pause',
  ])
    $(id).hidden = true;
  $('modal').hidden = false;
  $('result-title').textContent = finished
    ? 'Nice driving!'
    : 'Taking a little break';
  $('result-copy').textContent = finished
    ? settings.players === 2
      ? 'Both drivers made it around the city. Great teamwork!'
      : 'You made it all the way around the city. Let’s do it again!'
    : 'Your cars are right where you left them.';
  $('result-icon').textContent = finished ? '★' : 'Ⅱ';
  $('continue').textContent = finished ? 'Race again →' : 'Keep driving →';
  $('continue').focus();
  for (const id of ['garage', 'hud', 'hud-two']) $(id).inert = true;
  document.querySelector('.topbar').inert = true;
}
function closeModal() {
  $('modal').hidden = true;
  for (const id of ['garage', 'hud', 'hud-two']) $(id).inert = false;
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
  drivingUI(true);
  document.querySelectorAll('[data-drive]').forEach((button) => {
    button.disabled = false;
  });
  $('pause').focus({ preventScroll: true });
  world.resetCamera();
  last = performance.now();
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
  drivingUI(true);
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
  drivingUI(false);
  $('garage').hidden = false;
  $('route-card').hidden = false;
  $('start').focus();
  world.resetCamera();
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    if (!event.repeat) {
      if (race.phase === 'paused') resume();
      else pause();
    }
    return;
  }
  const action = KEY_ACTIONS[event.code];
  if (
    action &&
    action[0] < settings.players &&
    ['countdown', 'racing'].includes(race.phase)
  ) {
    event.preventDefault();
    keys.add(event.code);
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
window.addEventListener('keyup', (event) => keys.delete(event.code));
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
  const player = Number(button.dataset.player || 0),
    action = button.dataset.drive;
  button.addEventListener('pointerdown', (event) => {
    if (
      !['countdown', 'racing'].includes(race.phase) ||
      race.drivers[player]?.finishTime !== null
    )
      return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, [player, action]);
    button.classList.add('pressed');
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    if (![...pointers.values()].some(([p, a]) => p === player && a === action))
      button.classList.remove('pressed');
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    button.addEventListener(event, release);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
});
function fail() {
  clearInput();
  phase('error');
  closeModal();
  drivingUI(false);
  for (const id of [
    'garage',
    'countdown',
    'countdown-two',
    'drive-hint',
    'drive-hint-two',
    'route-card',
  ])
    $(id).hidden = true;
  $('error').textContent =
    'Your browser couldn’t start the 3D city. Try reloading, or open this game in a browser with graphics acceleration enabled. You can also go back to All games.';
  $('error').hidden = false;
}
function updateHUD() {
  race.drivers.forEach((driver, i) => {
    const suffix = i ? '-two' : '',
      progress = $(`progress${suffix}`),
      hint = $(`drive-hint${suffix}`);
    const percent = Math.floor((driver.distance / race.length) * 100);
    progress.style.width = `${percent}%`;
    progress.parentElement.setAttribute('aria-valuenow', percent);
    $(`speed${suffix}`).textContent = Math.round(driver.speed * 3.6);
    const finished = driver.finishTime !== null;
    hint.hidden = race.phase !== 'racing' || (!finished && driver.speed > 3);
    const hintText = finished
      ? `Finished! Cheer on Player ${i ? '1' : '2'}.`
      : `Hold ${i ? 'W' : '↑'} to go!`;
    if (hint.textContent !== hintText) hint.textContent = hintText;
    $(`touch-controls${suffix}`)
      .querySelectorAll('button')
      .forEach((button) => {
        button.disabled = finished;
      });
  });
}
async function boot() {
  try {
    world = await createWorld($('world'), settings);
    phase('garage');
    $('start-label').textContent = 'Let’s drive!';
    $('start').disabled = false;
    world.renderer.onDeviceLost = fail;
    world.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      fail();
    });
    const animate = (now) => {
      if (race.phase === 'error') return;
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      const previous = race.phase;
      tickRace(race, readInputs(keys, pointers, settings.players), dt);
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
      secondCountdown.hidden = settings.players !== 2 || $('countdown').hidden;
      if (secondCountdown.textContent !== $('countdown').textContent)
        secondCountdown.textContent = $('countdown').textContent;
      updateHUD();
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
