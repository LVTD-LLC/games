import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { testDatabase } from '../../tests/database.mjs';
import { openStore } from '../corporate-bs-api/store.mjs';
import { createJess } from './server.mjs';
import { createRecords, verifiedPosition } from './records.mjs';
const lines = {
  win: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'],
  loss: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
};
async function setup(t, line = lines.win) {
  const database = await testDatabase();
  const store = await openStore(database.url);
  let calls = 0;
  const server = createServer(
    createJess({
      store,
      origin: 'https://games.example',
      secure: false,
      nameAllowed: async (name) => name !== 'blocked',
      choose: async (chess) => {
        calls++;
        return { move: line[chess.history().length] };
      },
    }),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await store.close();
    await database.close();
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  let cookie = '';
  async function post(path, data, override = {}) {
    const response = await fetch(url + '/api/jess/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://games.example',
        Cookie: cookie,
        ...override,
      },
      body: JSON.stringify(data),
    });
    if (response.headers.has('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  }
  async function start(player = 'w') {
    const id = randomUUID();
    assert.equal((await post('start', { id, player })).status, 200);
    return id;
  }
  async function play(id, player = 'w') {
    let moves = [];
    for (let index = 0; index < line.length; index++) {
      const human = (index % 2 === 0) === (player === 'w');
      if (human) moves.push(line[index]);
      else {
        const response = await post('move', { gameId: id, player, moves });
        assert.equal(response.status, 200, await response.clone().text());
        const body = await response.json();
        moves.push(body.move);
      }
    }
    const finished = await post('finish', { gameId: id, player, moves });
    assert.equal(finished.status, 200, await finished.clone().text());
    return { moves, result: (await finished.json()).result };
  }
  return { store, url, post, start, play, calls: () => calls };
}
test('real game boundary records verified human win once, permits Anonymous, keeps consent private and survives reopen', async (t) => {
  const f = await setup(t);
  const id = await f.start();
  assert.equal(
    (await f.post('finish', { gameId: id, player: 'w', moves: lines.win }))
      .status,
    400,
  ); // invented Jev history
  const { moves, result } = await f.play(id);
  assert.equal(result.winner, 'human');
  assert.equal(result.moves, 4);
  assert.equal(result.name, 'Anonymous');
  assert.deepEqual(
    (await (await f.post('finish', { gameId: id, player: 'w', moves })).json())
      .result,
    result,
  );
  assert.equal(
    (
      await f.store.db.query(
        'SELECT * FROM jess.games WHERE winner IS NOT NULL',
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await f.post('identity', {
        gameId: id,
        name: 'Rasul',
        email: 'person@example.com',
        subscribe: false,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.post('identity', {
        gameId: id,
        name: 'blocked',
        email: '',
        subscribe: false,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.post('identity', {
        gameId: id,
        name: 'Rasul',
        email: 'person@example.com',
        subscribe: true,
      })
    ).status,
    200,
  );
  const publicData = await (
    await fetch(f.url + '/api/jess/leaderboard')
  ).json();
  assert.equal(publicData.entries[0].name, 'Rasul');
  assert.doesNotMatch(
    JSON.stringify(publicData),
    /email|owner|person@|unsubscribe/,
  );
  const subscriber = (await f.store.db.query('SELECT * FROM jess.subscribers'))
    .rows[0];
  assert.equal(subscriber.consent_version, 'games-updates-v1');
  const unsub = f.url + '/api/jess/unsubscribe/' + subscriber.unsubscribe_token;
  assert.equal(
    (await fetch(unsub, { headers: { 'Sec-Fetch-Site': 'cross-site' } }))
      .status,
    200,
  );
  assert.equal(
    (await f.store.db.query('SELECT * FROM jess.subscribers')).rowCount,
    1,
  );
  assert.equal(
    (
      await fetch(unsub, {
        method: 'POST',
        headers: { Origin: 'https://games.example' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.store.db.query('SELECT * FROM jess.subscribers')).rowCount,
    0,
  );
  const second = await openStore(f.store.db.options.connectionString);
  try {
    assert.equal((await createRecords(second.db).leaderboard())[0].moves, 4);
  } finally {
    await second.close();
  }
});
test('Jev checkmate is automatically recorded, never ranked, and another browser cannot change identity', async (t) => {
  const f = await setup(t, lines.loss);
  const id = await f.start();
  await f.play(id);
  const game = (
    await f.store.db.query(
      'SELECT winner,move_count FROM jess.games WHERE id=$1',
      [id],
    )
  ).rows[0];
  assert.deepEqual(game, { winner: 'jev', move_count: 2 });
  assert.deepEqual(
    (await (await fetch(f.url + '/api/jess/leaderboard')).json()).entries,
    [],
  );
  assert.equal(
    (
      await f.post(
        'identity',
        { gameId: id, name: 'Intruder', email: '', subscribe: false },
        { Cookie: '' },
      )
    ).status,
    403,
  );
});
test('Black wins count chess moves correctly and lost AI replies replay without another paid call', async (t) => {
  const f = await setup(t, lines.loss);
  const id = await f.start('b');
  const opening = await f.post('move', { gameId: id, player: 'b', moves: [] });
  assert.equal(opening.status, 200);
  const again = await f.post('move', { gameId: id, player: 'b', moves: [] });
  assert.equal(again.status, 200);
  assert.equal(f.calls(), 1);
  const { result } = await f.play(id, 'b');
  assert.equal(result.winner, 'human');
  assert.equal(result.moves, 2);
});
test('top ten ranks completed wins by fewest moves with deterministic ties; loss/draw excluded', async (t) => {
  const f = await setup(t);
  const records = createRecords(f.store.db);
  for (let i = 0; i < 13; i++)
    await f.store.db.query(
      "INSERT INTO jess.games(id,owner,side,created_at,winner,move_count,finished_at,name) VALUES ($1,'fixture','w',1,'human',$2,$3,$4)",
      [randomUUID(), 14 - i, 100 + i, i === 12 ? '' : 'Player ' + i],
    );
  for (const winner of ['jev', 'draw'])
    await f.store.db.query(
      "INSERT INTO jess.games(id,owner,side,created_at,winner,move_count,finished_at) VALUES ($1,'fixture','w',1,$2,1,1)",
      [randomUUID(), winner],
    );
  await f.store.db.query(
    "INSERT INTO jess.games(id,owner,side,created_at,winner,move_count,finished_at,name) VALUES ('00000000-0000-4000-8000-000000000001','fixture','w',1,'human',2,111,'Earlier finisher')",
  );
  const entries = await records.leaderboard();
  assert.equal(entries.length, 10);
  assert.deepEqual(
    entries.map((e) => e.moves),
    [2, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.equal(entries[0].name, 'Earlier finisher');
  assert.equal(entries[1].name, 'Anonymous');
});
test('verified prefixes allow takebacks but never fabricated opponent turns', () => {
  const game = { side: 'w', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] };
  assert.doesNotThrow(() =>
    verifiedPosition(game, ['e2e4', 'e7e5', 'f1c4'], 'w'),
  );
  assert.throws(() => verifiedPosition(game, ['e2e4', 'a7a6', 'd1h5'], 'w'));
  assert.throws(() =>
    verifiedPosition(game, ['e2e4', 'e7e5', 'f1c4', 'a7a6'], 'w'),
  );
  assert.throws(() => verifiedPosition(game, game.moves, 'b'));
});
test('draws are recorded with move count but excluded from fastest wins', async (t) => {
  const line = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
  const f = await setup(t, line);
  const id = await f.start();
  const { result } = await f.play(id);
  assert.equal(result.winner, 'draw');
  assert.equal(result.moves, 4);
  assert.deepEqual(
    (await (await fetch(f.url + '/api/jess/leaderboard')).json()).entries,
    [],
  );
});
