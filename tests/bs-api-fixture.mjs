import { spawn } from 'node:child_process';
// Only the browser-test runner starts this fixture. Never imported by production.
import { gamesServer } from '../services/server.mjs';
import { openStore } from '../services/corporate-bs-api/store.mjs';
import { testDatabase } from './database.mjs';
const database = await testDatabase();
const store = await openStore(database.url);
process.on('SIGTERM', async () => {
  await store.close();
  await database.close();
  process.exit(0);
});
const judge = {
  nameAllowed: async () => true,
  score: async (phrase) => ({
    score: phrase.includes('synergy') ? 92.7 : 12.4,
    valid: !phrase.includes('ignore instructions'),
    publishable: true,
    model: 'browser-test-fixture',
  }),
};
// Run the real native Bend service during browser tests.
const life = spawn(process.execPath, ['services/life-engine/server.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: '4180' },
});
process.on('exit', () => life.kill());
for (let attempt = 0; ; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:4180/health', {
      signal: AbortSignal.timeout(500),
    });
    if (response.ok) break;
  } catch {}
  if (attempt >= 100 || life.exitCode !== null)
    throw new Error('Native Life engine did not become ready');
  await new Promise((resolve) => setTimeout(resolve, 100));
}

gamesServer({
  store,
  judge,
  chooseJess: async (chess) => {
    const moves = chess.moves({ verbose: true });
    const id = (m) => m.from + m.to + (m.promotion || '');
    const move =
      moves.find((m) => m.san.endsWith('#')) ||
      moves.find((m) => m.san === 'e5') ||
      moves.find((m) => m.san === 'e4') ||
      moves[0];
    return {
      move: id(move),
      confidence: 1,
      model: 'browser-test-fixture',
      probabilities: moves
        .map((m) => ({
          id: id(m),
          san: m.san,
          probability: id(m) === id(move) ? 1 : 0,
        }))
        .sort((a, b) => b.probability - a.probability),
    };
  },
  origin: 'http://localhost:4173',
  secure: false,
  trustProxy: true,
  dailyBudget: 1000,
}).listen(4173, '127.0.0.1', () => console.log('Browser-test API ready'));
