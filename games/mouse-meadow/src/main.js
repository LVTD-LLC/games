import './style.css';
import { lessons, languages } from './lessons.js';
import { keyboardLesson } from './keyboard.js';

const $ = (id) => document.getElementById(id);
const art = import.meta.glob('./art/*.webp', {
  eager: true,
  import: 'default',
});
const picture = (name) => art[`./art/${name}.webp`];
const iconPaths = {
  muted: '<path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4zM15 8q4 4 0 8m3-11q7 7 0 14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 0 1 4.7.3c0 1.9-2.4 2.1-2.4 4.2m0 3h.01"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pointer: '<path d="m4 2 16 12-8 1-3.8 7z"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
};
const icon = (key) =>
  `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[key]}</svg>`;
document.querySelectorAll('[data-icon]').forEach((node) => {
  node.innerHTML = icon(node.dataset.icon);
});

const languageKey = 'lvtd-mouse-meadow-v1:language';
let language = 'ru';
try {
  if (localStorage.getItem(languageKey) === 'en') language = 'en';
} catch {}
const copy = () => languages[language];
const words = () => copy().activities[step().kind];
let removeKeyboard;
let stopHold;
const matchOrder = [1, 0, 2];
const done = lessons.map(() => new Set());
let current = 0;
let selectedBerry = null;
let drag = null;
let sound = false;
let audio;
const field = $('field');
const objects = $('objects');
const guide = $('guide');
const basketSpot = [81, 68];
const touch = matchMedia('(hover: none)');
const step = () => lessons[current];
const prompt = () => (touch.matches && words().touch) || words().prompt;

