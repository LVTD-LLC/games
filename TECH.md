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
The 1–6 total cars includes human drivers (minimum two cars in two-player mode);
the remaining cars are local computer-controlled friends. This is shared-keyboard
multiplayer on one computer, not online multiplayer. Settings use `lvtd-city-racers-v1:settings` and tolerate
unavailable or malformed storage.

Three.js `WebGPURenderer` tries WebGPU on secure origins, then falls back to WebGL 2.
Both are graphics APIs; actual hardware acceleration depends on the browser/device.
If neither initializes, the page explains recovery and keeps the catalogue link.
Renderer selection is available for diagnostics as `#world.dataset.renderer`, not in
the child's interface. No remote models, fonts, textures or runtime services are used.
The standalone renderer bundle is approximately 230 KB gzipped; it is never loaded
by the catalogue or Wordle.

The simulation in `games/city-racers/src/race.mjs` is independent of rendering.
`tracks.mjs` supplies distance-based poses for both routes: the original Park loop
(about 603 m), and City adventure (about 1,297 m) with signed rounded corners, left
and right turns, and conservative clearance between road segments.
Arrow Up accelerates, Down brakes (takes priority over acceleration), and Left/Right
steer laterally. Heading follows the continuous city loop, road edges clamp gently,
and rivals yield without solid collisions. Releasing the accelerator slows the car;
braking never reverses. One lap ends with a celebration, not a punitive loss screen. In two-player mode
each driver has independent distance, speed, steering and finish time; the first
finisher waits while the other keeps driving, and the shared result only opens
after both finish.
Escape pauses/resumes. Focus or visibility loss pauses and clears all held input.
Touch controls support simultaneous steering and acceleration and pointer cancellation.
Player 2 uses physical `KeyboardEvent.code` WASD keys, independent of text layout
(e.g. Russian). Each player has their own touch pad, color and HUD; pause/focus loss
clears both keyboard and pointer input. The saved `players`, `map` and `color2` fields
default safely when loading older saves. Human colors are kept distinct.

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
