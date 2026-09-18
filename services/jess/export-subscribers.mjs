// Operator-only export. Contains private email addresses; never publish or commit its output.
import { openPool } from '../database/pool.mjs';
const db = openPool();
const origin = process.env.PUBLIC_ORIGIN || 'https://games.lvtd.dev';
const csv = (value) => '"' + String(value).replaceAll('"', '""') + '"';
try {
  console.log('email,consent_at,consent_version,unsubscribe_url');
  for (const s of (
    await db.query('SELECT * FROM jess.subscribers ORDER BY consent_at')
  ).rows) {
    console.log(
      [
        s.email,
        new Date(Number(s.consent_at)).toISOString(),
        s.consent_version,
        `${origin}/api/jess/unsubscribe/${s.unsubscribe_token}/`,
      ]
        .map(csv)
        .join(','),
    );
  }
} finally {
  await db.end();
}
