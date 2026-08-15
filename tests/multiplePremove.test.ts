import { playPremove, userMove } from '../src/board';
import { configure } from '../src/config';
import { defaults, type HeadlessState } from '../src/state';
import type * as cg from '../src/types';

const position = (whiteKing: cg.Key, blackKing: cg.Key = 'h8'): cg.Pieces =>
  new Map([
    [whiteKing, { role: 'king', color: 'white' }],
    [blackKing, { role: 'king', color: 'black' }],
  ]);

const makeState = (maxCount: number): HeadlessState => {
  const state = defaults();
  state.pieces = position('g2');
  state.turnColor = 'black';
  state.movable.color = 'white';
  state.movable.free = false;
  state.premovable.maxCount = maxCount;
  return state;
};

const applyAuthoritativePosition = (state: HeadlessState, piecesFen: string, dests: cg.Dests): void => {
  configure(state, {
    fen: piecesFen,
    turnColor: 'white',
    movable: {
      color: 'white',
      free: false,
      dests,
    },
  });
};

test('single premove mode keeps the legacy non-preview behaviour', () => {
  const state = makeState(1);

  expect(userMove(state, 'g2', 'f2')).toBe(true);
  expect(state.premovable.queue).toEqual([['g2', 'f2']]);
  expect(state.premovable.current).toEqual(['g2', 'f2']);
  expect(state.pieces.has('g2')).toBe(true);
  expect(state.pieces.has('f2')).toBe(false);
});

test('multiple premoves build a speculative position and execute in order', () => {
  const state = makeState(4);

  expect(userMove(state, 'g2', 'f2')).toBe(true);
  expect(state.pieces.has('f2')).toBe(true);
  expect(userMove(state, 'f2', 'e2')).toBe(true);
  expect(state.pieces.has('e2')).toBe(true);
  expect(state.premovable.queue).toEqual([
    ['g2', 'f2'],
    ['f2', 'e2'],
  ]);

  // Opponent move arrives. The parent replaces the speculative board with the
  // authoritative position and legal moves before asking Chessground to premove.
  applyAuthoritativePosition(state, '7k/8/8/8/8/8/6K1/8 w - - 0 1', new Map([['g2', ['f2']]]));

  expect(playPremove(state)).toBe(true);
  expect(state.premovable.queue).toEqual([['f2', 'e2']]);
  // The remaining tail is immediately restored as a preview.
  expect(state.pieces.has('e2')).toBe(true);
  expect(state.pieces.has('f2')).toBe(false);

  applyAuthoritativePosition(state, '8/7k/8/8/8/8/5K2/8 w - - 0 1', new Map([['f2', ['e2']]]));

  expect(playPremove(state)).toBe(true);
  expect(state.premovable.queue).toEqual([]);
  expect(state.premovable.current).toBeUndefined();
  expect(state.pieces.has('e2')).toBe(true);
});

test('an illegal queue head cancels the dependent tail and restores the real position', () => {
  const state = makeState(4);

  expect(userMove(state, 'g2', 'f2')).toBe(true);
  expect(userMove(state, 'f2', 'e2')).toBe(true);

  // The opponent king moved from h8 to h7 in the authoritative update. If the
  // premove head is rejected, rollback must keep h7 rather than restoring the
  // stale pre-opponent position from which the speculative queue was created.
  applyAuthoritativePosition(state, '8/7k/8/8/8/8/6K1/8 w - - 0 1', new Map([['g2', ['h2']]]));

  expect(playPremove(state)).toBe(false);
  expect(state.premovable.queue).toEqual([]);
  expect(state.premovable.current).toBeUndefined();
  expect(state.pieces.has('g2')).toBe(true);
  expect(state.pieces.has('h7')).toBe(true);
  expect(state.pieces.has('h8')).toBe(false);
  expect(state.pieces.has('f2')).toBe(false);
  expect(state.pieces.has('e2')).toBe(false);
});
