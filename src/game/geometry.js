// Pure geometry helpers. No DOM, Canvas, or React access.

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distance(p, q) {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Normalise an angle to the range (-PI, PI]. */
export function normalizeAngle(angle) {
  const full = Math.PI * 2;
  let a = ((angle % full) + full) % full;
  if (a > Math.PI) a -= full;
  return a;
}

/**
 * Endpoints of a stick's centre line. Position/angle overrides allow testing a
 * stick at a hypothetical location without copying it.
 */
export function getStickEndpoints(stick, x = stick.x, y = stick.y, angle = stick.angle) {
  const dx = (Math.cos(angle) * stick.length) / 2;
  const dy = (Math.sin(angle) * stick.length) / 2;
  return {
    a: { x: x - dx, y: y - dy },
    b: { x: x + dx, y: y + dy },
  };
}

export function distancePointToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

function orientation(p, q, r) {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

function onSegment(p, q, r) {
  return (
    Math.min(p.x, r.x) <= q.x &&
    q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y &&
    q.y <= Math.max(p.y, r.y)
  );
}

export function segmentsIntersect(a1, a2, b1, b2) {
  const d1 = orientation(b1, b2, a1);
  const d2 = orientation(b1, b2, a2);
  const d3 = orientation(a1, a2, b1);
  const d4 = orientation(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(b1, a1, b2)) return true;
  if (d2 === 0 && onSegment(b1, a2, b2)) return true;
  if (d3 === 0 && onSegment(a1, b1, a2)) return true;
  if (d4 === 0 && onSegment(a1, b2, a2)) return true;
  return false;
}

/** Intersection point of two segments, or null if they do not cross. */
export function segmentIntersectionPoint(a1, a2, b1, b2) {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null;
  const t = ((b1.x - a1.x) * sy - (b1.y - a1.y) * sx) / denom;
  const u = ((b1.x - a1.x) * ry - (b1.y - a1.y) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * rx, y: a1.y + t * ry };
}

export function distanceBetweenSegments(a1, a2, b1, b2) {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    distancePointToSegment(a1, b1, b2),
    distancePointToSegment(a2, b1, b2),
    distancePointToSegment(b1, a1, a2),
    distancePointToSegment(b2, a1, a2),
  );
}

/** Gap between two sticks' surfaces. Negative or zero means they overlap. */
export function stickGap(stickA, stickB) {
  const a = getStickEndpoints(stickA);
  const b = getStickEndpoints(stickB);
  return distanceBetweenSegments(a.a, a.b, b.a, b.b) - (stickA.width + stickB.width) / 2;
}

/**
 * Two sticks are in contact when the distance between their centre lines is at
 * most half the sum of their widths plus a contact margin.
 */
export function sticksTouch(stickA, stickB, margin = 0) {
  return stickGap(stickA, stickB) <= margin;
}

export function pointInRect(p, rect) {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

export function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Densely resample a polyline so consecutive samples are at most `step` apart.
 * Used to make sure fast pointer movement cannot skip over a thin stick.
 */
export function samplePath(points, step) {
  if (points.length === 0) return [];
  const samples = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const segments = Math.max(1, Math.ceil(distance(from, to) / step));
    for (let k = 1; k <= segments; k += 1) {
      const t = k / segments;
      samples.push({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) });
    }
  }
  return samples;
}
