# Technical guide

Read this for local development, adding games, package isolation, and deployment.
Repository workflow and check commands are canonical in [AGENTS.md](AGENTS.md).

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
games/city-racers/ Three.js + Vite game, own package.json + package-lock.json
games.json         Game catalogue and build registry
scripts/           Build orchestration, local preview, deployment
dist/              Assembled deployment output (generated)
```

These are intentionally **independent npm projects**, not hoisted npm workspaces. Each has its own dependency tree and lockfile. The root owns orchestration, browser-test tooling, and the server-only `pg`/`sirv` dependencies. A Phaser game, a Three.js game, and Astro can depend on different versions without resolving through a shared application manifest.

Games are separate HTML documents at `/<slug>/`; no iframe and no runtime imports from Astro. CSS and framework runtimes cannot bleed between pages. This is dependency/runtime isolation, **not a security sandbox**: games share an origin. Namespace local storage (Wordle uses `lvtd-wordle-v1:`), keep service workers scoped to the game, and use separate origins for untrusted code.

## Add a game

1. Create `games/<slug>/package.json` with a `build` script producing `dist/index.html` and static assets.
2. Install its dependencies in that directory and commit its own lockfile.
3. Configure its asset base as `/<slug>/` (for Vite: `base: '/<slug>/'`). All runtime asset requests must stay below that path.
4. Add its slug, original title, English description/category/duration, title language (e.g. `"ru"`), logo URL (e.g. `"/logos/wordle.svg"`), and `path: "games/<slug>"` to `games.json`.
5. Add its logo under `apps/site/public/logos/`, a released-game row in README.md, a concise changelog entry, and meaningful checks. The catalogue reads each logo from the registry.
6. Run `npm run setup && npm run build`, then visit the assembled route directly and via the catalogue.

`scripts/packages.mjs` discovers registered packages, installs each with `npm ci`, builds the shell, then copies each standalone build into `dist/<slug>/`. New games do not need Dockerfile changes. Games may choose their own frontend technology, provided their build produces a static web app. Games needing persistence add server-side routes under `services/` and a namespaced SQL migration; static-only games need no database code.

## Production / deployment

CapRover app `games` runs a Node 24 server: static game packages plus server-side APIs in one deployment. PostgreSQL is a separate **shared** private app, `games-postgres`; browser code never receives its connection string. Static games remain independent packages and do not use the database. `sirv` serves built assets with ETags and immutable fingerprinted-asset caching; unknown routes return the English 404 page.

The **CI** workflow validates PRs/main against a disposable PostgreSQL service. **Deploy to CapRover** follows successful main CI, checks out the tested SHA, skips superseded commits, and uploads tracked source plus `/deploy-revision.txt`. Only the existing app-scoped `CAPROVER_APP_TOKEN` is needed. There is no per-game API or database deployment in CI. The server applies committed migrations before accepting traffic; startup fails if a migration fails or an applied migration was changed. Container health checks verify a database query.

The public hostname `games.lvtd.dev` uses HTTPS on app `games` (195.201.166.171). Deployment verifies the exact SHA using `https://games.cap.gregagi.com/deploy-revision.txt`; also smoke-test the public game and health routes.

### Shared database and migrations

- Production specification: [`ops/games-postgres.json`](ops/games-postgres.json). PostgreSQL 17.11, one replica, private `captain-overlay-network`, no public ports/web ingress, persistent `games-postgres-data` mounted at `/var/lib/postgresql/data`. Do not recreate the volume for app deployments.
- `DATABASE_URL` belongs only in the **games app's runtime environment**, pointing to `srv-captain--games-postgres:5432/games`. The `games` login owns this database but is not a cluster superuser; the Postgres app's separate administrator credential is not given to games. Preserve unrelated CapRover settings when updating configuration.
- Every game uses its own schema (first: `corporate_bs`). Shared auth/payment tables can be introduced in later migrations; neither feature is implemented here. Do not treat a nickname or the existing BS cookie as shared authentication.
- Append ordered, zero-padded SQL files in `services/database/migrations/`, e.g. `0002_next_game.sql`. Use schema-qualified names and backward-compatible expand/contract changes. Never modify/remove an applied file.
- `npm run db:migrate` uses the same runner as startup. A PostgreSQL advisory lock serializes concurrent runners; the batch and migration ledger are transactional. Checksums reject edited files, missing history and out-of-order migrations. SQL must be transaction-compatible (no `CREATE INDEX CONCURRENTLY` or explicit transaction statements).
- Code rollback is a revert PR after CI, or the previous successful image for an emergency. Migrations are forward-only: retain compatible schema/data and ship corrective migrations. Never automatically drop database tables on rollback.
- Back up with `pg_dump -Fc` using protected runtime credentials and restore into a separate database with `pg_restore` for verification. Keep dumps private; they contain player and subscriber data. A persistent volume alone is not a backup. This change does not create a scheduled backup service.

