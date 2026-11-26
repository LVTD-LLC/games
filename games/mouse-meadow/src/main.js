import './style.css';

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

const lessons = [
  {
    title: 'В гости к бабочкам',
    action: 'Двигаем мышкой',
    name: 'Бабочки',
    prompt: 'Подведи стрелку к каждой бабочке, чтобы поздороваться.',
    touch: 'Коснись каждой бабочки, чтобы поздороваться.',
    cover: 'coral',
    kind: 'butterfly',
    label: 'Бабочка',
    pieces: ['coral', 'blue', 'gold'],
    spots: [
      [32, 48],
      [55, 29],
      [76, 58],
    ],
  },
  {
    title: 'Разбуди цветочки',
    action: 'Учимся щёлкать',
    name: 'Цветочки',
    prompt: 'Нажми на каждый бутон, и цветочек раскроется.',
    cover: 'flower',
    kind: 'bud',
    label: 'Бутон',
    pieces: ['bud', 'bud', 'bud'],
    spots: [
      [30, 70],
      [51, 59],
      [76, 71],
    ],
  },
  {
    title: 'Собери ягодки',
    action: 'Перетаскиваем',
    name: 'Ягодки',
    prompt: 'Зажми ягодку, перенеси в корзинку и отпусти.',
    cover: 'berry',
    kind: 'berry',
    label: 'Ягодка',
    pieces: ['berry', 'berry', 'berry'],
    spots: [
      [24, 66],
      [45, 48],
      [51, 76],
    ],
  },
];
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
const prompt = () => (touch.matches && step().touch) || step().prompt;

function speak(message) {
  if (!sound || !window.speechSynthesis || !window.SpeechSynthesisUtterance)
    return;
  const voice = speechSynthesis
    .getVoices()
    .find((voice) => /^ru(-|_|$)/i.test(voice.lang));
  if (!voice) return;
  const phrase = new SpeechSynthesisUtterance(message);
  Object.assign(phrase, { lang: 'ru-RU', voice, rate: 0.9 });
  speechSynthesis.cancel();
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
  $('advance').textContent = 'Следующий урок →';
  refreshHint();
}
function decorate(node, i) {
  const finished = done[current].has(i);
  node.classList.toggle('done', finished);
  node.hidden = step().kind === 'berry' && finished;
  node.querySelector('img').src = picture(
    step().kind === 'bud' && finished ? 'flower' : step().pieces[i],
  );
  node.setAttribute(
    'aria-label',
    `${step().label} ${i + 1}${finished ? ' — готово' : ''}`,
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
function finishPiece(i) {
  if (done[current].has(i)) return;
  done[current].add(i);
  decorate(objects.querySelector(`[data-piece="${i}"]`), i);
  selectedBerry = null;
  updateBasket();
  updateProgress();
  chime(done[current].size);
  if (done[current].size === 3) speak('Получилось!');
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
function loadLesson(index) {
  resetDrag();
  selectedBerry = null;
  current = index;
  const lesson = step();
  $('title').textContent = lesson.title;
  $('instruction').textContent = prompt();
  $('step').textContent = `Урок ${index + 1} из 3`;
  $('count-art').src = picture(lesson.cover);
  objects.replaceChildren();
  if (lesson.kind === 'berry') {
    const basket = document.createElement('button');
    basket.id = 'basket';
    basket.className = 'basket';
    basket.setAttribute('aria-label', 'Корзинка');
    basket.innerHTML = `<img alt="" draggable="false" src="${picture('basket')}">`;
    place(basket, basketSpot);
    objects.append(basket);
    basket.onclick = () => {
      if (selectedBerry !== null) finishPiece(selectedBerry);
    };
    updateBasket();
  }
  lesson.pieces.forEach((_, i) => {
    const node = document.createElement('button');
    node.className = 'piece ' + lesson.kind;
    node.dataset.piece = i;
    node.innerHTML = '<img alt="" draggable="false">';
    node.style.setProperty('--delay', i * -0.87 + 's');
    place(node, lesson.spots[i]);
    decorate(node, i);
    if (lesson.kind === 'berry') attachBerry(node, i);
    else {
      node.onclick = () => finishPiece(i);
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
  speak(prompt());
}
lessons.forEach((lesson, i) => {
  const node = document.createElement('button');
  node.className = 'lesson';
  node.innerHTML = `<span class="thumb"><img alt="" src="${picture(lesson.cover)}"></span><span><strong>${lesson.name}</strong><small>${lesson.action}</small></span><span class="mark">${icon('check')}</span>`;
  node.onclick = () => loadLesson(i);
  $('lessons').append(node);
});
$('again').onclick = () => {
  done[current].clear();
  loadLesson(current);
};
$('advance').onclick = () => loadLesson(current + 1);
$('parents').onclick = () => {
  resetDrag();
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
window.addEventListener('blur', resetDrag);
loadLesson(0);
