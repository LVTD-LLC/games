import { Chess } from 'chess.js';
export const MAX_PLIES = 600;
export const uci = (move) => move.from + move.to + (move.promotion || '');
export function position(moves, player) {
  if (
    !['w', 'b'].includes(player) ||
    !Array.isArray(moves) ||
    moves.length > MAX_PLIES
  )
    throw new Error('Invalid game');
  const chess = new Chess();
  for (const move of moves) {
    if (
      typeof move !== 'string' ||
      !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) ||
      chess.isGameOver()
    )
      throw new Error('Invalid move history');
    chess.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move[4],
    });
  }
  return chess;
}
export function candidates(chess) {
  return chess.moves({ verbose: true }).map((move) => ({
    id: uci(move),
    san: move.san,
    from: move.from,
    to: move.to,
    piece: move.piece,
    captured: move.captured || null,
    promotion: move.promotion || null,
  }));
}
