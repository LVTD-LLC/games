import { defineConfig } from 'vite';

// Django renders the public catalogue. Both catalogues use the same events.
export default defineConfig({
  base: '/games/tracking/',
  build: {
    outDir: 'dist/tracking',
    copyPublicDir: false,
    lib: {
      entry: 'src/lib/catalogue.js',
      formats: ['es'],
      fileName: () => 'catalogue.js',
    },
  },
});
