import { distancePointToSegment, getStickEndpoints } from './geometry.js';

/** Convert client (CSS pixel) coordinates to logical board coordinates. */
export function toBoardPoint(clientX, clientY, rect, boardWidth, boardHeight) {
  return {
    x: ((clientX - rect.left) * boardWidth) / rect.width,
    y: ((clientY - rect.top) * boardHeight) / rect.height,
  };
}

/** All active sticks within `hitRadius` of the point, topmost first. */
export function findSticksAtPoint(sticks, point, hitRadius) {
  const hits = [];
  for (let i = sticks.length - 1; i >= 0; i -= 1) {
    const stick = sticks[i];
    if (stick.removed) continue;
    const { a, b } = getStickEndpoints(stick);
    if (distancePointToSegment(point, a, b) <= hitRadius) hits.push(stick);
  }
  return hits;
}

/** The visually topmost selectable stick under the point, or null. */
export function hitTest(sticks, point, hitRadius) {
  return findSticksAtPoint(sticks, point, hitRadius)[0] ?? null;
}
