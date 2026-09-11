# LVTD Games

Small, independent web games with an Astro catalogue. Russian Wordle (**Пять букв**) is the first game.

- Intended public URL: https://games.lvtd.dev
- Hetzner / CapRover origin: https://games.cap.gregagi.com
- First game: `/wordle/`

## Local development

Node.js 24+ and npm are required.

```sh
npm ci --include=dev
npm run setup
npm run dev
```

Open http://localhost:4173. This builds all packages and previews the assembled site (no hot reload).

For hot reload, run an independent package:

```sh
npm --prefix apps/site run dev
npm --prefix games/wordle run dev
```

Astro's development server shows the catalogue only; game links need the assembled preview or the game's own Vite server (use its `/wordle/` path).

## Package isolation

```text
apps/site/         Astro catalogue, own package.json + package-lock.json
games/wordle/      Vanilla JS + Vite game, own package.json + package-lock.json
games.json         Game catalogue and build registry
scripts/           Build orchestration, local preview, deployment
dist/              Assembled deployment output (generated)
```

These are intentionally **independent npm projects**, not hoisted npm workspaces. Each has its own dependency tree and lockfile. The root owns only orchestration and browser-test tooling. A Phaser game, a Three.js game, and Astro can depend on different versions without resolving through a shared application manifest.

Games are separate HTML documents at `/<slug>/`; no iframe and no runtime imports from Astro. CSS and framework runtimes cannot bleed between pages. This is dependency/runtime isolation, **not a security sandbox**: games share an origin. Namespace local storage (Wordle uses `lvtd-wordle-v1:`), keep service workers scoped to the game, and use separate origins for untrusted code.

## Add a game

1. Create `games/<slug>/package.json` with a `build` script producing `dist/index.html` and static assets.
2. Install its dependencies in that directory and commit its own lockfile.
3. Configure its asset base as `/<slug>/` (for Vite: `base: '/<slug>/'`). All runtime asset requests must stay below that path.
4. Add its slug, title, description, category, duration, and `path: "games/<slug>"` to `games.json`.
5. Add a catalogue artwork variant to Astro as needed (the initial preview artwork is Wordle-specific), a concise changelog entry, and meaningful checks.
6. Run `npm run setup && npm run build`, then visit the assembled route directly and via the catalogue.

`scripts/packages.mjs` discovers registered packages, installs each with `npm ci`, builds the shell, then copies each standalone build into `dist/<slug>/`. New games do not need Dockerfile changes. Games may choose their own frontend technology, provided their build produces a static web app. A server-side game backend would require a separate service.

## Wordle rules and data

- Russian five-letter nouns; six guesses; correct positions consume repeated letters before yellow matches.
- Е and Ё are equivalent. Physical Russian keyboard, Latin-keyboard layout mapping, and touch keyboard (including Ъ).
- Shared daily puzzle resets at midnight UTC. The daily round refreshes when the tab regains focus or the next key is entered after midnight.
- Practice can be replayed immediately. Both modes restore their own progress; finished daily games count once in local statistics.
- Storage and clipboard failures do not prevent play. Sharing falls back to selectable text and never includes guessed words.
- No accounts, analytics, backend calls, or third-party fonts. Like other client-side word games, answers are inspectable in source; this is not anti-cheat infrastructure.
- Curated daily pool is versioned in `engine.mjs`: **do not reorder or resize v1**, which would change existing daily answers. A new pool needs a versioned schedule and storage-key migration.
- Guess dictionary: five-letter lowercase nouns from [Harrix/Russian-Nouns](https://github.com/Harrix/Russian-Nouns), commit `6f0ae9f0619cf0401c6935b7cbba1165bf4c7f19`, `dist/russian_nouns.txt`, normalized Ё → Е and deduplicated (3,473 words). License is retained at `games/wordle/public/dictionary-license.txt`. Curated answers are also accepted as guesses.

## Checks

```sh
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Unit tests protect repeated-letter scoring, daily-date boundaries, corrupted saves, spoiler-free sharing, and deployment failure handling. Browser tests exercise actual interaction on desktop/mobile. `BASE_URL=https://... npm run test:e2e` targets an existing deployment.

## Production / deployment

CapRover app `games` runs an Nginx static container on the existing Hetzner host. No persistent volumes or runtime app secrets are needed. Nginx gives unknown routes a real 404 and fingerprinted assets immutable caching.

The **CI** workflow validates PRs and main. A separate **Deploy to CapRover** workflow automatically follows successful main CI, checks out the tested SHA, skips superseded commits, and uploads tracked source plus a revision marker. It waits for the exact commit at `/deploy-revision.txt`, not just an HTTP 200. GitHub secret `CAPROVER_APP_TOKEN` is an app-scoped deploy token; never commit it or use the administrator password in CI.

Domain setup: DNS-only A record `games.lvtd.dev` → `195.201.166.171`; add that hostname to the CapRover `games` app, issue its Let's Encrypt certificate, then force HTTPS. The deploy verifier uses the HTTPS CapRover origin so a DNS-provider outage does not misreport an app rollout; verify the custom hostname after domain changes.

Rollback: revert the offending PR through another PR and merge after CI; this redeploys the prior source with a new exact revision marker. For an urgent operational rollback, use CapRover's previous successful app image via API/CLI, then reconcile the repo. No databases are involved.

Ship changes using branch → PR → passing CI → merge. Keep `CHANGELOG.md` append-only.