Local database setup:

```sh
docker compose up -d --wait
export DATABASE_URL=postgres://games:local-games-only@127.0.0.1:5432/games
export TEST_DATABASE_URL=postgres://games:local-games-only@127.0.0.1:5432/postgres
npm run db:migrate
npm test
npm run build
npm run test:e2e
```

These are local-only credentials. Tests require a disposable PostgreSQL server with CREATEDB rights; they create isolated randomly named databases and remove them afterward. Never point `TEST_DATABASE_URL` at production. Browser tests exercise the real consolidated static/API server and PostgreSQL with an injected judge, without paid API calls. For real local play, provide `TYPESAFE_API_KEY` through the protected environment, set `PORT=4173 PUBLIC_ORIGIN=http://localhost:4173 COOKIE_SECURE=false`, and `npm start`. `npm run preview` remains a static-development proxy, not the production entrypoint.

### One-time SQLite cutover

The retired `corporate-bs-api` app used SQLite, not PostgreSQL. Its historical source lives in git history, not the current deployment workflow.

1. Provision the private Postgres app from the specification and set the games runtime environment; no data migration runs in CI.
2. Stop the old API writer during a short scoring maintenance window. Back up its entire persistent volume, or take a consistent SQLite online backup before stopping it. Keep the old image/configuration and backup for rollback.
3. Before starting the new server, run `node services/database/import-sqlite.mjs /path/to/backup.sqlite` with the target `DATABASE_URL`. The source is read-only; the importer applies migrations then copies all six tables transactionally. It verifies counts and **refuses any nonempty destination**, including settings, so do not start `openStore` first. Preserve session hashes, timestamps, result IDs/share links, consent/unsubscribe tokens, caches, counters, and IP salt.
4. Deploy the reviewed games revision, verify exact revision, database health, public rankings and existing share links. Keep the old API scaled to zero and its volume intact until separately authorized for deletion. Once new writes enter PostgreSQL, reverting to stale SQLite requires reconciliation; never silently switch back.
5. Normal future deploys only apply pending SQL migrations; they never repeat the import or provision per-game infrastructure.

Ship changes using branch → PR → passing CI → merge. Keep `CHANGELOG.md` append-only.

## Little City Racers

`/city-racers/` is a child-friendly 3D racing game for one or two local players.
The 1–12 total cars includes human drivers (minimum two cars in two-player mode);
the remaining cars are local computer-controlled friends. This is shared-keyboard
multiplayer on one computer, not online multiplayer. Settings use `lvtd-city-racers-v1:settings` and tolerate
unavailable or malformed storage.

Three.js `WebGPURenderer` tries WebGPU on secure origins, then falls back to WebGL 2.
Both are graphics APIs; actual hardware acceleration depends on the browser/device.
If neither initializes, the page explains recovery and keeps the catalogue link.
Renderer selection is available for diagnostics as `#world.dataset.renderer`, not in
the child's interface. No remote models, fonts, textures or runtime services are used.
The standalone renderer bundle is approximately 236 KB gzipped; it is never loaded
by the catalogue or Wordle.

The simulation in `games/city-racers/src/race.mjs` is independent of rendering.
`tracks.mjs` supplies distance-based poses for both routes: the original Park loop
(about 603 m), and City adventure (about 1,297 m) with signed rounded corners, left
and right turns, and conservative clearance between road segments.
Arrow Up accelerates, Down brakes (takes priority over acceleration), and Left/Right
steer. `Race settings` offers 1–5 laps, independent Easy / Real opponents and an
Auto-assist toggle; defaults stay one lap, Easy and assistance on. Existing saves
migrate safely with these defaults. Real opponents use the same 25 m/s maximum and
12 m/s² acceleration as drivers without catch-up waiting. Easy opponents are slower
and stay near the rearmost learner. Both modes use solid, damage-free bumpers.

