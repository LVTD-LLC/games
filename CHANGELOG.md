# Changelog

## 2026-09-12 — Race rules and solid bumpers

- Increased the field to 12 cars and added 1–5 laps plus independent Easy / Real opponent and auto-assist settings, preserving beginner defaults.
- Added free steering with brake-to-reverse, solid buildings/tree trunks and per-driver back-to-road recovery when assistance is disabled.
- Added oriented car-body contacts and gentle momentum transfer: bumpers touch and cars can push without damage or visual overlap.
- Added ordered route gates for valid laps, off-lane finisher parking, shared scenery/collider descriptors, a camera that avoids buildings, and a Rowset roadside billboard.
- Expanded physics and browser coverage for dense fields, collisions, reverse/recovery, difficulty, saved settings and multiple laps.

## 2026-09-12 — Two-driver city adventures

- Added optional local two-player racing: arrow keys for Player 1, physical WASD keys for Player 2, separate colors and stacked third-person views.
- Added the longer City adventure route with left/right turns and multiple city blocks; kept the original Park loop selectable in either player mode.
- Counted both human drivers toward the 2–6 car setting, added two touch pads and per-driver progress, and let each player finish at their own pace before replay.
- Preserved old garage settings and added regression checks for independent controls, both maps, first-finisher waiting, pause, mode changes and simultaneous touch cancellation.

## 2026-09-12 — Little City Racers

- Added a standalone, low-poly 3D city racing game at `/city-racers/`, with WebGPU-first rendering and automatic WebGL 2 fallback.
- Added five body colors, 1–6 cars (three by default), a single short city loop, and a following third-person camera.
- Added arrow-key and multi-touch controls, forgiving road-following steering, non-blocking opponents, pause on focus loss, and quick replay.
- Added race simulation and desktop/mobile browser regression coverage, a catalogue logo, and a released-game entry.

## 2026-09-12 — Purple game catalogue

- Switched the Astro catalogue and not-found page to English while keeping Пять букв and its gameplay in Russian.
- Replaced the marketing layout with a purple, logo-led game list; removed eyebrows, small notes, metadata badges, and placeholder cards.
- Added registry-driven game logos and a matching purple site icon.
- Added repository, design, technical, and Wordle steering docs; simplified the README to the collection and released-games table.

## 2026-09-11 — Share-link hosting fix

- Shared results now link to the current game origin, so links work on the CapRover hostname before custom-domain DNS is available and automatically use the custom hostname once accessed there.

## 2026-09-11

- Created the games monorepo with independent npm packages and lockfiles for the Astro catalogue and each web game.
- Added a responsive Russian-language catalogue and Пять букв, a Russian Wordle game at `/wordle/`.
- Added daily UTC puzzles, unlimited practice, a Russian noun dictionary, physical/touch keyboard support, duplicate-letter scoring, saved progress, local statistics, accessible help, and spoiler-free sharing.
- Added production static hosting, real 404 responses, CI with game/browser/deployment checks, and automatic app-token-authenticated CapRover deployments after successful main CI.
- Documented package isolation, adding games, dictionary provenance, domain setup, and rollback.
