// Local persistence of settings and best results. Pure helpers take a
// Storage-like object so they can be tested without a browser.

import { DIFFICULTY_ORDER } from './constants.js';

export const STORAGE_KEY = 'nooramkol-kali:v1';

export function defaultSave({ prefersReducedMotion = false } = {}) {
  return {
    settings: {
      difficulty: 'traditional',
      soundEnabled: true,
      reducedMotion: prefersReducedMotion,
      hints: true,
      language: 'en',
      foulEndsRound: false,
      debugOverlay: false,
      playerName: '',
    },
    bestScores: { relaxed: null, traditional: null, expert: null },
  };
}

function sanitizeBest(value) {
  if (!value || typeof value !== 'object') return null;
  const { score, failedAttempts, achievedAt } = value;
  if (!Number.isFinite(score) || score < 0) return null;
  return {
    score,
    failedAttempts: Number.isFinite(failedAttempts) && failedAttempts >= 0 ? failedAttempts : 0,
    achievedAt: typeof achievedAt === 'string' ? achievedAt : null,
  };
}

/** Merge untrusted stored data onto defaults, field by field. */
export function sanitizeSave(raw, defaults = defaultSave()) {
  const save = structuredCloneSafe(defaults);
  if (!raw || typeof raw !== 'object') return save;

  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  if (DIFFICULTY_ORDER.includes(settings.difficulty)) save.settings.difficulty = settings.difficulty;
  for (const key of ['soundEnabled', 'reducedMotion', 'hints', 'foulEndsRound', 'debugOverlay']) {
    if (typeof settings[key] === 'boolean') save.settings[key] = settings[key];
  }
  if (settings.language === 'en' || settings.language === 'ml') save.settings.language = settings.language;
  if (typeof settings.playerName === 'string') save.settings.playerName = settings.playerName.trim().slice(0, 20);

  const best = raw.bestScores && typeof raw.bestScores === 'object' ? raw.bestScores : {};
  for (const difficulty of DIFFICULTY_ORDER) save.bestScores[difficulty] = sanitizeBest(best[difficulty]);
  return save;
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadSave(storage, defaults = defaultSave()) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return sanitizeSave(null, defaults);
    return sanitizeSave(JSON.parse(text), defaults);
  } catch {
    return sanitizeSave(null, defaults);
  }
}

export function writeSave(storage, save) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** Higher score wins; ties go to fewer failed picking attempts. */
export function isBetterResult(candidate, current) {
  if (!current) return true;
  if (candidate.score !== current.score) return candidate.score > current.score;
  return candidate.failedAttempts < current.failedAttempts;
}

export function recordBestScore(save, difficulty, result, achievedAt = new Date().toISOString()) {
  const current = save.bestScores[difficulty] ?? null;
  if (!isBetterResult(result, current)) return { save, isNewBest: false };
  return {
    isNewBest: true,
    save: {
      ...save,
      bestScores: {
        ...save.bestScores,
        [difficulty]: { score: result.score, failedAttempts: result.failedAttempts, achievedAt },
      },
    },
  };
}
