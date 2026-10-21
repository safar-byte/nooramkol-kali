import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_ORDER,
  INITIAL_STICK_COUNTS,
  LAYOUTS,
  MAX_SCORE,
  STICK_POINTS,
} from '../game/constants.js';
import { checkPileValidity, createBundle, createPile, createStickSet } from '../game/createPile.js';
import { ACTIONS, createGame, gameReducer, getRoundSummary } from '../game/gameReducer.js';
import { getStickEndpoints, pointInRect } from '../game/geometry.js';

const run = (state, ...actions) => actions.reduce(gameReducer, state);

/** Find a deterministic seed whose first drop produces a valid pile. */
function startPlaying({ difficulty = 'traditional', layout = 'landscape', foulEndsRound = false } = {}) {
  for (let seed = 1; seed < 500; seed += 1) {
    const state = run(
      createGame({ difficulty, layout, seed: 7, foulEndsRound }),
      { type: ACTIONS.DROP_STICKS, seed },
      { type: ACTIONS.DROP_SETTLED },
      { type: ACTIONS.PILE_VALIDATED },
    );
    if (state.phase === 'playing') return state;
  }
  throw new Error('no valid pile found');
}

function pick(state, stickId) {
  return run(state, { type: ACTIONS.BEGIN_DRAG, stickId }, { type: ACTIONS.MOVE_SUCCEEDED, stickId });
}

function foul(state, stickId) {
  return run(
    state,
    { type: ACTIONS.BEGIN_DRAG, stickId },
    { type: ACTIONS.MOVE_FAILED, stickId, reason: 'disturbed-other-stick', disturbedStickIds: ['x'] },
  );
}

/** Replace the pile with hand-placed sticks so validity can be controlled. */
function withValidatingPile(state, overlap) {
  const sticks = state.sticks.map((s, i) => ({
    ...s,
    x: s.type === 'large' ? 300 : 100 + i * 40,
    y: s.type === 'large' ? 300 : 500,
    angle: s.type === 'large' ? 0 : Math.PI / 2,
  }));
  if (overlap) sticks[1] = { ...sticks[1], x: 300, y: 300 };
  return { ...state, phase: 'validating-pile', sticks };
}

describe('stick set and pile', () => {
  it('always has exactly 10 small sticks worth 10 and 1 large stick worth 100', () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      const game = run(createGame({ difficulty, seed: 3 }), { type: ACTIONS.DROP_STICKS, seed: 11 });
      const small = game.sticks.filter((s) => s.type === 'small');
      const large = game.sticks.filter((s) => s.type === 'large');
      expect(small).toHaveLength(INITIAL_STICK_COUNTS.small);
      expect(large).toHaveLength(INITIAL_STICK_COUNTS.large);
      expect(small.every((s) => s.points === 10)).toBe(true);
      expect(large[0].points).toBe(100);
    }
    expect(MAX_SCORE).toBe(200);
  });

  it('starts as a bundle with the large stick below the small sticks', () => {
    const game = createGame({ seed: 5 });
    expect(game.phase).toBe('bundling');
    expect(game.sticks[0].type).toBe('large');
    expect(game.sticks.slice(1).every((s) => s.type === 'small')).toBe(true);
  });

  it('keeps every scattered stick inside the pile area', () => {
    for (const layoutName of ['landscape', 'portrait']) {
      const layout = LAYOUTS[layoutName];
      for (let seed = 1; seed <= 40; seed += 1) {
        const bundle = createBundle(createStickSet(seed), layout);
        const pile = createPile({ sticks: bundle, layout, difficulty: 'relaxed', seed });
        for (const s of pile) {
          const { a, b } = getStickEndpoints(s);
          expect(pointInRect(a, layout.pileArea)).toBe(true);
          expect(pointInRect(b, layout.pileArea)).toBe(true);
        }
      }
    }
  });

  it('is reproducible from a seed', () => {
    const layout = LAYOUTS.landscape;
    const bundle = createBundle(createStickSet(9), layout);
    const a = createPile({ sticks: bundle, layout, difficulty: 'traditional', seed: 42 });
    const b = createPile({ sticks: bundle, layout, difficulty: 'traditional', seed: 42 });
    expect(a).toEqual(b);
  });

  it('treats a pile with a small stick on the large stick as valid', () => {
    const game = withValidatingPile(createGame({ seed: 1 }), true);
    expect(checkPileValidity(game.sticks).valid).toBe(true);
    expect(checkPileValidity(withValidatingPile(game, false).sticks).valid).toBe(false);
  });
});

