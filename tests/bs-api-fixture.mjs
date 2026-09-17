// Only the browser-test runner starts this fixture. Never imported by production.
import { createApp } from '../services/corporate-bs-api/server.mjs';
import { openStore } from '../services/corporate-bs-api/store.mjs';
const store = openStore(':memory:');
const judge = {
  nameAllowed: async () => true,
  score: async (phrase) => ({
    score: phrase.includes('synergy') ? 92.7 : 12.4,
    valid: !phrase.includes('ignore instructions'),
    publishable: true,
    model: 'browser-test-fixture',
  }),
};
createApp({
  store,
  judge,
  origin: 'http://localhost:4173',
  secure: false,
  dailyBudget: 1000,
}).listen(4174, '127.0.0.1', () => console.log('Browser-test API ready'));
