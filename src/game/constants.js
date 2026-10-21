// Core rule values for this version of Nooramkol Kali. Every difficulty uses the
// same stick set and point values; difficulty only changes scatter, assistance
// and disturbance tolerance.

export const STICK_POINTS = {
  small: 10,
  large: 100,
};

export const INITIAL_STICK_COUNTS = {
  small: 10,
  large: 1,
};

export const TOTAL_STICKS = INITIAL_STICK_COUNTS.small + INITIAL_STICK_COUNTS.large;

export const MAX_SCORE =
  STICK_POINTS.small * INITIAL_STICK_COUNTS.small +
  STICK_POINTS.large * INITIAL_STICK_COUNTS.large;

/** One initial drop plus exactly one retry after a foul setup. */
export const MAX_DROP_ATTEMPTS = 2;

export const LARGE_STICK_ID = 'stick-large';

/**
 * Difficulty presets.
 * - scatter: multiplier for how widely the pile spreads (bigger = more separated).
 * - contactMargin: extra distance (board units) counted as contact. Negative values
 *   let sticks graze each other; larger values are stricter.
 * - liftTolerance: how far a stick lying *under* another may move before the
 *   stick on top counts as disturbed.
 * - hitRadiusCss: selection radius in CSS pixels (converted to board units at runtime).
 */
export const DIFFICULTIES = {
  relaxed: {
    id: 'relaxed',
    scatter: 1.05,
    contactMargin: -1,
    liftTolerance: 4,
    hitRadiusCss: 16,
    hints: true,
    showBlockers: true,
    hoverHighlight: true,
  },
  traditional: {
    id: 'traditional',
    scatter: 0.74,
    contactMargin: 1,
    liftTolerance: 2,
    hitRadiusCss: 13,
    hints: true,
    showBlockers: false,
    hoverHighlight: true,
  },
  expert: {
    id: 'expert',
    scatter: 0.54,
    contactMargin: 2.5,
    liftTolerance: 1,
    hitRadiusCss: 11,
    hints: false,
    showBlockers: false,
    hoverHighlight: false,
  },
};

export const DIFFICULTY_ORDER = ['relaxed', 'traditional', 'expert'];

/**
 * Logical board layouts (board units, not pixels). The canvas scales these
 * uniformly so stick geometry is never distorted.
 */
export const LAYOUTS = {
  landscape: {
    name: 'landscape',
    width: 1000,
    height: 620,
    pileArea: { x: 30, y: 30, width: 730, height: 560 },
    tray: { x: 790, y: 50, width: 180, height: 520 },
  },
  portrait: {
    name: 'portrait',
    width: 600,
    height: 880,
    pileArea: { x: 25, y: 25, width: 550, height: 600 },
    tray: { x: 40, y: 660, width: 520, height: 195 },
  },
};

export const STICK_SPEC = {
  small: {
    minLength: 150,
    maxLength: 172,
    minWidth: 4.6,
    maxWidth: 5.6,
    colors: ['#dcb877', '#d6ae68', '#e2c285', '#cfa862', '#d9b36f', '#e6c88f'],
  },
  large: {
    length: 236,
    width: 8.5,
    color: '#b5733a',
  },
};

/** Base standard deviation of the scatter, before the difficulty multiplier. */
export const PILE_SPREAD = 125;

/** Collected sticks are drawn shrunk inside the tray. */
export const TRAY_STICK_SCALE = 0.62;