describe('drop and foul-retry flow', () => {
  it('moves bundling -> dropping -> validating-pile -> playing for a valid pile', () => {
    let state = run(createGame({ seed: 1 }), { type: ACTIONS.DROP_STICKS, seed: 2 });
    expect(state.phase).toBe('dropping');
    expect(state.dropAttempts).toBe(1);
    state = gameReducer(state, { type: ACTIONS.DROP_SETTLED });
    expect(state.phase).toBe('validating-pile');
    state = gameReducer(withValidatingPile(state, true), { type: ACTIONS.PILE_VALIDATED });
    expect(state.phase).toBe('playing');
  });

  it('allows exactly one retry after a foul drop, then fails setup', () => {
    let state = run(createGame({ seed: 1 }), { type: ACTIONS.DROP_STICKS, seed: 2 }, { type: ACTIONS.DROP_SETTLED });
    state = gameReducer(withValidatingPile(state, false), { type: ACTIONS.PILE_VALIDATED });
    expect(state.phase).toBe('foul-retry');
    expect(state.setupFoulCount).toBe(1);

    // Drop is unavailable until the retry is taken.
    expect(gameReducer(state, { type: ACTIONS.DROP_STICKS, seed: 3 })).toBe(state);

    state = gameReducer(state, { type: ACTIONS.RETRY_DROP });
    expect(state.phase).toBe('bundling');
    state = run(state, { type: ACTIONS.DROP_STICKS, seed: 3 }, { type: ACTIONS.DROP_SETTLED });
    expect(state.dropAttempts).toBe(2);
    state = gameReducer(withValidatingPile(state, false), { type: ACTIONS.PILE_VALIDATED });
    expect(state.phase).toBe('setup-failed');

    // No further retries or drops.
    expect(gameReducer(state, { type: ACTIONS.RETRY_DROP })).toBe(state);
    expect(gameReducer(state, { type: ACTIONS.DROP_STICKS, seed: 4 })).toBe(state);
  });

  it('blocks picking while the pile is dropping or being validated', () => {
    const dropping = run(createGame({ seed: 1 }), { type: ACTIONS.DROP_STICKS, seed: 2 });
    expect(gameReducer(dropping, { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001' })).toBe(dropping);
    const validating = gameReducer(dropping, { type: ACTIONS.DROP_SETTLED });
    expect(gameReducer(validating, { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001' })).toBe(validating);
  });
});

describe('picking moves', () => {
  it('a small-stick removal adds exactly 10 points and removes exactly one stick', () => {
    const state = startPlaying();
    const next = pick(state, 'stick-001');
    expect(next.stats.score).toBe(STICK_POINTS.small);
    expect(next.stats.smallSticksCollected).toBe(1);
    expect(next.sticks.filter((s) => s.removed).map((s) => s.id)).toEqual(['stick-001']);
    expect(next.selectedStickId).toBeNull();
  });

  it('a large-stick removal adds exactly 100 points', () => {
    const next = pick(startPlaying(), 'stick-large');
    expect(next.stats.score).toBe(100);
    expect(next.stats.largeStickCollected).toBe(true);
  });

  it('a picking foul adds no points, keeps the stick and increments fouls', () => {
    const state = startPlaying();
    const next = foul(state, 'stick-002');
    expect(next.stats.score).toBe(0);
    expect(next.stats.failedAttempts).toBe(1);
    expect(next.stats.currentStreak).toBe(0);
    expect(next.sticks.find((s) => s.id === 'stick-002')).toEqual(state.sticks.find((s) => s.id === 'stick-002'));
    expect(next.phase).toBe('playing');
    expect(next.lastMove.disturbedStickIds).toEqual(['x']);
  });

  it('cannot resolve the same move twice', () => {
    const once = pick(startPlaying(), 'stick-001');
    const twice = gameReducer(once, { type: ACTIONS.MOVE_SUCCEEDED, stickId: 'stick-001' });
    expect(twice).toBe(once);
  });

  it('removing the final stick completes the round with 200 points', () => {
    let state = startPlaying();
    for (const s of state.sticks) state = pick(state, s.id);
    expect(state.phase).toBe('complete');
    expect(state.stats.score).toBe(MAX_SCORE);
    expect(getRoundSummary(state).totalScore).toBe(200);
    expect(getRoundSummary(state).allSticksCollected).toBe(true);
    expect(state.endedEarly).toBe(false);
  });

  it('tracks clean streaks', () => {
    let state = startPlaying();
    state = pick(state, 'stick-001');
    state = pick(state, 'stick-002');
    state = foul(state, 'stick-003');
    state = pick(state, 'stick-003');
    expect(state.stats.currentStreak).toBe(1);
    expect(state.stats.bestStreak).toBe(2);
  });

  it('can end the round on a picking foul when the strict rule is enabled', () => {
    const state = foul(startPlaying({ foulEndsRound: true }), 'stick-001');
    expect(state.phase).toBe('complete');
    expect(state.endedEarly).toBe(true);
  });

  it('accuracy is zero before any attempts and correct afterwards', () => {
    let state = startPlaying();
    expect(getRoundSummary(state).accuracy).toBe(0);
    state = pick(state, 'stick-001');
    state = foul(state, 'stick-002');
    state = pick(state, 'stick-002');
    state = pick(state, 'stick-003');
    expect(getRoundSummary(state).accuracy).toBeCloseTo(0.75);
  });
});

describe('pause, cancel and restart', () => {
  it('pausing prevents new moves and resuming allows them again', () => {
    const paused = gameReducer(startPlaying(), { type: ACTIONS.PAUSE_GAME });
    expect(paused.paused).toBe(true);
    expect(gameReducer(paused, { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001' })).toBe(paused);
    const resumed = gameReducer(paused, { type: ACTIONS.RESUME_GAME });
    expect(gameReducer(resumed, { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001' }).selectedStickId).toBe('stick-001');
  });

  it('pausing mid-drag clears the selection without resolving the move', () => {
    const dragging = gameReducer(startPlaying(), { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001' });
    const paused = gameReducer(dragging, { type: ACTIONS.PAUSE_GAME });
    expect(paused.selectedStickId).toBeNull();
    expect(gameReducer(paused, { type: ACTIONS.MOVE_SUCCEEDED, stickId: 'stick-001' })).toBe(paused);
  });

  it('pointer cancellation clears drag state safely', () => {
    const dragging = gameReducer(startPlaying(), { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001' });
    const cancelled = gameReducer(dragging, { type: ACTIONS.CANCEL_DRAG });
    expect(cancelled.selectedStickId).toBeNull();
    expect(cancelled.stats).toEqual(dragging.stats);
    // A late resolution after the cancel is ignored.
    expect(gameReducer(cancelled, { type: ACTIONS.MOVE_FAILED, stickId: 'stick-001' })).toBe(cancelled);
  });

  it('restart resets all stats and generates a fresh pile', () => {
    let state = startPlaying();
    state = foul(pick(state, 'stick-001'), 'stick-002');
    const restarted = gameReducer(state, { type: ACTIONS.NEW_GAME, difficulty: 'traditional', seed: 99 });
    expect(restarted.phase).toBe('bundling');
    expect(restarted.stats).toEqual(createGame().stats);
    expect(restarted.dropAttempts).toBe(0);
    expect(restarted.sticks.every((s) => !s.removed)).toBe(true);
    const dropped = gameReducer(restarted, { type: ACTIONS.DROP_STICKS, seed: 1234 });
    expect(dropped.sticks.map((s) => [s.x, s.y])).not.toEqual(state.sticks.map((s) => [s.x, s.y]));
  });
});
