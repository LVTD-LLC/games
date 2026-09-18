import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Only a PUBLIC ingestion token belongs here, never a personal/admin API key.
export function analyticsConfig(env = process.env) {
  const token = env.POSTHOG_PROJECT_TOKEN || '';
  const host = env.POSTHOG_HOST || 'https://us.i.posthog.com';
  if (token && !/^phc_[A-Za-z0-9]{20,128}$/.test(token))
    throw new Error(
      'POSTHOG_PROJECT_TOKEN must be a public phc_ project token',
    );
  if (host !== 'https://us.i.posthog.com')
    throw new Error('Games analytics must use the selected US PostHog project');
  return {
    enabled: Boolean(token),
    token,
    host,
    hosts: ['games.lvtd.dev', 'games.cap.gregagi.com'],
    revision: env.DEPLOY_SHA || 'development',
  };
}
export async function readAnalyticsConfig(path) {
  try {
    const config = JSON.parse(await readFile(path, 'utf8'));
    return analyticsConfig({
      POSTHOG_PROJECT_TOKEN: config.token,
      POSTHOG_HOST: config.host,
      DEPLOY_SHA: config.revision,
    });
  } catch (error) {
    if (error.code === 'ENOENT') return analyticsConfig();
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = analyticsConfig();
  if (!config.enabled)
    throw new Error('Production deployment requires POSTHOG_PROJECT_TOKEN');
  await writeFile(process.argv[2], JSON.stringify(config));
}
