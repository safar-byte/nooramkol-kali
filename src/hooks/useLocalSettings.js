import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultSave, loadSave, recordBestScore, writeSave } from '../game/persistence.js';

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Settings and best scores, persisted to localStorage. */
export function useLocalSettings() {
  const [save, setSave] = useState(() =>
    loadSave(getStorage(), defaultSave({ prefersReducedMotion: prefersReducedMotion() })),
  );
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    writeSave(getStorage(), save);
  }, [save]);

  const updateSettings = useCallback((patch) => {
    setSave((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, []);

  /** Returns true when the result is a new personal best for that difficulty. */
  const recordResult = useCallback((difficulty, result) => {
    const outcome = recordBestScore(saveRef.current, difficulty, result);
    if (outcome.isNewBest) {
      saveRef.current = outcome.save;
      setSave(outcome.save);
    }
    return outcome.isNewBest;
  }, []);

  return { settings: save.settings, bestScores: save.bestScores, updateSettings, recordResult };
}
