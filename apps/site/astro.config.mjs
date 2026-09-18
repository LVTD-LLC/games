import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://games.lvtd.dev',
  output: 'static',
  vite: { build: { sourcemap: true } },
  trailingSlash: 'always',
});
