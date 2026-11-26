import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function uploadApp({
  server,
  appName,
  appToken,
  gitSha,
  archive,
  request = fetch,
}) {
  const form = new FormData();
  form.set('gitHash', gitSha);
  form.set(
    'sourceFile',
    new Blob([archive], { type: 'application/x-tar' }),
    'deploy.tar',
  );
  // An attached upload returns the builder's terminal error when available.
  // A long build can outlive CapRover's HTTP proxy; reconcile it by revision.
  let response;
  try {
    response = await request(
      new URL(`/api/v2/user/apps/appData/${appName}/`, server),
      {
        method: 'POST',
        headers: { 'x-captain-app-token': appToken },
        body: form,
        redirect: 'error',
        signal: AbortSignal.timeout(150_000),
      },
    );
  } catch (error) {
    if (error.name === 'TimeoutError' || error instanceof TypeError)
      return 'unconfirmed';
    throw error;
  }
  if ([502, 503, 504].includes(response.status)) return 'unconfirmed';
  if (!response.ok)
    throw new Error(`CapRover upload failed (HTTP ${response.status}).`);
  const result = await response.json();
  if (
    result.status === 1109 &&
    /failed to resolve source metadata|no active session/i.test(
      result.description,
    ) &&
    /deadline exceeded|timed? ?out/i.test(result.description)
  )
    return 'image-timeout';
  if (![100, 101].includes(result.status))
    throw new Error(`CapRover rejected deployment (status ${result.status}).`);
  return 'accepted';
}

export async function deploy({
  server,
  appName,
  appToken,
  productionUrl,
  gitSha,
  archive,
  request = fetch,
  pause = delay,
  attempts = 120,
}) {
  if (
    !appToken ||
    !/^[a-z0-9-]+$/.test(appName ?? '') ||
    !/^[a-f0-9]{40}$/.test(gitSha ?? '')
  )
    throw new Error('Missing deployment token or invalid app name/commit SHA.');
  for (const value of [server, productionUrl]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error(
        'Deployment endpoints must use HTTPS without embedded credentials.',
      );
  }

  async function isLive() {
    const url = new URL(
      appName === 'games-life' ? '/api/life/health' : '/deploy-revision.txt',
      productionUrl,
    );
    url.searchParams.set('check', gitSha + '-' + Date.now());
    try {
      const live = await request(url, {
        headers: { 'Cache-Control': 'no-cache' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!live.ok) return false;
      if (appName === 'games-life') {
        const health = await live.json();
        return (
          health.ready === true &&
          health.protocol === 1 &&
          health.revision === gitSha
        );
      }
      return (await live.text()).trim() === gitSha;
    } catch {
      return false;
    }
  }

  if (await isLive()) return;
  for (let submission = 0; submission < 2; submission++) {
    const outcome = await uploadApp({
      server,
      appName,
      appToken,
      gitSha,
      archive,
      request,
    });
    if (outcome !== 'image-timeout') {
      const deadline = Date.now() + 600_000;
      for (
        let attempt = 0;
        attempt < attempts && Date.now() < deadline;
        attempt++
      ) {
        if (await isLive()) {
          console.log(`Verified ${appName} at ${gitSha}`);
          return;
        }
        if (attempt + 1 < attempts) await pause(5000);
      }
      if (outcome === 'accepted') break;
    }
    if (submission === 0) {
      console.log(
        outcome === 'image-timeout'
          ? `${appName}: base image resolution timed out; retrying the tested archive.`
          : `${appName}: upload outcome unknown and revision still absent; retrying the tested archive.`,
      );
      await pause(5000);
      if (await isLive()) return;
    }
  }
  throw new Error(
    `${appName} did not serve the expected revision; check the CapRover build and service logs.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await deploy({
      server: process.env.CAPROVER_SERVER,
      appName: process.env.CAPROVER_APP_NAME,
      appToken: process.env.CAPROVER_APP_TOKEN,
      productionUrl: process.env.PRODUCTION_URL,
      archive: await readFile(process.argv[2]),
      gitSha: process.argv[3],
    });
  } catch (error) {
    // Do not log request headers, server response bodies, or credential-bearing objects.
    console.error(error.message);
    process.exitCode = 1;
  }
}
