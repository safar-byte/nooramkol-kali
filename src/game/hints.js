import { DIFFICULTIES } from './constants.js';
import { clamp, rectCenter } from './geometry.js';
import { findBlockers, validateMove } from './validateMove.js';

/** A few simple routes to the tray: straight, or out over the top/bottom edge first. */
export function candidatePaths(stick, layout) {
  const target = rectCenter(layout.tray);
  const topY = 12;
  const bottomY = layout.height - 12;
  const sideX = clamp(stick.x, 12, layout.width - 12);
  return [
    [target],
    [{ x: sideX, y: topY }, { x: target.x, y: topY }, target],
    [{ x: sideX, y: bottomY }, { x: target.x, y: bottomY }, target],
  ];
}

/**
 * Find a stick that can be removed cleanly along one of the candidate paths.
 * Searches from the top of the pile down. Returns `{ stickId, path }` or null.
 */
export function findHint(sticks, layout, difficulty) {
  const config = DIFFICULTIES[difficulty];
  for (let i = sticks.length - 1; i >= 0; i -= 1) {
    const stick = sticks[i];
    if (stick.removed) continue;
    if (findBlockers(sticks, stick.id).length > 0) continue;
    for (const path of candidatePaths(stick, layout)) {
      const result = validateMove({
        sticks,
        stickId: stick.id,
        path,
        contactMargin: config.contactMargin,
        liftTolerance: config.liftTolerance,
        stepSize: 3,
      });
      if (result.valid) return { stickId: stick.id, path: [{ x: stick.x, y: stick.y }, ...path] };
    }
  }
  return null;
}

export function hasPlayableMove(sticks, layout, difficulty) {
  return findHint(sticks, layout, difficulty) !== null;
}
