import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const games = JSON.parse(
  await readFile(new URL('../games.json', import.meta.url)),
);
const origin = 'https://lvtd.dev';
async function get(path, method = 'GET') {
  const response = await fetch(origin + path, {
    method,
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.startsWith('text/html')
  )
    throw new Error(
      `Expected an HTML page at ${path}, received ${response.status}`,
    );
  return response;
}

// Django's workers refresh the release registry independently every 30 seconds.
for (let attempt = 0; ; attempt++) {
  try {
    const catalogue = await (await get('/games/')).text();
    for (const { slug } of games) {
      const path = `/${slug}/`;
      if (!catalogue.includes(`href="${path}"`))
        throw new Error(`Public catalogue is missing ${path}`);
      await get(path, 'HEAD');
    }
    console.log(
      `Verified the public catalogue and ${games.length} game routes.`,
    );
    break;
  } catch (error) {
    if (attempt === 11) throw error;
    await delay(5000);
  }
}
