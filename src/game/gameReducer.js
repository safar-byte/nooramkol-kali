// Game state and transitions. Pure: no DOM, timers or randomness. Randomness
// enters only through seeds carried on actions, so every transition is
// reproducible (and reusable by a future multiplayer server).

import { LAYOUTS, MAX_DROP_ATTEMPTS, STICK_POINTS } from './constants.js';
import { checkPileValidity, createBundle, createPile, createStickSet } from './createPile.js';

export const ACTIONS = {
  NEW_GAME: 'NEW_GAME',
  DROP_STICKS: 'DROP_STICKS',
  DROP_SETTLED: 'DROP_SETTLED',
  PILE_VALIDATED: 'PILE_VALIDATED',
  RETRY_DROP: 'RETRY_DROP',
  BEGIN_DRAG: 'BEGIN_DRAG',
  CANCEL_DRAG: 'CANCEL_DRAG',
  MOVE_SUCCEEDED: 'MOVE_SUCCEEDED',
  MOVE_FAILED: 'MOVE_FAILED',
  PAUSE_GAME: 'PAUSE_GAME',
  RESUME_GAME: 'RESUME_GAME',
};

const PAUSABLE_PHASES = new Set(['bundling', 'foul-retry', 'playing']);

function emptyStats() {
  return {
    score: 0,
    smallSticksCollected: 0,
    largeStickCollected: false,
    successfulMoves: 0,
    failedAttempts: 0,
    dropAttempts: 0,
    currentStreak: 0,
    bestStreak: 0,
  };
}

export function createGame({
  difficulty = 'traditional',
  layout = 'landscape',
  seed = 1,
  now = 0,
  foulEndsRound = false,
} = {}) {
  return {
    difficulty,
    layout,
    seed,
    sticks: createBundle(createStickSet(seed), LAYOUTS[layout]),
    dropFrom: null,
    selectedStickId: null,
    phase: 'bundling',
    paused: false,
    dropAttempts: 0,
    setupFoulCount: 0,
    pileCheck: null,
    stats: emptyStats(),
    startedAt: now,
    endedAt: null,
    endedEarly: false,
    lastMoveResult: null,
    lastMove: null,
    rules: { foulEndsRound },
  };
}

function canResolveMove(state, stickId) {
  if (state.phase !== 'playing' || state.paused) return false;
  if (!stickId || state.selectedStickId !== stickId) return false;
  const stick = state.sticks.find((s) => s.id === stickId);
  return Boolean(stick && !stick.removed);
}

