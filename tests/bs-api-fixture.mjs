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
gamesServer({
  store,
  judge,
  origin: 'http://localhost:4173',
  secure: false,
  dailyBudget: 1000,
}).listen(4173, '127.0.0.1', () => console.log('Browser-test API ready'));
