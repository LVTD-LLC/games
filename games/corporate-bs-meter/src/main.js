import './style.css';
const $ = (id) => document.getElementById(id);
const API = '/api/corporate-bs';
const storageKey = 'lvtd-corporate-bs-v1:welcomed';
let player = { name: '' },
  current = null,
  busy = false;
let ready;
const examples = [
  'Let’s operationalize our north-star alignment to unlock a more synergistic tomorrow.',
  'We need to socialize the pre-alignment roadmap before we can align on the alignment.',
  'Our strategic priority is to prioritize the strategy behind our priorities.',
];
let exampleIndex = 0;
async function api(path, body) {
  const response = await fetch(API + path, {
    credentials: 'same-origin',
    signal: AbortSignal.timeout(18000),
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json().catch(() => ({
    error: 'The judge is out of office. Please try again shortly.',
  }));
  if (!response.ok)
    throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function showError(id, error) {
  $(id).textContent = error.message || 'Connection lost. Please try again.';
  $(id).hidden = false;
}
function rememberWelcome() {
  try {
    localStorage.setItem(storageKey, '1');
  } catch {}
}
function wasWelcomed() {
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}
function profileUI() {
  $('profile-button').textContent = player.name || 'Your name ↗';
  $('join-button').textContent = player.name
    ? 'Edit leaderboard name ↗'
    : 'Join the leaderboard ↗';
}
function openProfile() {
  $('player-name').value = player.name;
  $('player-email').value = '';
  $('updates').checked = false;
  $('profile-error').hidden = true;
  $('welcome').showModal();
}
function closeWelcome() {
  rememberWelcome();
  $('welcome').close();
  $('phrase').focus();
}
$('close-welcome').addEventListener('click', closeWelcome);
$('skip-welcome').addEventListener('click', closeWelcome);
$('welcome').addEventListener('cancel', (event) => {
  event.preventDefault();
  closeWelcome();
});
$('welcome').addEventListener('click', (event) => {
  if (event.target === $('welcome')) {
    const r = $('welcome').getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeWelcome();
  }
});
$('profile-button').addEventListener('click', openProfile);
$('join-button').addEventListener('click', openProfile);
$('profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('profile-error').hidden = true;
  const name = $('player-name').value.trim(),
    email = $('player-email').value.trim(),
    updates = $('updates').checked;
  if (email && !updates) {
    showError(
      'profile-error',
      new Error('Choose game updates to save your email, or leave it blank.'),
    );
    return;
  }
  $('profile-submit').disabled = true;
  try {
    await ensureSession();
    if (name || email || player.name)
      player = await api('/profile', { name, email, updates });
    profileUI();
    closeWelcome();
    await loadLeaderboard();
    // A result's public attribution may change when the player updates their name.
    if (current) {
      const fresh = await api(`/results/${current.id}`);
      current = {
        ...current,
        ...fresh,
        ranked: Boolean(player.name),
        rank: null,
      };
      renderResult(current);
    }
  } catch (error) {
    showError('profile-error', error);
  } finally {
    $('profile-submit').disabled = false;
  }
});
$('privacy-button').addEventListener('click', () => $('privacy').showModal());
for (const id of ['close-privacy', 'privacy-done'])
  $(id).addEventListener('click', () => $('privacy').close());
function updateCount() {
  $('count').textContent = `${$('phrase').value.length} / 280`;
}
$('phrase').addEventListener('input', updateCount);
$('example').addEventListener('click', () => {
  $('phrase').value = examples[exampleIndex++ % examples.length];
  updateCount();
  $('phrase').focus();
});
for (let i = 0; i <= 20; i++) {
  const angle = Math.PI + (i * Math.PI) / 20;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  const inner = i % 5 === 0 ? 152 : 158;
  for (const [key, value] of Object.entries({
    x1: 220 + Math.cos(angle) * inner,
    y1: 220 + Math.sin(angle) * inner,
    x2: 220 + Math.cos(angle) * 165,
    y2: 220 + Math.sin(angle) * 165,
    class: 'tick',
  }))
    line.setAttribute(key, value);
  $('ticks').append(line);
}
function renderLeaderboard(entries) {
  const list = $('rankings');
  list.replaceChildren();
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent =
      'No directors yet. The corner office is yours for the taking.';
    list.append(li);
    return;
  }
  for (const entry of entries) {
    const li = document.createElement('li'),
      line = document.createElement('div');
    line.className = 'ranking-line';
    for (const [className, text] of [
      ['position', String(entry.rank).padStart(2, '0')],
      ['player-name', entry.name],
      ['player-score', entry.score.toFixed(1)],
    ]) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      line.append(span);
    }
    const phrase = document.createElement('a');
    phrase.className = 'ranking-phrase';
    phrase.href = `/corporate-bs-meter/result/${entry.id}/`;
    phrase.textContent = `“${entry.phrase}”`;
    li.append(line, phrase);
    list.append(li);
  }
}
async function loadLeaderboard() {
  try {
    const data = await api('/leaderboard');
    renderLeaderboard(data.entries);
    $('refresh-leaderboard').hidden = true;
  } catch {
    $('rankings').replaceChildren();
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent =
      'The board is temporarily unavailable. You can still try a phrase.';
    $('rankings').append(li);
    $('refresh-leaderboard').hidden = false;
  }
}
$('refresh-leaderboard').addEventListener('click', loadLeaderboard);
function resultUrl(result) {
  return `${location.origin}/corporate-bs-meter/result/${result.id}/`;
}
function shareText(result) {
  return `I scored ${result.score.toFixed(1)}/100 on the Corporate BS Meter. ${result.title}.\n\n“${result.phrase}”\n\nCan you out-BS me? ${resultUrl(result)}`;
}
function renderResult(result) {
  $('score').textContent = result.score.toFixed(1);
  $('verdict').textContent = result.title;
  $('verdict-line').textContent = result.line;
  $('needle').style.transform = `rotate(${result.score * 1.8}deg)`;
  document.querySelector('.range').style.strokeDashoffset =
    565.5 * (1 - result.score / 100);
  $('result-summary').textContent =
    `${result.score.toFixed(1)}/100 · ${result.title}`;
  $('result-phrase').textContent = `“${result.phrase}”`;
  $('rank-message').textContent = result.ranked
    ? result.rank
      ? `Your best is #${result.rank.rank} globally · ${result.rank.score.toFixed(1)}/100. Only your best phrase takes a seat.`
      : 'Your best phrase is entered in the global leaderboard.'
    : 'Playing anonymously. Add a name above to enter your best phrase in the leaderboard—no email needed.';
  const text = shareText(result),
    url = resultUrl(result);
  // Keep the X intent below its standard length, accounting for the shortened URL.
  const shortPhrase =
    result.phrase.length > 115
      ? result.phrase.slice(0, 112) + '…'
      : result.phrase;
  const x = `${result.score.toFixed(1)}/100 on the Corporate BS Meter. ${result.title}.\n“${shortPhrase}”\nCan you out-BS me?`;
  $('share-x').href =
    `https://twitter.com/intent/tweet?${new URLSearchParams({ text: x, url })}`;
  $('share-threads').href =
    `https://www.threads.com/intent/post?${new URLSearchParams({ text })}`;
  $('share-whatsapp').href =
    `https://api.whatsapp.com/send?${new URLSearchParams({ text })}`;
  $('share-copy').value = text;
  $('share-copy').hidden = true;
  $('share-status').textContent = '';
  $('native-share').hidden = !navigator.share;
  $('result').hidden = false;
}
$('phrase-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  $('judge-button').disabled = true;
  $('game-error').hidden = true;
  $('meter-card').classList.add('judging');
  const original = $('judge-button').innerHTML;
  $('judge-button').textContent = 'Consulting the board…';
  try {
    await ensureSession();
    const data = await api('/score', { phrase: $('phrase').value });
    current = data;
    renderResult(data);
    renderLeaderboard(data.entries);
    $('result').scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'nearest',
    });
  } catch (error) {
    showError('game-error', error);
  } finally {
    busy = false;
    $('judge-button').disabled = false;
    $('judge-button').innerHTML = original;
    $('meter-card').classList.remove('judging');
  }
});
async function copyResult() {
  try {
    await navigator.clipboard.writeText(shareText(current));
    return true;
  } catch {
    $('share-copy').hidden = false;
    $('share-copy').focus();
    $('share-copy').select();
    return false;
  }
}
$('copy-result').addEventListener('click', async () => {
  if (!current) return;
  $('share-status').textContent = (await copyResult())
    ? 'Result and challenge link copied.'
    : 'Select and copy the message below.';
});
$('share-linkedin').addEventListener('click', async () => {
  if (!current) return;
  // LinkedIn supports a shared URL, not prefilled post text. Open synchronously, copy separately.
  window.open(
    `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url: resultUrl(current) })}`,
    '_blank',
    'noopener,noreferrer',
  );
  $('share-status').textContent = (await copyResult())
    ? 'Post text copied. Paste it into your LinkedIn post.'
    : 'LinkedIn opened. Copy the message below into your post.';
});
$('native-share').addEventListener('click', async () => {
  if (!current) return;
  try {
    await navigator.share({
      title: 'Corporate BS Meter',
      text: `${current.score.toFixed(1)}/100. ${current.title}. “${current.phrase}” Can you out-BS me?`,
      url: resultUrl(current),
    });
  } catch (error) {
    if (error.name !== 'AbortError')
      $('share-status').textContent =
        'Use one of the share buttons or copy your result.';
  }
});
$('try-again').addEventListener('click', () => {
  $('phrase').focus();
  $('phrase').select();
  $('phrase').scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
    block: 'center',
  });
});
function ensureSession() {
  if (!ready)
    ready = api('/session')
      .then((data) => {
        player = data;
        profileUI();
      })
      .catch((error) => {
        ready = null;
        throw error;
      });
  return ready;
}
ensureSession().catch((error) => showError('game-error', error));
loadLeaderboard();
if (!wasWelcomed()) openProfile();
const challenge = new URLSearchParams(location.search).get('challenge');
if (challenge && /^[a-f0-9-]{36}$/.test(challenge))
  api(`/results/${challenge}`)
    .then((result) => {
      const p = document.createElement('p');
      p.className = 'challenge';
      p.textContent = `Score to beat: ${result.score.toFixed(1)} by ${result.name}. Your move.`;
      document.querySelector('.intro').append(p);
    })
    .catch(() => {});
