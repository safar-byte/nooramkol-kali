// Two-player match layer on top of the single-player game reducer.
//
// Both players pick from one shared pile. A clean pick scores for the current
// player and they keep the turn; a foul passes the turn to the other player.
// Pure and deterministic, so the host can run it authoritatively and the guest
// can run it optimistically with identical results.

import { ACTIONS, createGame, gameReducer } from './gameReducer.js';

export const MATCH_ACTIONS = {
  REMATCH: 'REMATCH',
};

/** Actions only the player whose turn it is may send. */
const TURN_ACTIONS = new Set([
  ACTIONS.DROP_STICKS,
  ACTIONS.RETRY_DROP,
  ACTIONS.BEGIN_DRAG,
  ACTIONS.CANCEL_DRAG,
  ACTIONS.MOVE_SUCCEEDED,
  ACTIONS.MOVE_FAILED,
]);

/** System actions driven by the host's timers. */
const HOST_ACTIONS = new Set([ACTIONS.DROP_SETTLED, ACTIONS.PILE_VALIDATED]);

/** Either player may pause or resume. */
const SHARED_ACTIONS = new Set([ACTIONS.PAUSE_GAME, ACTIONS.RESUME_GAME]);

function emptyPlayerStats() {
  return {
    score: 0,
    smallSticksCollected: 0,
    largeStickCollected: false,
    successfulMoves: 0,
    failedAttempts: 0,
    currentStreak: 0,
    bestStreak: 0,
  };
}

export function createMatch({
  players,
  hostId,
  difficulty = 'traditional',
  layout = 'landscape',
  seed = 1,
  starterIndex = 0,
  round = 1,
  now = 0,
}) {
  return {
    round,
    hostId,
    starterIndex,
    currentPlayerIndex: starterIndex,
    players: players.map(({ id, name }) => ({ id, name, stats: emptyPlayerStats() })),
    game: createGame({ difficulty, layout, seed, now, foulEndsRound: false }),
    lastEvent: null,
    eventSeq: 0,
  };
}

function creditPick(stats, lastMove) {
  const currentStreak = stats.currentStreak + 1;
  return {
    ...stats,
    score: stats.score + lastMove.points,
    smallSticksCollected: stats.smallSticksCollected + (lastMove.type === 'small' ? 1 : 0),
    largeStickCollected: stats.largeStickCollected || lastMove.type === 'large',
    successfulMoves: stats.successfulMoves + 1,
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
  };
}

function creditFoul(stats) {
  return { ...stats, failedAttempts: stats.failedAttempts + 1, currentStreak: 0 };
}

/**
 * @param {object} match
 * @param {{action: object, playerId: string}} envelope
 */
export function matchReducer(match, { action, playerId }) {
  if (!match || !action) return match;
  const playerIndex = match.players.findIndex((p) => p.id === playerId);
  if (playerIndex < 0) return match;
  const isHost = playerId === match.hostId;

  if (action.type === MATCH_ACTIONS.REMATCH) {
    if (!isHost) return match;
    return createMatch({
      players: match.players,
      hostId: match.hostId,
      difficulty: action.difficulty ?? match.game.difficulty,
      layout: match.game.layout,
      seed: action.seed,
      starterIndex: (match.starterIndex + 1) % match.players.length,
      round: match.round + 1,
      now: action.now ?? 0,
    });
  }

  if (TURN_ACTIONS.has(action.type)) {
    if (playerIndex !== match.currentPlayerIndex) return match;
  } else if (HOST_ACTIONS.has(action.type)) {
    if (!isHost) return match;
  } else if (!SHARED_ACTIONS.has(action.type)) {
    return match;
  }

  const game = gameReducer(match.game, action);
  if (game === match.game) return match;

  const before = match.game.stats;
  const after = game.stats;
  const current = match.currentPlayerIndex;
  let { players, currentPlayerIndex, lastEvent, eventSeq } = match;

  if (after.successfulMoves > before.successfulMoves) {
    players = players.map((p, i) => (i === current ? { ...p, stats: creditPick(p.stats, game.lastMove) } : p));
    eventSeq += 1;
    lastEvent = {
      seq: eventSeq,
      type: 'pick',
      playerId: players[current].id,
      stickType: game.lastMove.type,
      points: game.lastMove.points,
    };
  } else if (after.failedAttempts > before.failedAttempts) {
    players = players.map((p, i) => (i === current ? { ...p, stats: creditFoul(p.stats) } : p));
    currentPlayerIndex = (current + 1) % players.length;
    eventSeq += 1;
    lastEvent = {
      seq: eventSeq,
      type: 'foul',
      playerId: players[current].id,
      nextPlayerId: players[currentPlayerIndex].id,
      reason: game.lastMove.reason,
      disturbedStickIds: game.lastMove.disturbedStickIds,
    };
  }

  return { ...match, game, players, currentPlayerIndex, lastEvent, eventSeq };
}

/**
 * Client-side prediction: rebuild the guest's view by re-applying its
 * not-yet-acknowledged actions on top of the host's latest snapshot.
 */
export function applyPending(snapshot, pending, playerId) {
  return pending.reduce((match, { action }) => matchReducer(match, { action, playerId }), snapshot);
}

export function getMatchSummary(match) {
  const complete = match.game.phase === 'complete';
  const top = Math.max(...match.players.map((p) => p.stats.score));
  const leaders = match.players.filter((p) => p.stats.score === top);
  return {
    complete,
    currentPlayer: match.players[match.currentPlayerIndex],
    isTie: complete && leaders.length > 1,
    winnerId: complete && leaders.length === 1 ? leaders[0].id : null,
  };
}
