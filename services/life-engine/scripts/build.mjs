import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = '2.0.5';
const sha256 =
  '4db70e77ce1b1027f1d0e15dee025921fa794a9b415add4350ec7c64acf2775b';
const cache = path.join(root, 'node_modules/.cache');
const compiler = path.join(cache, `bend-${version}`);
const bun = path.join(root, 'node_modules/.bin/bun');
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, BEND_NO_TELEMETRY: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited ${result.status ?? result.signal}`);
}
if (!existsSync(path.join(compiler, 'bend2/main.ts'))) {
  await mkdir(cache, { recursive: true });
  const temp = await mkdtemp(path.join(cache, 'bend-download-'));
  try {
    console.log(`Downloading Bend ${version} (SHA-256 verified)…`);
    const response = await fetch(`https://bend-lang.com/dl/${version}.tar.gz`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(`Bend download failed: HTTP ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(archive).digest('hex') !== sha256)
      throw new Error('Bend compiler checksum mismatch');
    await writeFile(path.join(temp, 'release.tgz'), archive);
    await mkdir(path.join(temp, 'release'));
    run('tar', [
      '-xzf',
      path.join(temp, 'release.tgz'),
      '-C',
      path.join(temp, 'release'),
    ]);
    await rename(path.join(temp, 'release'), compiler);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
const entry = path.join(compiler, 'bend2/main.ts');
run(bun, [entry, 'PROOF.bend']);
if (process.argv.includes('--proof')) process.exit(0);
if (process.argv.includes('--test')) {
  run(bun, ['test', '--preload', entry, './test/rules.test.mjs']);
} else {
  await rm(path.join(root, 'dist'), { recursive: true, force: true });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  run(bun, [entry, 'bend/worker.bend', '-o', 'dist/life-worker']);
}
