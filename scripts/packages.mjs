import { readFile, rm, mkdir, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const games = JSON.parse(await readFile(path.join(root, 'games.json'), 'utf8'));
const seen = new Set();
for (const game of games) {
  if (
    !/^[a-z][a-z0-9-]*$/.test(game.slug) ||
    seen.has(game.slug) ||
    game.path !== `games/${game.slug}`
  ) {
    throw new Error(
      'Each game needs a unique URL-safe slug and matching games/<slug> directory.',
    );
  }
  seen.add(game.slug);
}
function run(cwd, args) {
  const result = spawnSync('npm', args, {
    cwd: path.join(root, cwd),
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const command = process.argv[2];
if (command === 'install') {
  for (const dir of ['apps/site', ...games.map((g) => g.path)])
    run(dir, ['ci', '--include=dev']);
} else if (command === 'build') {
  await rm(path.join(root, 'dist'), { recursive: true, force: true });
  run('apps/site', ['run', 'build']);
  await cp(path.join(root, 'apps/site/dist'), path.join(root, 'dist'), {
    recursive: true,
  });
  for (const game of games) {
    run(game.path, ['run', 'build']);
    const destination = path.join(root, 'dist', game.slug);
    await mkdir(destination, { recursive: true });
    await cp(path.join(root, game.path, 'dist'), destination, {
      recursive: true,
    });
  }
} else throw new Error('Expected install or build.');
