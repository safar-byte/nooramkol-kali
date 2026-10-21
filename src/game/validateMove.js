// Deterministic disturbance detection (controlled disturbance model).
//
// Other sticks never move in this prototype. A move is judged by sweeping the
// selected stick along its drag path and checking for *new* contact:
//
// 1. Sticks resting on top of the selected stick (higher in the pile and
//    overlapping it) are disturbed as soon as the selected stick moves more
//    than `liftTolerance`. Pull those off first.
// 2. Sticks the selected stick already touches (e.g. a stick it is lying on)
//    are ignored while that contact is continuous. Once the selected stick
//    separates from them, touching them again counts as a disturbance.
// 3. Any other stick touched along the path is disturbed.
//
// Existing overlap therefore never fails a move by itself; only movement does.

import { distance, samplePath, sticksTouch } from './geometry.js';

export const MOVE_FAILURE = {
  disturbed: 'disturbed-other-stick',
  liftedFromUnder: 'lifted-from-under',
  invalidStick: 'invalid-stick',
};

/** IDs of active sticks that lie on top of (and overlap) the given stick. */
export function findBlockers(sticks, stickId) {
  const index = sticks.findIndex((s) => s.id === stickId);
  if (index < 0) return [];
  const selected = sticks[index];
  return sticks
    .filter((s, i) => i > index && !s.removed && sticksTouch(selected, s, 0))
    .map((s) => s.id);
}

const VALID = Object.freeze({ valid: true, reason: null, disturbedStickIds: [] });

/**
 * Incremental validator for a drag in progress. `advance(point)` sweeps the
 * stick from its last position to `point` and returns a failure result, or
 * null while the move is still clean. Once failed, it stays failed.
 */
export function createMoveValidator({ sticks, stickId, contactMargin = 1, liftTolerance = 2, stepSize = 1.5 }) {
  const index = sticks.findIndex((s) => s.id === stickId);
  if (index < 0 || sticks[index].removed) {
    const failure = { valid: false, reason: MOVE_FAILURE.invalidStick, disturbedStickIds: [] };
    return { blockers: [], advance: () => failure, get failure() { return failure; } };
  }

  const selected = sticks[index];
  const origin = { x: selected.x, y: selected.y };
  const blockers = findBlockers(sticks, stickId);
  const blockerSet = new Set(blockers);
  const others = sticks.filter((s, i) => i !== index && !s.removed && !blockerSet.has(s.id));
  const continuousContacts = new Set(
    others.filter((s) => sticksTouch(selected, s, contactMargin)).map((s) => s.id),
  );
  let last = origin;
  let failure = null;

  function check(point) {
    if (blockers.length > 0 && distance(point, origin) > liftTolerance) {
      return { valid: false, reason: MOVE_FAILURE.liftedFromUnder, disturbedStickIds: blockers, contactPoint: point };
    }
    const moved = { ...selected, x: point.x, y: point.y };
    const disturbed = [];
    for (const other of others) {
      const touching = sticksTouch(moved, other, contactMargin);
      if (continuousContacts.has(other.id)) {
        if (!touching) continuousContacts.delete(other.id);
      } else if (touching) {
        disturbed.push(other.id);
      }
    }
    if (disturbed.length > 0) {
      return { valid: false, reason: MOVE_FAILURE.disturbed, disturbedStickIds: disturbed, contactPoint: point };
    }
    return null;
  }

  return {
    blockers,
    advance(point) {
      if (failure) return failure;
      for (const sample of samplePath([last, point], stepSize).slice(1)) {
        failure = check(sample);
        if (failure) return failure;
      }
      last = { x: point.x, y: point.y };
      return null;
    },
    get failure() {
      return failure;
    },
  };
}

/**
 * Validate a complete drag.
 * @param {object} args
 * @param {Array} args.sticks       Pre-move pile snapshot (array order = bottom to top).
 * @param {string} args.stickId     The stick being moved.
 * @param {Array<{x:number,y:number}>} args.path  Successive centre positions of the dragged stick.
 * @param {number} [args.contactMargin]
 * @param {number} [args.liftTolerance]
 * @param {number} [args.stepSize]  Max distance between swept samples (board units).
 * @returns {{valid: boolean, reason: string|null, disturbedStickIds: string[], contactPoint?: {x:number,y:number}}}
 */
export function validateMove({ path, ...options }) {
  const validator = createMoveValidator(options);
  if (validator.failure) return validator.failure;
  for (const point of path) {
    const failure = validator.advance(point);
    if (failure) return failure;
  }
  return { ...VALID, disturbedStickIds: [] };
}
