import { defineConfig } from 'vite';
import { createQuizApi } from '../../services/quiz-club/http.mjs';
export default defineConfig({
  base: '/quiz-club/',
  server: { host: true },
  plugins: [
    {
      name: 'local-quiz-rooms',
      configureServer(server) {
        const api = createQuizApi();
        server.httpServer?.once('close', api.close);
        server.middlewares.use((req, res, next) =>
          req.url.startsWith('/quiz-club/api/') ? api.handle(req, res) : next(),
        );
      },
    },
  ],
});
