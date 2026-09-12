# Working on LVTD Games

This repo is a collection of independent browser games at https://games.lvtd.dev/.
Read this file for any change; read [TECH.md](TECH.md) for package/deployment details
and [DESIGN.md](DESIGN.md) before changing the Astro catalogue. Game-specific rules
live beside the game, currently [games/wordle/AGENTS.md](games/wordle/AGENTS.md).

## Commands (from the repository root)

Use Node.js 24+ and npm. Each app has its own lockfile and dependencies.

```sh
npm ci --include=dev
npm run setup
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

- `npm run dev` builds everything and serves http://localhost:4173 (no hot reload).
- `npm run preview` serves the existing root `dist/`; build first.
- `npm --prefix apps/site run dev` starts catalogue-only Astro hot reload.
- `npm --prefix games/wordle run dev` starts Vite; visit its `/wordle/` path.
- `BASE_URL=https://games.lvtd.dev npm run test:e2e` checks the live deployment.
- No lint script exists. Format changed supported files with `npx prettier --write <paths>`;
  verify them with `npx prettier --check <paths>` and `git diff --check`.

Do not rebuild root `dist/` during browser tests: the build replaces the served files.
Playwright needs Chromium and its OS libraries; use the install command above on a
fresh machine. CI installs them in `.github/workflows/ci.yml`.

## Boundaries

- `games.json` is the catalogue/build registry. Each released entry needs `slug`,
  `title`, English `description`, `category`, `duration`, title `language`, `logo`
  (site-root URL), and `path: "games/<slug>"`. Put logos in `apps/site/public/logos/`.
- Keep the catalogue English; preserve each game's intended title and language.
- Keep games as separate npm projects and HTML documents. Do not introduce hoisted
  workspaces, shared game runtimes, or imports between Astro and game source.
- Namespace storage and service workers per game; same-origin games are not a
  security sandbox. Do not add untrusted game code to this shared origin.
- Never edit generated `dist/`, `.astro/`, or `node_modules/`. Commit package lockfiles.
- Keep README product-facing: collection introduction and released-games table.
  Put developer guidance here or in TECH.md, not back into the README.

## Shipping

Pull the latest main before branching. Ship through a PR, never direct commits to
main. Run unit tests, a full build, and desktop/mobile browser checks. For catalogue
changes, also inspect narrow and desktop layouts, logo loading, keyboard navigation,
and the English not-found page. Add behavior tests when they protect a meaningful
regression, not tests that just mirror CSS or prose.

Add a new concise CHANGELOG.md entry without rewriting old entries. Wait for CI;
if an automated reviewer is enabled, wait for its completed review on the current
head and address material feedback before merging. A successful main CI triggers
production deployment. Verify the deployed revision and the affected public routes.
Use the task's merge authorization; ask before destructive infrastructure or data
changes. Never commit credentials or expose the app deploy token.
