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

These are intentionally **independent npm projects**, not hoisted npm workspaces. Each has its own dependency tree and lockfile. The root owns only orchestration and browser-test tooling. A Phaser game, a Three.js game, and Astro can depend on different versions without resolving through a shared application manifest.

Games are separate HTML documents at `/<slug>/`; no iframe and no runtime imports from Astro. CSS and framework runtimes cannot bleed between pages. This is dependency/runtime isolation, **not a security sandbox**: games share an origin. Namespace local storage (Wordle uses `lvtd-wordle-v1:`), keep service workers scoped to the game, and use separate origins for untrusted code.

## Add a game

1. Create `games/<slug>/package.json` with a `build` script producing `dist/index.html` and static assets.
2. Install its dependencies in that directory and commit its own lockfile.
3. Configure its asset base as `/<slug>/` (for Vite: `base: '/<slug>/'`). All runtime asset requests must stay below that path.
4. Add its slug, original title, English description/category/duration, title language (e.g. `"ru"`), logo URL (e.g. `"/logos/wordle.svg"`), and `path: "games/<slug>"` to `games.json`.
5. Add its logo under `apps/site/public/logos/`, a released-game row in README.md, a concise changelog entry, and meaningful checks. The catalogue reads each logo from the registry.
6. Run `npm run setup && npm run build`, then visit the assembled route directly and via the catalogue.

`scripts/packages.mjs` discovers registered packages, installs each with `npm ci`, builds the shell, then copies each standalone build into `dist/<slug>/`. New games do not need Dockerfile changes. Games may choose their own frontend technology, provided their build produces a static web app. A server-side game backend would require a separate service.

## Production / deployment

CapRover app `games` runs an Nginx static container on the existing Hetzner host. No persistent volumes or runtime app secrets are needed. Nginx gives unknown routes a real 404 and fingerprinted assets immutable caching.

The **CI** workflow validates PRs and main. A separate **Deploy to CapRover** workflow automatically follows successful main CI, checks out the tested SHA, skips superseded commits, and uploads tracked source plus a revision marker. It waits for the exact commit at `/deploy-revision.txt`, not just an HTTP 200. GitHub secret `CAPROVER_APP_TOKEN` is an app-scoped deploy token; never commit it or use the administrator password in CI.

The public hostname `games.lvtd.dev` is active with HTTPS on the CapRover `games` app; its DNS-only A record points to `195.201.166.171`. The deploy verifier uses the HTTPS CapRover origin so a DNS-provider outage does not misreport an app rollout; verify the custom hostname after domain changes.

Rollback: revert the offending PR through another PR and merge after CI; this redeploys the prior source with a new exact revision marker. For an urgent operational rollback, use CapRover's previous successful app image via API/CLI, then reconcile the repo. No databases are involved.

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
The standalone renderer bundle is approximately 235 KB gzipped; it is never loaded
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
The optional saved fields include `players`, `map`, `color2`, `assist`, `difficulty`
and `laps` under the existing namespaced storage key.

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
