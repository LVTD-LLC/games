import './style.css';
import buzzer from './buzzer.webp';
import { copy } from './words.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const inviteCode =
  new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
const key = 'lvtd-quiz-club-v1';
function read() {
  try {
    return JSON.parse(sessionStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function save() {
  try {
    sessionStorage.setItem(key, JSON.stringify({ lang, code, token }));
  } catch {}
}
const stored = read();
let lang =
  stored.lang === 'ru' || (!stored.lang && navigator.language.startsWith('ru'))
    ? 'ru'
    : 'en';
let code = stored.code || '',
  token = stored.token || newToken(),
  info = null,
  name = '',
  draftCode = inviteCode,
  dialogType = '',
  busy = false,
  revision = 0;
if (inviteCode && inviteCode !== code) {
  code = '';
  token = newToken();
}
let skew = 0,
  viewKey = '',
  roomsKey = '';
function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
const t = (k) => copy[lang][k] || copy[lang].server;
function notice(s = '') {
  $('notice').textContent = s;
}
async function api(route, body) {
  const r = await fetch('/quiz-club/api/' + route, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(8500),
    headers: {
      'X-Quiz-Seat': token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error('server');
  }
  if (!r.ok) throw Error(data.error || 'server');
  return data;
}
function button(action, label, css = '') {
  return `<button type="button" data-action="${action}" class="${css}">${label}</button>`;
}
function header() {
  $('rules').textContent = t('rules');
  $('rules').setAttribute('aria-label', t('rules'));
  $('locale').value = lang;
  $('locale').disabled = !!code;
  document.documentElement.lang = lang;
}
function home() {
  header();
  viewKey = '';
  roomsKey = '';
  $('main').innerHTML =
    `<section class="poster"><div class="poster-art"><img src="${buzzer}" alt=""></div><div class="poster-copy"><p>${t('description')}</p><h1 lang="en">QUIZ CLUB<span>.</span></h1><div class="stats"><span><b>2–10</b> ${t('players')}</span><span><b>10</b> ${t('questions')}</span><span><b>30</b> ${t('seconds')}</span></div></div></section>
  <div class="panels"><section class="panel start"><h2>${t('setup')}</h2><label for="name">${t('name')} <small>· ${t('optional')}</small></label><input id="name" maxlength="24" autocomplete="nickname" placeholder="${t('anon')}" value="${esc(name)}"><div class="actions">${button('create', t('create') + ' <span>＋</span>', 'primary')}${button('match', t('match') + ' <span>↗</span>', 'light')}</div></section>
  <section class="panel join"><h2>${t('joinTitle')}</h2><form id="join-form"><label for="code">${t('code')}</label><input id="code" aria-label="${t('numberLabel')}" placeholder="ABC123" maxlength="6" required pattern="[a-zA-Z2-9]{6}" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(draftCode)}"><button class="outline">${t('join')} <span>→</span></button></form></section></div>
  <section class="public"><h2>${t('rooms')}</h2><div id="rooms"></div></section>`;
  refreshRooms();
}
function openDialog(type) {
  dialogType = type;
  const d = $('dialog');
  let html = '';
  if (type === 'create')
    html = `<h2 id="dialog-heading">${t('create')}</h2><label for="room-language">${t('language')}</label><select id="room-language"><option value="en">English</option><option value="ru">Русский</option></select><label for="topic">${t('topic')}</label><select id="topic">${['mixed', 'art', 'geography', 'numbers'].map((v) => `<option value="${v}">${t(v)}</option>`).join('')}</select><label for="visibility">${t('visibility')}</label><select id="visibility"><option value="private">${t('private')}</option><option value="public">${t('public')}</option></select><div class="actions"><button class="primary">${t('create')}</button>${button('dismiss', t('cancel'), 'light')}</div>`;
  else if (type === 'rules')
    html = `<h2 id="dialog-heading">${t('rules')}</h2><p>${t('ruleText')}</p>${button('dismiss', t('close'), 'primary')}`;
  else if (type === 'link')
    html = `<h2 id="dialog-heading">${t('copyManual')}</h2><input id="copy-link" readonly value="${esc(inviteLink())}">${button('dismiss', t('close'), 'light')}`;
  else
    html = `<h2 id="dialog-heading">${t('confirmLeave')}</h2><p>${t('leaveText')}</p><div class="actions"><button class="primary">${t('leave')}</button>${button('dismiss', t('stay'), 'light')}</div>`;
  $('dialog-form').innerHTML = html;
  if (type === 'create') $('room-language').value = lang;
  d.showModal();
  if (type === 'link') $('copy-link').select();
}
const inviteLink = () => location.origin + '/quiz-club/?room=' + code;
function apply(data) {
  info = data;
  code = data.code;
  lang = data.lang;
  save();
  header();
  skew = data.now - Date.now();
  const { now, ...visible } = data;
  const next = JSON.stringify(visible);
  if (next !== viewKey) {
    const focus = document.activeElement?.dataset?.action;
    renderRoom();
    viewKey = next;
    if (focus)
      document
        .querySelector(
          `#main [data-action="${CSS.escape(focus)}"]:not(:disabled)`,
        )
        ?.focus({ preventScroll: true });
  }
  clock();
}
function clock() {
  const el = $('timer');
  if (el && info?.until)
    el.textContent =
      Math.max(0, Math.ceil((info.until - Date.now() - skew) / 1000)) +
      (lang === 'ru' ? ' с' : ' s');
}
function roster(r) {
  const ranked = !['lobby', 'preparing'].includes(r.phase),
    people = r.standings
      ? r.standings.map((p) => ({
          ...p,
          ready: r.players.find((a) => a.id === p.id)?.ready,
        }))
      : [...r.players];
  if (ranked) people.sort((a, b) => b.score - a.score);
  return `<section class="panel roster"><h2>${ranked ? t('score') : t('people')} <small>${people.length}/10</small></h2><ol>${people
    .map((p) => {
      const status =
        r.phase === 'reveal'
          ? p.answer === null
            ? t('absent')
            : r.question.options[p.answer]
          : r.phase === 'lobby' || r.phase === 'results'
            ? p.ready === undefined
              ? t('left')
              : p.ready
                ? t('readyTag')
                : t('waitingTag')
            : p.answered
              ? '✓'
              : '';
      return `<li><div><strong>${esc(p.name)}</strong> ${p.id === r.me ? `<small>(${t('you')})</small>` : ''}<div class="player-status">${esc(status)}</div></div>${ranked ? `<b>${p.score} ${t('points')}</b>` : ''}</li>`;
    })
    .join('')}</ol></section>`;
}
function renderRoom() {
  const r = info,
    me = r.players.find((p) => p.id === r.me);
  let inner = '';
  if (r.phase === 'lobby')
    inner = `<h1>${t('lobby')}</h1><p>${t('code')}</p><strong class="big-code">${code}</strong>${button('copy', t('invite'), 'outline')}<p>${r.players.length < 2 ? t('min') : t('mark')}</p>${readyButton(me, t('ready'))}`;
  if (r.phase === 'preparing')
    inner = `<h1>${t('preparing')}</h1><p>${t('preparingText')}</p>`;
  if (['question', 'reveal'].includes(r.phase)) {
    const reveal = r.phase === 'reveal',
      q = r.question;
    inner = `<div class="round-bar"><span>${t('question')} ${r.index + 1}/10 · ${t(q.topic)}</span><b>${reveal ? t(r.index === 9 ? 'resultsIn' : 'next') : t('time')} <span id="timer"></span></b></div><progress value="${r.index + 1}" max="10"></progress><h1 class="prompt">${esc(q.prompt)}</h1><div class="options">${q.options.map((s, i) => `<button type="button" data-action="answer-${i}" class="${reveal && q.correct === i ? 'correct ' : ''}${me.answer === i ? 'selected' : ''}" ${reveal || me.answered ? 'disabled' : ''}><i>${'ABCD'[i]}</i><span>${esc(s)}${reveal && q.correct === i ? ' ✓' : ''}</span></button>`).join('')}</div><p class="feedback">${reveal ? t('correct') + ' · ' + esc(q.options[q.correct]) : (me.answered ? t('locked') + ' · ' : '') + r.players.filter((p) => p.answered).length + '/' + r.players.length + ' ' + t('answered')}</p>`;
  }
  if (r.phase === 'results') {
    const max = Math.max(...r.standings.map((p) => p.score)),
      winners = r.standings.filter((p) => p.score === max);
    inner = `<p class="topic">${t('results')}</p><h1>${winners.length === 1 ? esc(winners[0].name) + ' ' + t('wins') : t('tie')}</h1><p>${winners.length > 1 ? winners.map((p) => esc(p.name)).join(', ') + ' · ' : ''}${max} / 10</p><p>${t('rematch')}</p>${readyButton(me, t('again'))}`;
  }
  $('main').innerHTML =
    `<div class="game-head"><strong lang="en">QUIZ CLUB<span>.</span></strong>${button('leave', t('leave'), 'quiet')}</div><div class="room-meta"><b>${t('code')} · ${code}</b><span>${t(r.topic)} · ${r.lang === 'ru' ? 'Русский' : 'English'} · ${t(r.public ? 'public' : 'private')}</span></div><div class="table"><section class="panel stage" aria-live="off">${inner}</section>${roster(r)}</div>`;
}
function readyButton(p, label) {
  return `<button data-action="ready" class="primary" ${p.ready ? 'disabled' : ''}>${p.ready ? '✓ ' + t('readyTag') : label}</button>`;
}
function clearRoom() {
  code = '';
  info = null;
  token = newToken();
  draftCode = '';
  save();
  history.replaceState(null, '', location.pathname);
  home();
}
async function run(action, body = {}) {
  if (busy) return;
  busy = true;
  revision++;
  notice();
  const entering = ['create', 'join', 'match'].includes(action);
  try {
    save();
    const r = await api(
      entering ? action : `rooms/${code}/${action}`,
      entering ? { lang, name, ...body } : body,
    );
    if (action === 'leave') clearRoom();
    else {
      apply(r);
      if (entering)
        history.replaceState(null, '', location.pathname + '?room=' + code);
    }
    if ($('dialog').open) $('dialog').close();
  } catch (e) {
    if (!entering && ['expired', 'missing'].includes(e.message)) {
      clearRoom();
      if ($('dialog').open) $('dialog').close();
    }
    notice(t(e.message));
    if ($('dialog').open) {
      let p = $('dialog-error');
      if (!p) {
        p = document.createElement('p');
        p.id = 'dialog-error';
        p.setAttribute('role', 'alert');
        $('dialog-form').append(p);
      }
      p.textContent = t(e.message);
    }
  } finally {
    busy = false;
    revision++;
  }
}
async function refreshRooms() {
  if (code) return;
  const epoch = revision,
    local = lang;
  try {
    const rooms = await api('rooms?lang=' + lang);
    if (epoch !== revision || local !== lang || !$('rooms')) return;
    const snapshot = JSON.stringify(rooms);
    if (snapshot === roomsKey) return;
    roomsKey = snapshot;
    $('rooms').innerHTML = rooms.length
      ? rooms
          .map(
            (r) =>
              `<button class="room-row" data-action="join-${esc(r.code)}"><b>${esc(r.code)}</b> ${t(r.topic)} <span>${r.count}/10 →</span></button>`,
          )
          .join('')
      : `<p>${t('empty')}</p>`;
  } catch {
    if ($('rooms')) {
      $('rooms').textContent = t('server');
      roomsKey = '';
    }
  }
}
async function poll() {
  if (!code || busy) return;
  const epoch = revision;
  try {
    const r = await api('rooms/' + code);
    if (epoch !== revision) return;
    apply(r);
    if ($('notice').textContent === t('reconnecting')) notice();
  } catch (e) {
    if (epoch !== revision) return;
    if (['missing', 'expired'].includes(e.message)) {
      clearRoom();
      notice(t(e.message));
    } else notice(t('reconnecting'));
  }
}
document.addEventListener('input', (e) => {
  if (e.target.id === 'name') name = e.target.value;
  if (e.target.id === 'code') draftCode = e.target.value.toUpperCase();
});
$('locale').onchange = (e) => {
  lang = e.target.value;
  save();
  home();
  notice();
};
$('rules').onclick = () => openDialog('rules');
document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'join-form') run('join', { code: draftCode.trim() });
  else if (e.target.id === 'dialog-form' && dialogType === 'create')
    run('create', {
      lang: $('room-language').value,
      topic: $('topic').value,
      public: $('visibility').value === 'public',
    });
  else if (e.target.id === 'dialog-form' && dialogType === 'leave')
    run('leave');
});
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-action]')?.dataset.action;
  if (!a) return;
  if (a === 'dismiss') $('dialog').close();
  else if (a === 'create' || a === 'leave') openDialog(a);
  else if (a === 'ready' || a === 'match') run(a);
  else if (a.startsWith('answer-'))
    run('answer', {
      round: info.round,
      index: info.index,
      answer: Number(a.slice(7)),
    });
  else if (a.startsWith('join-')) run('join', { code: a.slice(5) });
  else if (a === 'copy') {
    try {
      await navigator.clipboard.writeText(inviteLink());
      notice(t('copied'));
    } catch {
      openDialog('link');
    }
  }
});
header();
if (code) {
  $('main').textContent = t('reconnecting');
} else home();
async function tick() {
  await poll();
  setTimeout(tick, 800);
}
tick();
setInterval(clock, 220);
setInterval(refreshRooms, 5500);
