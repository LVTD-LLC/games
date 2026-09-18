const $ = (id) => document.getElementById(id);
export async function request(path, body, signal) {
  const response = await fetch('/api/jess/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'Could not save. Please retry.');
  return data;
}
export function createRecording({ state, save }) {
  let id = null,
    registered = false,
    legacy = false,
    prompted = false,
    result = null,
    saving = false,
    finishing = null;
  let leaderboardVersion = 0;
  async function leaderboard() {
    const version = ++leaderboardVersion;
    try {
      const response = await fetch('/api/jess/leaderboard');
      if (!response.ok) throw new Error();
      const { entries } = await response.json();
      if (version !== leaderboardVersion) return;
      $('record-challenge').textContent = entries.length
        ? `Jev was beaten in ${entries[0].moves} moves. Can you do it quicker?`
        : 'Be the first to beat Jev and set a record.';
      $('leaderboard-empty').hidden = entries.length > 0;
      $('leaderboard-empty').textContent =
        'No wins recorded yet. Yours could be first.';
      $('leaderboard').replaceChildren(
        ...entries.map((entry, index) => {
          const li = document.createElement('li');
          for (const [className, text] of [
            ['rank', String(index + 1)],
            ['name', entry.name],
            ['moves', `${entry.moves} moves`],
          ]) {
            const span = document.createElement('span');
            span.className = className;
            span.textContent = text;
            li.append(span);
          }
          return li;
        }),
      );
    } catch {
      if (version === leaderboardVersion) {
        $('record-challenge').textContent = 'How quickly can you beat Jev?';
        $('leaderboard-empty').hidden = false;
        $('leaderboard-empty').textContent =
          'Leaderboard is temporarily unavailable.';
      }
    }
  }
  function showDialog() {
    if (!result) return;
    $('result-title').textContent =
      result.winner === 'human' ? 'You beat Jev!' : 'Jev wins.';
    $('result-summary').textContent =
      `Finished in ${result.moves} moves. ${result.winner === 'human' ? 'Your win is recorded.' : 'Your result is saved. Try again to join the ranking.'}`;
    $('result-name').value = result.name === 'Anonymous' ? '' : result.name;
    $('result-email').value = '';
    $('result-subscribe').checked = false;
    $('identity-error').textContent = '';
    $('result-dialog').showModal();
    prompted = true;
    save();
  }
  async function finish() {
    const game = state();
    if (!game.finished) return;
    if (legacy) {
      $('result-save-status').textContent =
        'This older game cannot be ranked. Start a new game to record a result.';
      return;
    }
    if (!id || finishing) return;
    if (result) {
      $('edit-result').hidden = !game.checkmate;
      if (game.checkmate && !prompted) showDialog();
      return;
    }
    const gameId = id;
    finishing = gameId;
    $('retry-save').hidden = true;
    $('result-save-status').textContent = 'Saving result…';
    try {
      const data = await request('finish', {
        gameId,
        player: game.player,
        moves: game.moves,
      });
      if (gameId !== id) return;
      result = data.result;
      save();
      $('result-save-status').textContent =
        `Result saved: ${result.winner === 'human' ? 'you won' : result.winner === 'jev' ? 'Jev won' : 'draw'} in ${result.moves} moves.`;
      $('edit-result').hidden = !game.checkmate;
      void leaderboard();
      if (game.checkmate && !prompted) showDialog();
    } catch (error) {
      if (gameId === id) {
        $('result-save-status').textContent = error.message;
        $('retry-save').hidden = false;
      }
    } finally {
      if (finishing === gameId) finishing = null;
    }
  }
  $('retry-save').addEventListener('click', () => void finish());
  $('edit-result').addEventListener('click', showDialog);
  $('skip-identity').addEventListener('click', () =>
    $('result-dialog').close(),
  );
  $('result-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || !result) return;
    saving = true;
    const gameId = id;
    $('save-identity').disabled = true;
    $('identity-error').textContent = '';
    try {
      const data = await request('identity', {
        gameId,
        name: $('result-name').value,
        email: $('result-email').value,
        subscribe: $('result-subscribe').checked,
      });
      if (gameId !== id) return;
      result = data.result;
      save();
      $('result-dialog').close();
      $('result-email').value = '';
      $('result-subscribe').checked = false;
      void leaderboard();
    } catch (error) {
      if (gameId === id) $('identity-error').textContent = error.message;
    } finally {
      saving = false;
      $('save-identity').disabled = false;
    }
  });
  return {
    leaderboard,
    finish,
    snapshot: () => ({ id, legacy, prompted }),
    restore(data) {
      id =
        typeof data?.id === 'string' && /^[a-f0-9-]{36}$/.test(data.id)
          ? data.id
          : null;
      legacy = !id || data?.legacy === true;
      prompted = data?.prompted === true;
      if (legacy)
        $('result-save-status').textContent =
          'This older saved game is practice-only. Start a new game to enter the leaderboard.';
    },
    reset(active = false) {
      id = active ? crypto.randomUUID() : null;
      registered = false;
      legacy = false;
      prompted = false;
      result = null;
      finishing = null;
      $('result-dialog').close();
      $('result-save-status').textContent = '';
      $('retry-save').hidden = true;
      $('edit-result').hidden = true;
    },
    async start(player, signal) {
      if (legacy) return {};
      if (!id) throw new Error('Start a new game to record a result.');
      const current = id;
      if (!registered) {
        await request('start', { id: current, player }, signal);
        if (id !== current)
          throw new DOMException('Game changed', 'AbortError');
        registered = true;
        save();
      }
      return { gameId: current };
    },
  };
}
