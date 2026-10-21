import {
  DIFFICULTIES,
  INITIAL_STICK_COUNTS,
  LARGE_STICK_ID,
  PILE_SPREAD,
  STICK_POINTS,
  STICK_SPEC,
  TRAY_STICK_SCALE,
} from './constants.js';
import { clamp, sticksTouch } from './geometry.js';
import { hasPlayableMove } from './hints.js';
import { createRng, gaussian, randomRange, shuffle } from './random.js';

/**
 * Create the round's 11 sticks (identity, type, points, size, colour).
 * Positions are filled in by `createBundle` / `createPile`.
 * Array order is the z-order: index 0 is the bottom of the pile.
 */
export function createStickSet(seed) {
  const rng = createRng(seed);
  const sticks = [
    {
      id: LARGE_STICK_ID,
      type: 'large',
      points: STICK_POINTS.large,
      x: 0,
      y: 0,
      angle: 0,
      length: STICK_SPEC.large.length,
      width: STICK_SPEC.large.width,
      color: STICK_SPEC.large.color,
      removed: false,
      removedOrder: null,
    },
  ];
  const { small } = STICK_SPEC;
  for (let i = 0; i < INITIAL_STICK_COUNTS.small; i += 1) {
    sticks.push({
      id: `stick-${String(i + 1).padStart(3, '0')}`,
      type: 'small',
      points: STICK_POINTS.small,
      x: 0,
      y: 0,
      angle: 0,
      length: Math.round(randomRange(rng, small.minLength, small.maxLength)),
      width: Number(randomRange(rng, small.minWidth, small.maxWidth).toFixed(2)),
      color: small.colors[Math.floor(rng() * small.colors.length)],
      removed: false,
      removedOrder: null,
    });
  }
  return sticks;
}

/**
 * Arrange the sticks as a tied bundle: the large stick at the bottom of the
 * z-order, the ten small sticks stacked above it.
 */
export function createBundle(sticks, layout) {
  const area = layout.pileArea;
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height * 0.42;
  const angle = -0.12;
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  const gap = 6.2;

  const large = sticks.find((s) => s.type === 'large');
  const smalls = sticks.filter((s) => s.type === 'small');
  const mid = (smalls.length - 1) / 2;

  const bundledLarge = { ...large, x: cx + nx * 3, y: cy + ny * 3, angle, removed: false, removedOrder: null };
  const bundledSmalls = smalls.map((s, i) => {
    const across = (i - mid) * gap;
    const along = ((i % 3) - 1) * 4;
    return {
      ...s,
      x: cx + nx * across + ax * along,
      y: cy + ny * across + ay * along,
      angle: angle + ((i % 2) - 0.5) * 0.012,
      removed: false,
      removedOrder: null,
    };
  });
  return [bundledLarge, ...bundledSmalls];
}

/** One random scatter of the bundle onto the pile area. */
export function scatterPile(sticks, layout, difficulty, rng) {
  const config = DIFFICULTIES[difficulty];
  const area = layout.pileArea;
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const sigma = (PILE_SPREAD * config.scatter * Math.min(area.width, area.height)) / 560;

  const placed = sticks.map((stick) => {
    // The large stick falls first from the bottom of the bundle, so it lands
    // near the middle with the small sticks spread over it.
    const spread = stick.type === 'large' ? sigma * 0.45 : sigma;
    const angle = rng() * Math.PI;
    const halfX = (Math.abs(Math.cos(angle)) * stick.length) / 2 + stick.width + 4;
    const halfY = (Math.abs(Math.sin(angle)) * stick.length) / 2 + stick.width + 4;
    const x = clamp(cx + gaussian(rng) * spread, area.x + halfX, area.x + area.width - halfX);
    const y = clamp(cy + gaussian(rng) * spread * 0.82, area.y + halfY, area.y + area.height - halfY);
    return { ...stick, x, y, angle, removed: false, removedOrder: null };
  });

  const large = placed.find((s) => s.type === 'large');
  const smalls = shuffle(rng, placed.filter((s) => s.type === 'small'));
  return [large, ...smalls];
}

/**
 * Drop the bundle and return the settled pile. A bounded retry makes sure the
 * pile has at least one cleanly removable stick. Pile validity (a small stick on
 * the large stick) is deliberately *not* forced: an invalid drop is a foul.
 */
export function createPile({ sticks, layout, difficulty, seed, maxAttempts = 30 }) {
  const rng = createRng(seed);
  let pile = scatterPile(sticks, layout, difficulty, rng);
  for (let attempt = 1; attempt < maxAttempts && !hasPlayableMove(pile, layout, difficulty); attempt += 1) {
    pile = scatterPile(sticks, layout, difficulty, rng);
  }
  return pile;
}

/**
 * Pile-validity rule: at least one small stick must lie on top of (overlap)
 * the large stick. The large stick is always at the bottom of the z-order, so
 * any overlapping small stick is on top of it.
 */
export function checkPileValidity(sticks) {
  const largeIndex = sticks.findIndex((s) => s.type === 'large');
  if (largeIndex < 0) return { valid: false, overlappingSmallIds: [] };
  const large = sticks[largeIndex];
  const overlappingSmallIds = sticks
    .filter((s, i) => s.type === 'small' && i > largeIndex && sticksTouch(s, large, 0))
    .map((s) => s.id);
  return { valid: overlappingSmallIds.length > 0, overlappingSmallIds };
}

/** Where the n-th collected stick rests inside the tray. */
export function getTraySlot(layout, order) {
  const { tray } = layout;
  const spacing = layout.name === 'portrait' ? 13 : 17;
  return {
    x: tray.x + tray.width / 2,
    y: tray.y + 44 + order * spacing,
    angle: 0,
    lengthScale: TRAY_STICK_SCALE,
  };
}
