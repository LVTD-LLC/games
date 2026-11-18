# Catalogue design

Applies to `apps/site/`, not to the individual games. The catalogue is a quick way
to pick a game, not a marketing landing page. Keep it English; game titles retain
their intended language via `lang` from the registry.

## Visual direction

Use the studio's warm paper (#faf9f5), dark ink (#252820), hairline rules and serif catalogue headings. The fire-heart marks the link back to the collection inside every game. Its shared CSS lives in `shared/studio.css`; each game bundles it independently.

## Layout and content

- Shared brand header, one clear page heading, and a semantic list of released games.
- Each game row has its own logo, original title, and one visible Play action.
  The entire row is one link; do not nest buttons or duplicate tab stops inside it.
- Registry data supplies logos and titles. Never hard-code one game's artwork
  into the catalogue component. Logos have empty alt text when the adjacent title
  already names the game; decorative arrows are hidden from assistive technology.
- Keep titles, summaries and game logos readable at 320px and on desktop.
- Use the same layout and palette for the English 404 page, with a direct home link.
- No eyebrows, tiny annotations, slogans, hero pitches, category/duration badges,
  counts, coming-soon placeholders, decorative footnotes, or filler sections.
  Do not add cards for games that have not shipped.

## Interaction

Keep readable contrast, visible keyboard focus, and comfortable touch targets.
Use real anchors so navigation works without JavaScript. Hover may change row
color/border; honor reduced motion. Inspect desktop and narrow mobile output when
changing layout rather than relying on a successful build alone.