function speak(message) {
  if (!sound || !window.speechSynthesis || !window.SpeechSynthesisUtterance)
    return;
  speechSynthesis.cancel();
  const voice = speechSynthesis
    .getVoices()
    .find((voice) => voice.lang.toLowerCase().split(/[-_]/)[0] === language);
  if (!voice) return;
  const phrase = new SpeechSynthesisUtterance(message);
  Object.assign(phrase, { lang: voice.lang, voice, rate: 0.9 });
  speechSynthesis.speak(phrase);
}
// Load the browser's voice list before the first requested hint.
window.speechSynthesis?.getVoices();
function chime(count) {
  if (!sound || audio?.state !== 'running') return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = [392, 494, 587][count - 1];
  gain.gain.setValueAtTime(0.001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.34);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.35);
}
$('sound').onclick = () => {
  sound = !sound;
  $('sound').setAttribute('aria-pressed', String(sound));
  $('sound').querySelector('[data-icon]').innerHTML = icon(
    sound ? 'sound' : 'muted',
  );
  if (sound) {
    if (window.AudioContext) {
      audio ??= new AudioContext();
      audio
        .resume()
        .then(() => chime(1))
        .catch(() => {});
    }
    speak(prompt());
  } else {
    window.speechSynthesis?.cancel();
    audio?.suspend().catch(() => {});
  }
};
function place(node, [x, y]) {
  node.style.setProperty('--x', x + '%');
  node.style.setProperty('--y', y + '%');
}
function refreshHint() {
  if (step().key || step().kind === 'match') {
    $('hint').hidden = true;
    return;
  }
  const next = step().pieces.findIndex((_, i) => !done[current].has(i));
  const hint = $('hint');
  hint.hidden = next < 0 || !!drag;
  hint.classList.toggle(
    'carry',
    step().kind === 'berry' && selectedBerry === null,
  );
  hint.style.setProperty('--basket-x', basketSpot[0] + '%');
  hint.style.setProperty('--basket-y', basketSpot[1] + '%');
  if (next >= 0)
    place(hint, selectedBerry === null ? step().spots[next] : basketSpot);
}
function updateProgress() {
  const count = done[current].size;
  $('count').textContent = `${count} / 3`;
  $('result').hidden = count !== 3;
  $('advance').hidden = current === lessons.length - 1;
  $('advance').textContent = copy().advance;
  $('sample').hidden = step().kind !== 'match' || count === 3;
  if (!$('sample').hidden) {
    const i = matchOrder[count];
    const img = $('sample').querySelector('img');
    img.src = picture(step().pieces[i]);
    img.alt = copy().match + ' · ' + butterflyColor(i);
  }
  refreshHint();
}
function butterflyColor(i) {
  return (
    language === 'en'
      ? ['Orange butterfly', 'Blue butterfly', 'Yellow butterfly']
      : ['Оранжевая бабочка', 'Синяя бабочка', 'Жёлтая бабочка']
  )[i];
}
function decorate(node, i) {
  const finished = done[current].has(i);
  node.classList.toggle('done', finished);
  node.hidden = step().kind === 'berry' && finished;
  if (step().kind === 'rain') {
    node.querySelector('.plant').src = picture(finished ? 'flower' : 'bud');
  }
  const art = finished && step().kind === 'bud' ? 'flower' : step().pieces[i];
  node.querySelector('img').src = picture(art);
  const label = step().kind === 'match' ? butterflyColor(i) : words().label;
  node.setAttribute(
    'aria-label',
    `${label} ${i + 1}${finished ? ' — ' + copy().finished : ''}`,
  );
}
function updateBasket() {
  const basket = $('basket');
  if (!basket) return;
  basket.classList.toggle('ready', selectedBerry !== null);
  basket.querySelectorAll('.berry-in').forEach((img) => img.remove());
  [...done[current]].forEach((_, index) => {
    const berry = new Image();
    berry.src = picture('berry');
    berry.alt = '';
    berry.className = 'berry-in';
    berry.style.setProperty('--left', 18 + index * 19 + '%');
    berry.style.setProperty('--tilt', index * 14 - 12 + 'deg');
    basket.append(berry);
  });
}
function record(i) {
  done[current].add(i);
  updateProgress();
  chime(done[current].size);
  if (done[current].size === 3) speak(copy().success);
}
function finishPiece(i) {
  if (done[current].has(i)) return;
  selectedBerry = null;
  record(i);
  decorate(objects.querySelector(`[data-piece="${i}"]`), i);
  updateBasket();
}
function selectBerry(node, i) {
  selectedBerry = i;
  objects
    .querySelectorAll('.berry')
    .forEach((b) => b.classList.toggle('selected', b === node));
  updateBasket();
  refreshHint();
}
function resetDrag() {
  if (!drag) return;
  const { node, id, i } = drag;
  drag = null;
  if (node.hasPointerCapture(id)) node.releasePointerCapture(id);
  node.classList.remove('dragging');
  place(node, step().spots[i]);
  refreshHint();
}
function attachBerry(node, i) {
  node.onpointerdown = (e) => {
    if (!e.isPrimary || e.button !== 0 || drag) return;
    selectBerry(node, i);
    const box = node.getBoundingClientRect();
    drag = {
      id: e.pointerId,
      node,
      i,
      dx: box.left + box.width / 2 - e.clientX,
      dy: box.top + box.height / 2 - e.clientY,
    };
    node.setPointerCapture(e.pointerId);
    node.classList.add('dragging');
    refreshHint();
  };
  node.onpointermove = (e) => {
    if (drag?.node !== node || drag.id !== e.pointerId) return;
    const box = field.getBoundingClientRect();
    place(node, [
      ((e.clientX + drag.dx - box.left) * 100) / box.width,
      ((e.clientY + drag.dy - box.top) * 100) / box.height,
    ]);
  };
  node.onpointerup = (e) => {
    if (drag?.node !== node || drag.id !== e.pointerId) return;
    const b = $('basket').getBoundingClientRect();
    const hit =
      e.clientX >= b.left - 6 &&
      e.clientX <= b.right + 6 &&
      e.clientY >= b.top - 6 &&
      e.clientY <= b.bottom + 6;
    resetDrag();
    if (hit) finishPiece(i);
  };
  node.onlostpointercapture = node.onpointercancel = (e) => {
    if (drag?.id === e.pointerId) resetDrag();
  };
  node.onclick = (e) => {
    if (e.detail === 0) selectBerry(node, i);
  };
}
function attachCloud(node, i) {
  function start() {
    stopHold?.();
    if (done[current].has(i)) return;
    node.classList.add('watering');
    const timer = setTimeout(() => {
      stopHold?.();
      finishPiece(i);
    }, 650);
    stopHold = () => {
      clearTimeout(timer);
      node.classList.remove('watering');
      stopHold = null;
    };
  }
  const stop = () => {
    if (node.classList.contains('watering')) stopHold?.();
  };
  node.onpointerdown = (e) => {
    if (e.isPrimary && e.button === 0) {
      node.setPointerCapture(e.pointerId);
      start();
    }
  };
  node.onpointerup = node.onpointercancel = node.onlostpointercapture = stop;
  node.onkeydown = (e) => {
    if (['Enter', ' '].includes(e.key)) {
      e.preventDefault();
      if (!e.repeat) start();
    }
  };
  node.onkeyup = node.onblur = stop;
}
function loadLesson(index, focus = false) {
  stopHold?.();
  removeKeyboard?.();
  removeKeyboard = null;
  resetDrag();
  selectedBerry = null;
  current = index;
  const lesson = step();
  $('title').textContent = words().title;
  $('instruction').textContent = prompt();
  $('step').textContent = copy().step(index + 1, lessons.length);
  $('count-art').src = picture(lesson.cover);
  objects.replaceChildren();
  $('key-controls').hidden = !lesson.key;
  if (lesson.key) {
    removeKeyboard = keyboardLesson({
      lesson,
      copy: copy(),
      picture,
      field,
      controls: $('key-controls'),
      scene: objects,
      count: () => done[current].size,
      advance: () => record(done[current].size),
    });
  }
  if (lesson.kind === 'berry') {
    const basket = document.createElement('button');
    basket.id = 'basket';
    basket.className = 'basket';
    basket.setAttribute('aria-label', copy().basket);
    basket.innerHTML = `<img alt="" draggable="false" src="${picture('basket')}">`;
    place(basket, basketSpot);
    objects.append(basket);
    basket.onclick = () => {
      if (selectedBerry !== null) finishPiece(selectedBerry);
    };
    updateBasket();
  }
  lesson.pieces?.forEach((_, i) => {
    const node = document.createElement('button');
    node.className = 'piece ' + lesson.kind;
    node.dataset.piece = i;
    node.innerHTML = '<img alt="" draggable="false">';
    if (lesson.kind === 'rain')
      node.insertAdjacentHTML(
        'beforeend',
        '<img class="plant" alt="" draggable="false">',
      );
    node.style.setProperty('--delay', i * -0.87 + 's');
    place(node, lesson.spots[i]);
    decorate(node, i);
    if (lesson.kind === 'berry') attachBerry(node, i);
    else if (lesson.kind === 'rain') attachCloud(node, i);
    else {
      node.onclick = () => {
        if (lesson.kind !== 'match' || matchOrder[done[current].size] === i)
          finishPiece(i);
      };
      if (lesson.kind === 'butterfly')
        node.onpointerenter = (e) => {
          if (e.pointerType !== 'touch') finishPiece(i);
        };
    }
    objects.append(node);
  });
  document.querySelectorAll('.lesson').forEach((node, i) => {
    node.setAttribute('aria-current', String(i === current));
    node.querySelector('.mark').hidden = i !== current;
  });
  updateProgress();
  if (focus) {
    field.focus({ preventScroll: true });
    document.querySelector('.lesson-head').scrollIntoView({ block: 'nearest' });
  }
  speak(prompt());
}
function renderLanguage() {
  const c = copy();
  document.documentElement.lang = language;
  document.title = c.brand + ' · LVTD Games';
  document.querySelector('meta[name="description"]').content = c.description;
  document
    .querySelectorAll('[data-copy]')
    .forEach((node) => (node.textContent = c[node.dataset.copy]));
  $('language').value = language;
  $('language').setAttribute('aria-label', c.language);
  $('sound').setAttribute('aria-label', c.sound);
  $('sound').title = c.sound;
  guide.querySelector('.close').setAttribute('aria-label', c.close);
  field.setAttribute('aria-label', c.playArea);
  $('guide-copy').replaceChildren(
    ...c.help.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    }),
  );
  $('lessons').replaceChildren();
  lessons.forEach((lesson, i) => {
    const { name, action } = c.activities[lesson.kind];
    const node = document.createElement('button');
    node.className = 'lesson';
    node.innerHTML = `<span class="thumb"><img alt="" src="${picture(lesson.cover)}"></span><span><strong>${name}</strong><small>${action}</small></span><span class="mark">${icon('check')}</span>`;
    node.onclick = () => loadLesson(i, true);
    $('lessons').append(node);
  });
}
$('language').onchange = (e) => {
  language = e.target.value;
  try {
    localStorage.setItem(languageKey, language);
  } catch {}
  renderLanguage();
  loadLesson(current, Boolean(step().key));
};
$('again').onclick = () => {
  done[current].clear();
  loadLesson(current, true);
};
$('advance').onclick = () => loadLesson(current + 1, true);
$('parents').onclick = () => {
  resetDrag();
  stopHold?.();
  window.speechSynthesis?.cancel();
  guide.showModal();
};
guide.querySelector('.close').onclick = $('resume').onclick = () =>
  guide.close();
field.oncontextmenu = (e) => e.preventDefault();
field.onpointerdown = (e) => {
  if (e.button !== 0) return;
  const box = field.getBoundingClientRect();
  const ring = document.createElement('span');
  ring.className = 'ripple';
  ring.style.left = e.clientX - box.left + 'px';
  ring.style.top = e.clientY - box.top + 'px';
  field.append(ring);
  setTimeout(() => ring.remove(), 700);
};
window.addEventListener('blur', () => {
  resetDrag();
  stopHold?.();
});
renderLanguage();
loadLesson(0);
