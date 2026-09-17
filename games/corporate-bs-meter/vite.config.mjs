import { defineConfig } from 'vite';
export default defineConfig({
  base: '/corporate-bs-meter/',
  server: { proxy: { '/api/corporate-bs': 'http://localhost:4174' } },
});
