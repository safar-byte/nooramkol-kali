import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '../game/constants.js';
import { ACTIONS, createGame } from '../game/gameReducer.js';
import { rectCenter } from '../game/geometry.js';
import { resolvePick } from '../game/resolvePick.js';

const VERTICAL = Math.PI / 2;
const tray = rectCenter(LAYOUTS.landscape.tray);

/** A hand-placed landscape game: "picked" at (200,300), an obstacle at (400,300). */
function game({ removed = false } = {}) {
  const base = createGame({ seed: 1, layout: 'landscape' });
  const place = { 'stick-001': [200, 300, VERTICAL], 'stick-002': [400, 300, VERTICAL] };
  return {
    ...base,
    phase: 'playing',
    sticks: base.sticks.map((s, i) => {
      if (place[s.id]) {
        const [x, y, angle] = place[s.id];
        return { ...s, x, y, angle, removed: s.id === 'stick-001' && removed };
      }
      return { ...s, x: 60 + i * 12, y: 80, angle: VERTICAL };
    }),
  };
}

describe('resolvePick', () => {
  it('accepts a clean path that ends in the tray', () => {
    // Go over the top of the obstacle, then down into the tray.
    const path = [{ x: 200, y: 40 }, { x: tray.x, y: 40 }, tray];
    expect(resolvePick(game(), { stickId: 'stick-001', path })).toEqual({
      type: ACTIONS.MOVE_SUCCEEDED,
      stickId: 'stick-001',
    });
  });

  it('turns a path through another stick into a foul', () => {
    const result = resolvePick(game(), { stickId: 'stick-001', path: [{ x: 600, y: 300 }, tray] });
    expect(result.type).toBe(ACTIONS.MOVE_FAILED);
    expect(result.disturbedStickIds).toEqual(['stick-002']);
  });

  it('cancels a clean path that does not reach the tray', () => {
    expect(resolvePick(game(), { stickId: 'stick-001', path: [{ x: 250, y: 400 }] })).toEqual({
      type: ACTIONS.CANCEL_DRAG,
    });
  });

  it('rejects removed or unknown sticks and empty paths', () => {
    expect(resolvePick(game({ removed: true }), { stickId: 'stick-001', path: [tray] }).type).toBe(
      ACTIONS.CANCEL_DRAG,
    );
    expect(resolvePick(game(), { stickId: 'nope', path: [tray] }).type).toBe(ACTIONS.CANCEL_DRAG);
    expect(resolvePick(game(), { stickId: 'stick-001', path: [] }).type).toBe(ACTIONS.CANCEL_DRAG);
  });
});
