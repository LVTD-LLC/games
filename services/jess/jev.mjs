import { candidates } from './chess.mjs';
const names = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
export function moveQuestion(chess) {
  const moves = candidates(chess);
  return {
    state: {
      game: 'Standard chess',
      side_to_move: chess.turn() === 'w' ? 'White' : 'Black',
      fen: chess.fen(),
      board: chess.ascii(),
      legend:
        'Uppercase pieces are White; lowercase pieces are Black. Ranks 8 to 1, files a to h.',
      recent_moves: chess.history().slice(-20),
      in_check: chess.isCheck(),
    },
    questions: {
      move: {
        type: 'choice',
        instructions:
          'Which legal move is best for `side_to_move` in this chess position? Choose the strongest move toward winning: prioritize checkmate, avoid losing the king or hanging valuable pieces, and favor material gains, king safety and active development. Every option is legal; select exactly one. Evaluate for the side to move, not always for White.',
        criteria: Object.fromEntries(
          moves.map((m) => [
            m.id,
            `${m.san}: ${names[m.piece]} ${m.from} to ${m.to}${m.captured ? `, captures ${names[m.captured]}` : ''}${m.promotion ? `, promotes to ${names[m.promotion]}` : ''}`,
          ]),
        ),
      },
    },
  };
}
export function readChoice(answer, moves) {
  const probabilities = answer?.probabilities;
  if (
    answer?.type !== 'choice' ||
    !probabilities ||
    Array.isArray(probabilities) ||
    typeof probabilities !== 'object' ||
    Object.keys(probabilities).length !== moves.length ||
    !Number.isFinite(answer.confidence) ||
    answer.confidence < 0 ||
    answer.confidence > 1 ||
    !moves.some((m) => m.id === answer.choice)
  )
    throw new Error('Invalid Jev answer');
  const ranked = moves
    .map((move) => {
      const probability = probabilities[move.id];
      if (
        !Object.hasOwn(probabilities, move.id) ||
        !Number.isFinite(probability) ||
        probability < 0 ||
        probability > 1
      )
        throw new Error('Invalid move probability');
      return { ...move, probability };
    })
    .sort((a, b) => b.probability - a.probability || a.id.localeCompare(b.id));
  const sum = ranked.reduce((total, move) => total + move.probability, 0);
  if (
    Math.abs(sum - 1) > 0.02 ||
    ranked[0].probability <= 0 ||
    probabilities[answer.choice] < ranked[0].probability - 1e-9
  )
    throw new Error('Invalid distribution');
  // Choice is the documented argmax. Preserve the provider's tie choice.
  return {
    move: answer.choice,
    confidence: answer.confidence,
    probabilities: ranked,
  };
}
export function createJev({ apiKey, model = 'jev-1.13.0', request = fetch }) {
  return async (chess) => {
    if (!apiKey) throw new Error('Jev is not configured');
    const response = await request('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...moveQuestion(chess), model }),
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('Jev unavailable');
    const body = await response.json();
    return { ...readChoice(body.answers?.move, candidates(chess)), model };
  };
}
