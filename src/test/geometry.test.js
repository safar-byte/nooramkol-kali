import { describe, expect, it } from 'vitest';
import {
  distanceBetweenSegments,
  distancePointToSegment,
  getStickEndpoints,
  normalizeAngle,
  samplePath,
  segmentsIntersect,
  sticksTouch,
} from '../game/geometry.js';
import { findSticksAtPoint, hitTest, toBoardPoint } from '../game/hitTest.js';

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

describe('geometry', () => {
  it('computes stick endpoints from centre, length and angle', () => {
    const { a, b } = getStickEndpoints(stick('s', 100, 50, 0));
    expect(a).toEqual({ x: 50, y: 50 });
    expect(b).toEqual({ x: 150, y: 50 });
  });

  it('measures point-to-segment distance including the end caps', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distancePointToSegment({ x: 5, y: 3 }, a, b)).toBeCloseTo(3);
    expect(distancePointToSegment({ x: 13, y: 4 }, a, b)).toBeCloseTo(5);
    expect(distancePointToSegment({ x: 2, y: 2 }, a, a)).toBeCloseTo(Math.SQRT2 * 2);
  });

  it('detects crossing and non-crossing segments', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 })).toBe(true);
  });

  it('returns 0 distance for crossing segments and the gap otherwise', () => {
    expect(distanceBetweenSegments({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(0);
    expect(distanceBetweenSegments({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 })).toBeCloseTo(4);
  });

  it('treats sticks as touching using half their widths plus margin', () => {
    const a = stick('a', 100, 100, 0);
    const near = stick('b', 100, 105.5, 0); // gap of 0.5 after widths
    expect(sticksTouch(a, near, 0)).toBe(false);
    expect(sticksTouch(a, near, 1)).toBe(true);
    expect(sticksTouch(a, stick('c', 100, 104, 0), 0)).toBe(true);
  });

  it('normalises angles into (-PI, PI]', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(normalizeAngle(2 * Math.PI + 0.25)).toBeCloseTo(0.25);
  });

  it('resamples a path so no step is longer than requested', () => {
    const samples = samplePath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2);
    expect(samples).toHaveLength(6);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i].x - samples[i - 1].x).toBeLessThanOrEqual(2);
    }
  });
});

describe('hit testing', () => {
  const pile = [stick('bottom', 100, 100, 0), stick('top', 100, 100, Math.PI / 2)];

  it('selects nothing when the click is far from every stick', () => {
    expect(hitTest(pile, { x: 400, y: 400 }, 12)).toBeNull();
  });

  it('selects the topmost stick when several are within the hit radius', () => {
    expect(hitTest(pile, { x: 102, y: 102 }, 12).id).toBe('top');
    expect(findSticksAtPoint(pile, { x: 102, y: 102 }, 12).map((s) => s.id)).toEqual(['top', 'bottom']);
  });

  it('selects a lower stick where it is the only candidate', () => {
    expect(hitTest(pile, { x: 140, y: 103 }, 12).id).toBe('bottom');
  });

  it('ignores removed sticks', () => {
    const withRemoved = [pile[0], { ...pile[1], removed: true }];
    expect(hitTest(withRemoved, { x: 100, y: 130 }, 12)).toBeNull();
  });

  it('converts CSS pixel coordinates into board coordinates', () => {
    const rect = { left: 10, top: 20, width: 500, height: 310 };
    expect(toBoardPoint(260, 175, rect, 1000, 620)).toEqual({ x: 500, y: 310 });
  });
});
