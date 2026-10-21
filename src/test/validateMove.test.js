import { describe, expect, it } from 'vitest';
import { findBlockers, MOVE_FAILURE, validateMove } from '../game/validateMove.js';

const stick = (id, x, y, angle, overrides = {}) => ({
  id,
  type: 'small',
  x,
  y,
  angle,
  length: 100,
  width: 5,
  removed: false,
  ...overrides,
});

const VERTICAL = Math.PI / 2;

describe('validateMove', () => {
  it('succeeds when the drag passes through an empty gap', () => {
    const sticks = [stick('obstacle', 100, 300, 0), stick('picked', 100, 100, 0)];
    const result = validateMove({ sticks, stickId: 'picked', path: [{ x: 400, y: 100 }] });
    expect(result).toEqual({ valid: true, reason: null, disturbedStickIds: [] });
  });

  it('fails when the drag crosses another stick', () => {
    const sticks = [stick('obstacle', 260, 100, VERTICAL), stick('picked', 100, 100, 0)];
    const result = validateMove({ sticks, stickId: 'picked', path: [{ x: 400, y: 100 }] });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe(MOVE_FAILURE.disturbed);
    expect(result.disturbedStickIds).toEqual(['obstacle']);
    expect(result.contactPoint.x).toBeLessThan(400);
  });

  it('never reports the selected stick as disturbed', () => {
    const sticks = [stick('obstacle', 260, 100, VERTICAL), stick('picked', 100, 100, 0)];
    const result = validateMove({ sticks, stickId: 'picked', path: [{ x: 400, y: 100 }] });
    expect(result.disturbedStickIds).not.toContain('picked');
  });

  it('does not fail just because the selected stick already overlaps one below it', () => {
    // "picked" lies across "under" (higher z-order). Sliding it off upwards is fine.
    const sticks = [stick('under', 100, 100, VERTICAL), stick('picked', 100, 100, 0)];
    const result = validateMove({ sticks, stickId: 'picked', path: [{ x: 100, y: 20 }, { x: 100, y: -40 }] });
    expect(result.valid).toBe(true);
  });

  it('fails if the stick breaks contact and then touches the same stick again', () => {
    const sticks = [stick('under', 100, 100, VERTICAL), stick('picked', 100, 100, 0)];
    const result = validateMove({
      sticks,
      stickId: 'picked',
      path: [{ x: 100, y: 20 }, { x: 100, y: 120 }],
    });
    expect(result.valid).toBe(false);
    expect(result.disturbedStickIds).toEqual(['under']);
  });

  it('fails when a stick lying underneath another is pulled out', () => {
    const sticks = [stick('picked', 100, 100, 0), stick('on-top', 100, 100, VERTICAL)];
    expect(findBlockers(sticks, 'picked')).toEqual(['on-top']);
    const result = validateMove({ sticks, stickId: 'picked', path: [{ x: 100, y: 300 }], liftTolerance: 2 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe(MOVE_FAILURE.liftedFromUnder);
    expect(result.disturbedStickIds).toEqual(['on-top']);
  });

  it('allows a tiny nudge of a covered stick within the lift tolerance', () => {
    const sticks = [stick('picked', 100, 100, 0), stick('on-top', 100, 100, VERTICAL)];
    const result = validateMove({ sticks, stickId: 'picked', path: [{ x: 101, y: 100 }], liftTolerance: 2 });
    expect(result.valid).toBe(true);
  });

  it('cannot skip a thin obstacle with one fast pointer jump', () => {
    // A single huge step from x=100 to x=900 would jump over the obstacle if only
    // the endpoints were tested.
    const sticks = [stick('thin', 500, 100, VERTICAL, { width: 2 }), stick('picked', 100, 100, VERTICAL)];
    const result = validateMove({ sticks, stickId: 'picked', path: [{ x: 900, y: 100 }] });
    expect(result.valid).toBe(false);
    expect(result.disturbedStickIds).toEqual(['thin']);
  });

  it('ignores removed sticks', () => {
    const sticks = [stick('gone', 260, 100, VERTICAL, { removed: true }), stick('picked', 100, 100, 0)];
    expect(validateMove({ sticks, stickId: 'picked', path: [{ x: 400, y: 100 }] }).valid).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const sticks = [stick('obstacle', 260, 130, 0.7), stick('picked', 100, 100, 0.1)];
    const args = { sticks, stickId: 'picked', path: [{ x: 200, y: 160 }, { x: 420, y: 120 }] };
    expect(validateMove(args)).toEqual(validateMove(args));
  });

  it('respects the contact margin', () => {
    // Passing 7 units from an obstacle: gap after widths = 2.
    const sticks = [stick('obstacle', 300, 157, 0), stick('picked', 100, 100, VERTICAL)];
    const path = [{ x: 500, y: 100 }];
    expect(validateMove({ sticks, stickId: 'picked', path, contactMargin: 1 }).valid).toBe(true);
    expect(validateMove({ sticks, stickId: 'picked', path, contactMargin: 3 }).valid).toBe(false);
  });
});
