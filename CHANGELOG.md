# Changelog

## 2026-09-18 — Jess: chess against Jev

- Add Jess to the catalogue: choose White, Black or random; play legal chess with promotion choices, saved games, take-backs, keyboard/touch controls and responsive vector pieces.
- Let Jev choose from every legal move through a server-only TypeSafe Choice request. Show its top probabilities as move preferences, never win odds.
- Reuse the games backend and protected runtime key, with validated move histories, persistent paid-request budgets, bounded inference and recoverable errors. No new service or database migration.

## 2026-09-18 — Anonymous gameplay analytics

- Add PostHog visits, gameplay actions/outcomes, sharing, web vitals and sanitized browser/API errors across the catalogue, four games and shared BS results.
- Connect anonymous browser sessions across games; exclude submitted content and personal details.
- Configure production through a public project-token variable; keep local/test traffic isolated and publish source maps for error diagnosis.

## 2026-09-17 — Anonymous leaderboard entries

- Include saved unnamed BS Meter attempts in the ranking as Anonymous, with one best result per player and no name/email requirement. Existing anonymous results become eligible automatically.
- Update onboarding, result, and privacy copy; verify anonymous persistence, independent players, name changes, and public email privacy.

## 2026-09-17 — Share attempt detail pages

- Give BS Meter attempt pages a responsive scorecard and sharing section with X, Threads, WhatsApp, LinkedIn, copy, and supported device sharing.
- Preserve the original player's attribution, usable no-JavaScript links, accessible clipboard fallback and escaped user content; verify desktop/mobile sharing behavior.

## 2026-09-17 — Shared games PostgreSQL

- Consolidate static games and BS Meter API into the games app; remove the separate API deployment and SQLite runtime.
- Add shared private games-postgres configuration, game-namespaced schema, transactional versioned SQL migrations on startup, and a verified one-time SQLite importer preserving existing data.
- Preserve ranking/session/consent behavior with asynchronous PostgreSQL queries, atomic budgets and duplicate-safe results; run API and desktop/mobile tests against real PostgreSQL.

## 2026-09-17 — Corporate BS Meter

- Added the third game: a Jev-powered corporate nonsense meter with optional nickname/email onboarding, a persistent global top ten, and one best score per player.
- Added shareable score pages, social sharing, email consent/unsubscribe, and a separate rate-limited Node/SQLite API with a persistent volume and server-only credentials.
- Extended automatic deployment to verify the API before publishing the static site; added API and desktop/mobile browser regression coverage.

## 2026-09-12 — Short game descriptions

- Added a short English description to each catalogue entry, with full-width text on mobile.
- Updated Little City Racers copy to describe its solo and local two-player modes accurately.

## 2026-09-12 — More paints and car styles

- Expanded the paint palette from five to twelve colors, preserving saved favorites and adding clear selection marks on light paints.
- Added Rally and Pickup body styles alongside the original Racer, with independent picture-based choices for both players and mixed-style AI traffic.
- Kept all styles on the same chassis, collision footprint and driving physics; body/color choices persist safely across reloads and solo/two-player changes.
- Added appearance/physics parity, model footprint, geometry reuse and narrow-screen garage regression checks.

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

## 2026-09-18 — Game of Life

- Added an interactive Game of Life with classic patterns, drawing, zoom, playback and 100-generation fast-forward.
- Runs simulation in a private native Bend service with checked rule proofs, bounded multicore workers and automatic deployment alongside the website.

## 2026-09-18 — Bend deployment context

- Moved the Bend CapRover definition to the repository root so native builds retain the correct monorepo build context.
