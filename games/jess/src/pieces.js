// Original, locally rendered vector pieces: no remote image or font dependency.
const shapes = {
  p: '<circle cx="24" cy="13" r="6"/><path d="M20 19h8l-1 7 5 8H16l5-8z"/>',
  r: '<path d="M13 7h6v6h4V7h3v6h4V7h6v12l-5 3 1 12H16l1-12-4-3z"/><path d="M17 19h14" fill="none"/>',
  n: '<path d="M16 34l2-9 8-6-5-1-4 4-7-4 7-10 10-2-1-4 7 6 3 12-3 14z"/><circle cx="24" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  b: '<path d="M24 4c-4 5-9 9-9 14 0 4 4 7 9 7s9-3 9-7c0-5-5-9-9-14z"/><path d="M21 11l6 7" fill="none"/><path d="M21 25h6l5 9H16z"/>',
  q: '<path d="M12 13l4 20h16l4-20-8 9-4-13-4 13z"/><circle cx="11" cy="10" r="3"/><circle cx="24" cy="7" r="3"/><circle cx="37" cy="10" r="3"/>',
  k: '<path d="M24 3v10m-5-6h10" fill="none" stroke-width="3"/><path d="M24 17c-10-10-17-2-12 5l6 11h12l6-11c5-7-2-15-12-5z"/><path d="M18 28h12" fill="none"/>',
};
export const pieceName = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
export function pieceSVG(piece) {
  const light = piece.color === 'w';
  return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" style="color:${light ? '#34463e' : '#f3eddd'}"><g fill="${light ? '#fff9e8' : '#293e35'}" stroke="${light ? '#34463e' : '#e0e5d5'}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${shapes[piece.type]}<path d="M15 34h18l3 6H12z"/><path d="M12 40h24v3H12z"/></g></svg>`;
}
