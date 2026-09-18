import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { deploy, uploadApp } from './deploy-caprover.mjs';

const gitSha = process.argv[3];
if (
  !/^[a-f0-9]{40}$/.test(gitSha || '') ||
  !process.env.LIFE_CAPROVER_APP_TOKEN ||
  !process.env.CAPROVER_APP_TOKEN
)
  throw new Error('Both app tokens and a tested commit are required');
const archive = await readFile(process.argv[2]);
const server = process.env.CAPROVER_SERVER;
const productionUrl = process.env.PRODUCTION_URL;
if (
  server !== 'https://captain.cap.gregagi.com' ||
  productionUrl !== 'https://games.cap.gregagi.com'
)
  throw new Error('Unexpected deployment target');

// Separate app tokens: the native service cannot deploy the website or vice versa.
await uploadApp({
  server,
  appName: 'games-life',
  appToken: process.env.LIFE_CAPROVER_APP_TOKEN,
  gitSha,
  archive,
});
await deploy({
  server,
  appName: 'games',
  appToken: process.env.CAPROVER_APP_TOKEN,
  productionUrl,
  gitSha,
  archive,
});

// The engine has no public ingress. Verify it through the website's fixed proxy.
let verified = false;
for (let attempt = 0; attempt < 120; attempt++) {
  try {
    const response = await fetch(`${productionUrl}/api/life/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const health = await response.json();
    if (
      response.ok &&
      health.ready &&
      health.revision === gitSha &&
      health.protocol === 1
    ) {
      verified = true;
      break;
    }
  } catch {}
  await delay(5000);
}
if (!verified)
  throw new Error('Native engine did not serve the tested revision');
const seed = Array(4096).fill('0');
for (const index of [2015, 2016, 2017]) seed[index] = '1';
const response = await fetch(`${productionUrl}/api/life/step`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ board: seed.join(''), steps: 2 }),
  signal: AbortSignal.timeout(15000),
});
const result = await response.json();
if (!response.ok || result.board !== seed.join(''))
  throw new Error('Deployed native simulation failed its blinker check');
console.log(
  `Verified games and private games-life at ${gitSha}, including native simulation`,
);
