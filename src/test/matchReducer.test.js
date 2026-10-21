import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../game/gameReducer.js';
import { applyPending, createMatch, getMatchSummary, MATCH_ACTIONS, matchReducer } from '../game/matchReducer.js';

const PLAYERS = [
  { id: 'host', name: 'Asha' },
  { id: 'guest', name: 'Biju' },
];

const send = (match, playerId, action) => matchReducer(match, { playerId, action });

/** A match in the playing phase, with the host to move first. */
function playingMatch(starterIndex = 0) {
  for (let seed = 1; seed < 500; seed += 1) {
    let match = createMatch({ players: PLAYERS, hostId: 'host', seed: 3, starterIndex });
    const starter = PLAYERS[starterIndex].id;
    match = send(match, starter, { type: ACTIONS.DROP_STICKS, seed });
    match = send(match, 'host', { type: ACTIONS.DROP_SETTLED });
    match = send(match, 'host', { type: ACTIONS.PILE_VALIDATED });
    if (match.game.phase === 'playing') return match;
  }
  throw new Error('no valid pile found');
}

const pick = (match, playerId, stickId) =>
  send(send(match, playerId, { type: ACTIONS.BEGIN_DRAG, stickId }), playerId, {
    type: ACTIONS.MOVE_SUCCEEDED,
    stickId,
  });

const foul = (match, playerId, stickId) =>
  send(send(match, playerId, { type: ACTIONS.BEGIN_DRAG, stickId }), playerId, {
    type: ACTIONS.MOVE_FAILED,
    stickId,
    reason: 'disturbed-other-stick',
    disturbedStickIds: ['stick-009'],
  });

