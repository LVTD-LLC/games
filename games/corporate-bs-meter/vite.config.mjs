import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      input: { main: 'index.html', result: 'src/result-analytics.js' },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'result'
            ? 'result-analytics.js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  base: '/corporate-bs-meter/',
  server: { proxy: { '/api/corporate-bs': 'http://localhost:4174' } },
});