With assistance on, heading follows the road and lateral motion is gently bounded.
With assistance off, position/heading/velocity are independent of the route; steering
uses a simple speed-sensitive bicycle model with lateral grip. Buildings, tree trunks,
streetlights, fountain edges and billboard supports are solid. Holding brake after
stopping selects low-speed reverse. Per-driver Back to road buttons (R for Player 1,
F for Player 2) return to a clear slot at/before the last earned checkpoint, preserving
lap state and clearing velocity. Pause/countdown and finish states protect input.

`collisions.mjs` uses oriented 2D boxes matching the visible car footprint (2.38 × 4.34 m),
separating-axis contacts, equal-mass normal impulses and iterative positional correction.
There is no damage, deformation or simulated rollover. Scenery and collision bounds
come from the same cached descriptors in `scenery.mjs`; tree collisions use trunks,
not the floating foliage. Driving remains planar. Physics substeps at up to 120 Hz
prevent tunneling at the bounded speeds and keep slow rendering from changing race pace.

Ordered road-width gates about 30 m apart validate each lap: off-road shortcuts,
reverse finish-line crossings and recovery do not award skipped checkpoints. Each
human driver has independent progress and finish time. Finishers park outside the race
lanes so they cannot obstruct remaining laps; the celebration opens only after all
human drivers finish, irrespective of when AI cars finish.

Escape pauses/resumes. Focus or visibility loss pauses and clears held input for both
players. Physical `KeyboardEvent.code` WASD works regardless of text layout (including
Russian). Each player has a color, lap counter, HUD and simultaneous-input touch pad.
Human colors stay distinct and AI body colors cycle through the remaining palette.
The optional saved fields include `players`, `map`, `color2`, `model`, `model2`, `assist`,
`difficulty` and `laps` under the existing namespaced storage key.

`vehicles.mjs` defines twelve named paints and three appearance-only body IDs:
Racer (the original), Rally (a tall hatchback) and Pickup (an open cargo bed).
Both human drivers can select a body independently; AI traffic cycles through the
styles. Old or invalid body settings default to Racer. `car-model.js` builds one
shared chassis/wheel set per car, with cached switchable upper-body groups and a
shared paint material. Changing paint/body never rebuilds geometry or changes the
simulation. All variants stay inside the same bumper/wheel footprint and have
identical acceleration, braking, grip, speed limit and collision response.
Garage picture buttons and wrapping paint grids retain 44 px touch targets on
320 px screens; light swatches use dark selection marks.

A locally drawn CanvasTexture billboard advertises Rowset on both maps; it makes no
remote request and does not navigate away from the child's game. Free-driving chase
cameras shorten their distance when a building would obstruct the view.

Two-player mode uses stacked chase-camera views. Each camera renders the shared
scene to a half-height render target, then two upright textured planes composite
into the single canvas. Render-target UVs follow WebGPURenderer’s top-left convention
on both WebGPU and WebGL 2, matching its QuadMesh rather than ordinary plane UVs.
This avoids backend-specific scissor/clear behavior and shares city/car geometry.
Only two map environments are cached; changing modes does not create more renderers.

The scene batches static geometry by material, caps pixel density and reduces
resolution when frames are slow. Physics uses small substeps; inactive scenes draw
only when changed. Browser regression tests deliberately exercise software WebGL 2
for portable CI; WebGPU needs a separate browser/adapter smoke test and must not be
claimed as verified merely because `navigator.gpu` exists.

For Linux WebGPU visual QA, use a virtual display and Chromium with
`--enable-unsafe-webgpu --ignore-gpu-blocklist --enable-gpu --enable-features=Vulkan --use-angle=swiftshader --use-vulkan=swiftshader`.
These are **test-only** software-adapter flags, never settings to ask players to enable.
A successful adapter request alone is insufficient: inspect the rendered scene,
complete a lap, replay, and check for GPU/device errors. Hardware performance remains
device-dependent.

## Corporate BS Meter