describe('matchReducer', () => {
  it('starts with the starter to move and empty per-player stats', () => {
    const match = createMatch({ players: PLAYERS, hostId: 'host', seed: 1 });
    expect(match.currentPlayerIndex).toBe(0);
    expect(match.players.map((p) => p.stats.score)).toEqual([0, 0]);
    expect(match.game.rules.foulEndsRound).toBe(false);
  });

  it('a clean pick credits the current player and keeps the turn', () => {
    const next = pick(playingMatch(), 'host', 'stick-001');
    expect(next.players[0].stats.score).toBe(10);
    expect(next.players[1].stats.score).toBe(0);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.lastEvent).toMatchObject({ type: 'pick', playerId: 'host', points: 10 });
  });

  it('a foul passes the turn and leaves the stick in the pile', () => {
    const match = playingMatch();
    const next = foul(match, 'host', 'stick-001');
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.players[0].stats.failedAttempts).toBe(1);
    expect(next.game.sticks.find((s) => s.id === 'stick-001').removed).toBe(false);
    expect(next.lastEvent).toMatchObject({
      type: 'foul',
      playerId: 'host',
      nextPlayerId: 'guest',
      disturbedStickIds: ['stick-009'],
    });
    // The guest can now move; the host cannot.
    expect(send(next, 'host', { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-002' })).toBe(next);
    expect(pick(next, 'guest', 'stick-002').players[1].stats.score).toBe(10);
  });

  it('ignores turn actions from the player who is not on turn', () => {
    const match = playingMatch();
    expect(send(match, 'guest', { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001' })).toBe(match);
    const fresh = createMatch({ players: PLAYERS, hostId: 'host', seed: 1 });
    expect(send(fresh, 'guest', { type: ACTIONS.DROP_STICKS, seed: 5 })).toBe(fresh);
  });

  it('ignores unknown players and unknown actions', () => {
    const match = playingMatch();
    expect(send(match, 'intruder', { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001' })).toBe(match);
    expect(send(match, 'host', { type: ACTIONS.NEW_GAME })).toBe(match);
  });

  it('only the host may send timer-driven setup actions', () => {
    let match = createMatch({ players: PLAYERS, hostId: 'host', seed: 1, starterIndex: 1 });
    match = send(match, 'guest', { type: ACTIONS.DROP_STICKS, seed: 7 });
    expect(match.game.phase).toBe('dropping');
    expect(send(match, 'guest', { type: ACTIONS.DROP_SETTLED })).toBe(match);
    expect(send(match, 'host', { type: ACTIONS.DROP_SETTLED }).game.phase).toBe('validating-pile');
  });

  it('either player may pause and resume', () => {
    const paused = send(playingMatch(), 'guest', { type: ACTIONS.PAUSE_GAME });
    expect(paused.game.paused).toBe(true);
    expect(send(paused, 'host', { type: ACTIONS.RESUME_GAME }).game.paused).toBe(false);
  });

  it('keeps the setup foul/retry rule for the player who drops', () => {
    let match = createMatch({ players: PLAYERS, hostId: 'host', seed: 1 });
    match = send(match, 'host', { type: ACTIONS.DROP_STICKS, seed: 2 });
    match = send(match, 'host', { type: ACTIONS.DROP_SETTLED });
    // Force an invalid pile: move the large stick far from every small stick.
    match = {
      ...match,
      game: {
        ...match.game,
        sticks: match.game.sticks.map((s) => (s.type === 'large' ? { ...s, x: -500, y: -500 } : s)),
      },
    };
    match = send(match, 'host', { type: ACTIONS.PILE_VALIDATED });
    expect(match.game.phase).toBe('foul-retry');
    expect(match.currentPlayerIndex).toBe(0);
    expect(send(match, 'guest', { type: ACTIONS.RETRY_DROP })).toBe(match);
    expect(send(match, 'host', { type: ACTIONS.RETRY_DROP }).game.phase).toBe('bundling');
  });

  it('declares the higher score the winner when the pile is cleared', () => {
    let match = playingMatch();
    const ids = match.game.sticks.map((s) => s.id);
    // Host takes the large stick, fouls, then the guest clears the rest.
    match = pick(match, 'host', 'stick-large');
    match = foul(match, 'host', ids[1]);
    for (const id of ids.slice(1)) match = pick(match, 'guest', id);
    const summary = getMatchSummary(match);
    expect(summary.complete).toBe(true);
    expect(match.players[0].stats.score).toBe(100);
    expect(match.players[1].stats.score).toBe(100);
    expect(summary.isTie).toBe(true);
    expect(summary.winnerId).toBeNull();
    expect(match.players[0].stats.score + match.players[1].stats.score).toBe(match.game.stats.score);
  });

  it('reports a single winner', () => {
    let match = playingMatch();
    for (const s of match.game.sticks) match = pick(match, 'host', s.id);
    const summary = getMatchSummary(match);
    expect(summary.winnerId).toBe('host');
    expect(summary.isTie).toBe(false);
  });

  it('re-applies unacknowledged guest actions on top of an older host snapshot', () => {
    const afterFoul = foul(playingMatch(), 'host', 'stick-001');
    // The host has seen the guest's BEGIN_DRAG but not yet its MOVE_SUCCEEDED.
    const hostSnapshot = send(afterFoul, 'guest', { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-002' });
    const pending = [{ seq: 2, action: { type: ACTIONS.MOVE_SUCCEEDED, stickId: 'stick-002' } }];
    const predicted = applyPending(hostSnapshot, pending, 'guest');
    expect(predicted.players[1].stats.score).toBe(10);
    expect(predicted.game.sticks.find((s) => s.id === 'stick-002').removed).toBe(true);
    expect(predicted.lastEvent).toMatchObject({ type: 'pick', playerId: 'guest' });
    expect(applyPending(hostSnapshot, [], 'guest')).toBe(hostSnapshot);
  });

  it('rematch is host-only, alternates the starter and resets scores', () => {
    const played = pick(playingMatch(), 'host', 'stick-001');
    expect(send(played, 'guest', { type: MATCH_ACTIONS.REMATCH, seed: 9 })).toBe(played);
    const rematch = send(played, 'host', { type: MATCH_ACTIONS.REMATCH, seed: 9 });
    expect(rematch.round).toBe(2);
    expect(rematch.starterIndex).toBe(1);
    expect(rematch.currentPlayerIndex).toBe(1);
    expect(rematch.players.map((p) => p.stats.score)).toEqual([0, 0]);
    expect(rematch.players.map((p) => p.name)).toEqual(['Asha', 'Biju']);
    expect(rematch.game.phase).toBe('bundling');
  });
});