export function gameReducer(state, action) {
  switch (action.type) {
    case ACTIONS.NEW_GAME:
      return createGame(action);

    case ACTIONS.DROP_STICKS: {
      if (state.phase !== 'bundling' || state.paused || state.dropAttempts >= MAX_DROP_ATTEMPTS) {
        return state;
      }
      const dropAttempts = state.dropAttempts + 1;
      return {
        ...state,
        phase: 'dropping',
        dropAttempts,
        dropFrom: state.sticks,
        sticks: createPile({
          sticks: state.sticks,
          layout: LAYOUTS[state.layout],
          difficulty: state.difficulty,
          seed: action.seed,
        }),
        pileCheck: null,
        stats: { ...state.stats, dropAttempts },
      };
    }

    case ACTIONS.DROP_SETTLED:
      if (state.phase !== 'dropping') return state;
      return { ...state, phase: 'validating-pile', dropFrom: null };

    case ACTIONS.PILE_VALIDATED: {
      if (state.phase !== 'validating-pile') return state;
      const pileCheck = checkPileValidity(state.sticks);
      if (pileCheck.valid) return { ...state, phase: 'playing', pileCheck };
      const setupFoulCount = state.setupFoulCount + 1;
      const retryAvailable = state.dropAttempts < MAX_DROP_ATTEMPTS;
      return {
        ...state,
        phase: retryAvailable ? 'foul-retry' : 'setup-failed',
        setupFoulCount,
        pileCheck,
        endedAt: retryAvailable ? null : action.now ?? state.startedAt,
      };
    }

    case ACTIONS.RETRY_DROP:
      if (state.phase !== 'foul-retry' || state.paused) return state;
      return {
        ...state,
        phase: 'bundling',
        sticks: createBundle(state.sticks, LAYOUTS[state.layout]),
        pileCheck: null,
      };

    case ACTIONS.BEGIN_DRAG: {
      if (state.phase !== 'playing' || state.paused || state.selectedStickId !== null) return state;
      const stick = state.sticks.find((s) => s.id === action.stickId);
      if (!stick || stick.removed) return state;
      return { ...state, selectedStickId: stick.id };
    }

    case ACTIONS.CANCEL_DRAG:
      if (state.selectedStickId === null) return state;
      return { ...state, selectedStickId: null };

    case ACTIONS.MOVE_SUCCEEDED: {
      if (!canResolveMove(state, action.stickId)) return state;
      const stick = state.sticks.find((s) => s.id === action.stickId);
      const points = STICK_POINTS[stick.type];
      const sticks = state.sticks.map((s) =>
        s.id === stick.id ? { ...s, removed: true, removedOrder: state.stats.successfulMoves } : s,
      );
      const currentStreak = state.stats.currentStreak + 1;
      const stats = {
        ...state.stats,
        score: state.stats.score + points,
        smallSticksCollected: state.stats.smallSticksCollected + (stick.type === 'small' ? 1 : 0),
        largeStickCollected: state.stats.largeStickCollected || stick.type === 'large',
        successfulMoves: state.stats.successfulMoves + 1,
        currentStreak,
        bestStreak: Math.max(state.stats.bestStreak, currentStreak),
      };
      const complete = sticks.every((s) => s.removed);
      return {
        ...state,
        sticks,
        stats,
        selectedStickId: null,
        phase: complete ? 'complete' : 'playing',
        endedAt: complete ? action.now ?? state.startedAt : null,
        lastMoveResult: 'success',
        lastMove: { result: 'success', stickId: stick.id, type: stick.type, points },
      };
    }

    case ACTIONS.MOVE_FAILED: {
      if (!canResolveMove(state, action.stickId)) return state;
      const endsRound = state.rules.foulEndsRound;
      return {
        ...state,
        selectedStickId: null,
        phase: endsRound ? 'complete' : 'playing',
        endedEarly: endsRound,
        endedAt: endsRound ? action.now ?? state.startedAt : null,
        stats: { ...state.stats, failedAttempts: state.stats.failedAttempts + 1, currentStreak: 0 },
        lastMoveResult: 'failure',
        lastMove: {
          result: 'failure',
          stickId: action.stickId,
          reason: action.reason ?? 'disturbed-other-stick',
          disturbedStickIds: action.disturbedStickIds ?? [],
        },
      };
    }

    case ACTIONS.PAUSE_GAME:
      if (state.paused || !PAUSABLE_PHASES.has(state.phase)) return state;
      return { ...state, paused: true, selectedStickId: null };

    case ACTIONS.RESUME_GAME:
      if (!state.paused) return state;
      return { ...state, paused: false };

    default:
      return state;
  }
}

/** Values derived from the board rather than stored. */
export function getRoundSummary(state) {
  const { sticks, stats } = state;
  const remainingSmall = sticks.filter((s) => s.type === 'small' && !s.removed).length;
  const largeCollected = sticks.some((s) => s.type === 'large' && s.removed);
  const remainingLarge = largeCollected ? 0 : 1;
  const totalScore = sticks.filter((s) => s.removed).reduce((sum, s) => sum + STICK_POINTS[s.type], 0);
  const attempts = stats.successfulMoves + stats.failedAttempts;
  return {
    remainingSmall,
    remainingLarge,
    largeCollected,
    totalScore,
    allSticksCollected: remainingSmall === 0 && remainingLarge === 0,
    attempts,
    accuracy: attempts === 0 ? 0 : stats.successfulMoves / attempts,
  };
}
