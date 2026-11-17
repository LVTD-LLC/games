import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://lvtd.dev',
  base: '/games/',
  output: 'static',
  vite: { build: { sourcemap: true } },
  trailingSlash: 'always',
});
