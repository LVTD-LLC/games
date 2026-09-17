// Operator-only export. Contains private email addresses; never publish or commit its output.
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(
  process.env.DATABASE_PATH || '/data/corporate-bs.sqlite',
  { readOnly: true },
);
const origin = process.env.PUBLIC_ORIGIN || 'https://games.lvtd.dev';
const csv = (value) => '"' + String(value).replaceAll('"', '""') + '"';
console.log('email,consent_at,consent_version,unsubscribe_url');
for (const s of db
  .prepare('SELECT * FROM subscribers ORDER BY consent_at')
  .iterate()) {
  console.log(
    [
      s.email,
      new Date(s.consent_at).toISOString(),
      s.consent_version,
      `${origin}/corporate-bs-meter/unsubscribe/${s.unsubscribe_token}/`,
    ]
      .map(csv)
      .join(','),
  );
}
db.close();