`/corporate-bs-meter/` is a standalone vanilla JS/Vite word game. Its server-only module under `services/corporate-bs-api/` is mounted in the games server (the directory name is not a separate deployed app). Routes and share/unsubscribe URLs remain unchanged. Data lives under the `corporate_bs` schema in shared PostgreSQL.

Runtime variables on **games**:

- `DATABASE_URL`: private shared PostgreSQL connection (never `VITE_` or build arguments).
- `TYPESAFE_API_KEY`: existing server-only scoring key; initially from Infisical Openclaw/prod `/projects/corporate-bs-meter`.
- `TYPESAFE_MODEL=jev-1.13.0`, `PUBLIC_ORIGIN=https://games.lvtd.dev`, `TRUST_PROXY=true`, `PORT=80`, `DAILY_JUDGING_LIMIT=3000`.

CapRover is the only API ingress and appends the real client IP to `X-Forwarded-For`. The API trusts only the last address, and only with `TRUST_PROXY=true`. Do not publish the container port or enable proxy trust behind an untrusted ingress. Rate counters store salted hashes, not raw IPs. Budget reservations use short atomic PostgreSQL transactions; no lock is held during remote judging. Keep one games replica for now: the per-player in-flight judging guard remains process-local, although persisted budgets and result uniqueness are database-enforced.

### Game semantics and data

- No accounts. A namespaced HttpOnly, Secure, SameSite cookie remembers a random
  player token for 90 days; only its hash is stored in the database. Nicknames are
  not verified identities. Clearing cookies creates a new player.
- Both name and email are optional. A name opts the player into the public ranking;
  clearing it removes them. Email requires a separate explicit updates checkbox.
- Emails are stored separately with consent timestamp/version and an unsubscribe
  token. They are never included in public responses or sent to TypeSafe. This
  release **collects opt-ins but sends no marketing email**. Operator-only export:
  `node services/corporate-bs-api/export-subscribers.mjs`. Its CSV contains private
  data; import securely into an email tool, and honor the current subscriber set
  and per-row unsubscribe URL before every send. GET opens a confirmation page;
  POST removes the subscription (email scanners cannot silently unsubscribe).
- Every scored phrase gets an unguessable share URL with server-rendered metadata.
  Named players' best entries appear in the top ten. Other results remain accessible
  by their share link. Never submit confidential data. HTML is escaped in result
  pages and inserted with `textContent` in the browser.
- Scores are server-produced rubric points out of 100, **not confidence percentages**.
  Higher means more convincingly empty corporate language. TypeSafe judges validity
  and public suitability independently; malformed/failed responses never save a
  score. Fixed score-band verdicts avoid a second generative model.
- Each player gets one leaderboard seat for their best result. Ties use earliest
  result time then ID. Repeat identical submissions reuse the stored result, and
  identical normalized phrases use a cache keyed by the rubric version.
- Limits: 10 attempts/player/minute, 60/player/day, 30/IP/minute, 300/IP/day, and
  3,000 paid judging requests/day globally by default (includes nickname checks).
  Counters survive restarts. Return friendly failures on timeouts or exhaustion.
  These are casual-game abuse controls, not a proof-of-human competition.
- Change `RUBRIC_VERSION` whenever the rubric or model changes: previous scores
  stay shareable but are excluded from the new ranking and cache namespace.
- X, Threads and WhatsApp use text-prefilled share intents. LinkedIn supports only
  the URL: we copy the caption for pasting and explain that in the UI. Native share
  and manual-copy fallbacks need no social credentials and never post automatically.

### Sharing a saved BS Meter attempt

Public result pages render `services/corporate-bs-api/result-page.mjs` and load the game's `public/result-page.css` and `public/result-share.js`. The detail-only CSP allows same-origin scripts/styles without allowing inline scripts. These pages need no player session or API calls to share. Text attributes the original player rather than claiming the viewer earned the score; links always use the canonical result URL, without tracking query parameters.

X, Threads, WhatsApp and LinkedIn use normal external links with `noopener noreferrer`. Copy and device sharing progressively enhance them; denied clipboard access reveals a labelled, selected text field. LinkedIn shares the URL and separately copies a caption for pasting. With JavaScript disabled, the social links, permalink and copyable text remain available. Browser tests stub native share/clipboard permissions and intercept LinkedIn navigation: they validate our integration, not delivery through a real social account or operating-system share sheet.
