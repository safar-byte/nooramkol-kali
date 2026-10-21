// Authoritative outcome of a pick from its drag path. The host uses this to
// re-check every remote pick instead of trusting the other player's claim.

import { DIFFICULTIES, LAYOUTS } from './constants.js';
import { ACTIONS } from './gameReducer.js';
import { pointInRect } from './geometry.js';
import { validateMove } from './validateMove.js';

/**
 * @param {object} game  Current game state (pre-move pile).
 * @param {{stickId: string, path: Array<{x:number,y:number}>}} pick
 * @returns {object} A MOVE_SUCCEEDED, MOVE_FAILED or CANCEL_DRAG action.
 */
export function resolvePick(game, { stickId, path }) {
  const stick = game.sticks.find((s) => s.id === stickId);
  if (!stick || stick.removed || !Array.isArray(path) || path.length === 0) {
    return { type: ACTIONS.CANCEL_DRAG };
  }
  const config = DIFFICULTIES[game.difficulty];
  const result = validateMove({
    sticks: game.sticks,
    stickId,
    path,
    contactMargin: config.contactMargin,
    liftTolerance: config.liftTolerance,
  });
  if (!result.valid) {
    return {
      type: ACTIONS.MOVE_FAILED,
      stickId,
      reason: result.reason,
      disturbedStickIds: result.disturbedStickIds,
    };
  }
  if (pointInRect(path[path.length - 1], LAYOUTS[game.layout].tray)) {
    return { type: ACTIONS.MOVE_SUCCEEDED, stickId };
  }
  return { type: ACTIONS.CANCEL_DRAG };
}
