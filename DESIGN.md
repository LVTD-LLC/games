# Catalogue design

Applies to `apps/site/`, not to the individual games. The catalogue is a quick way
to pick a game, not a marketing landing page. Keep it English; game titles retain
their intended language via `lang` from the registry.

## Visual direction

Purple is the main color: dark violet canvas, brighter violet actions, lavender
accents, and off-white text. Phaser.io is the requested color/feel reference, not
an asset source or a layout to clone. Canonical CSS tokens live in
`apps/site/src/layouts/Catalogue.astro`:

- Canvas `#1b1033`; row `#2c194b`; hover `#38205e`.
- Action purple `#8950ef`; lavender/focus `#cfb5ff`.
- Text `#faf7ff`; borders `#503475`.
- System Arial/Helvetica/sans-serif; no third-party font requests.

## Layout and content

- Shared brand header, one clear page heading, and a semantic list of released games.
- Each game row has its own logo, original title, and one visible Play action.
  The entire row is one link; do not nest buttons or duplicate tab stops inside it.
- Registry data supplies logos and titles. Never hard-code one game's artwork
  into the catalogue component. Logos have empty alt text when the adjacent title
  already names the game; decorative arrows are hidden from assistive technology.
- Desktop content is at most 1040px wide. Rows use generous 28px padding and a
  104px logo. At 600px and below, use 20px padding, a 72px logo, and a full-width
  Play treatment below the title. Keep 320px screens free of horizontal overflow.
- Use the same layout and palette for the English 404 page, with a direct home link.
- No eyebrows, tiny annotations, slogans, hero pitches, category/duration badges,
  counts, coming-soon placeholders, decorative footnotes, or filler sections.
  Do not add cards for games that have not shipped.

## Interaction

Keep readable contrast, visible keyboard focus, and comfortable touch targets.
Use real anchors so navigation works without JavaScript. Hover may change row
color/border; honor reduced motion. Inspect desktop and narrow mobile output when
changing layout rather than relying on a successful build alone.
