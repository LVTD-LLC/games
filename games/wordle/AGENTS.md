# Wordle constraints

- Russian five-letter nouns; six guesses; correct positions consume repeated letters before yellow matches.
- Е and Ё are equivalent. Physical Russian keyboard, Latin-keyboard layout mapping, and touch keyboard (including Ъ).
- Shared daily puzzle resets at midnight UTC. The daily round refreshes when the tab regains focus or the next key is entered after midnight.
- Practice can be replayed immediately. Both modes restore their own progress; finished daily games count once in local statistics.
- Storage and clipboard failures do not prevent play. Sharing falls back to selectable text and never includes guessed words.
- No accounts, analytics, backend calls, or third-party fonts. Like other client-side word games, answers are inspectable in source; this is not anti-cheat infrastructure.
- Curated daily pool is versioned in `src/engine.mjs`: **do not reorder or resize v1**, which would change existing daily answers. A new pool needs a versioned schedule and storage-key migration.
- Guess dictionary: five-letter lowercase nouns from [Harrix/Russian-Nouns](https://github.com/Harrix/Russian-Nouns), commit `6f0ae9f0619cf0401c6935b7cbba1165bf4c7f19`, `dist/russian_nouns.txt`, normalized Ё → Е and deduplicated (3,473 words). License is retained at `public/dictionary-license.txt`. Curated answers are also accepted as guesses.

## Working here

Keep the game UI Russian. The English catalogue is a separate document and must
not change the game language or styling. See [root AGENTS.md](../../AGENTS.md) for
setup and shipping. `src/engine.mjs` contains pure rules; `src/main.js` owns DOM,
input, storage, and sharing; `src/style.css` owns game styling.

From the repo root, `npm test` covers engine and deployment behavior;
`npm run build` assembles all games; `npm run test:e2e` exercises desktop/mobile
journeys in `tests/wordle.spec.js`. The package dev command is
`npm --prefix games/wordle run dev`; its Vite base must remain `/wordle/`.
