# Changelog

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
