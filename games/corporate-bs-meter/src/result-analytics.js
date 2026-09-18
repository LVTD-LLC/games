import { track } from './analytics.js';
document.addEventListener('click', (event) => {
  const link = event.target.closest('a,button');
  if (!link) return;
  if (link.matches('.challenge-button')) track('bs_challenge_accepted');
  const channel = {
    'detail-x': 'x',
    'detail-threads': 'threads',
    'detail-whatsapp': 'whatsapp',
    'detail-linkedin': 'linkedin',
    'detail-copy': 'clipboard',
    'detail-native': 'native',
  }[link.id];
  if (channel) track('game_share_opened', { channel });
});
