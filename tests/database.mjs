import { randomUUID } from 'node:crypto';
import { openPool } from '../services/database/pool.mjs';
export async function testDatabase() {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error(
      'TEST_DATABASE_URL must point to a disposable PostgreSQL test server (CREATEDB required)',
    );
  const admin = openPool(process.env.TEST_DATABASE_URL);
  const name = 'games_test_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = '/' + name;
  return {
    url: url.href,
    async close() {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}
