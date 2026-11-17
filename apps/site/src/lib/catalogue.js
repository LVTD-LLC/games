import { track } from './analytics.js';
document.querySelectorAll('[data-game]').forEach((link) => {
  const capture = () =>
    track('game_selected', { target_game: link.dataset.game });
  link.addEventListener('click', capture);
  link.addEventListener('auxclick', (event) => {
    if (event.button === 1) capture();
  });
});
