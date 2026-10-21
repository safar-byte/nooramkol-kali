import { describe, expect, it } from 'vitest';
import {
  defaultSave,
  loadSave,
  recordBestScore,
  STORAGE_KEY,
  writeSave,
} from '../game/persistence.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    data,
  };
}

describe('persistence', () => {
  it('falls back to defaults when stored data is corrupted', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{not json' });
    expect(loadSave(storage)).toEqual(defaultSave());
  });

  it('falls back to defaults when storage throws', () => {
    const storage = {
      getItem() {
        throw new Error('blocked');
      },
    };
    expect(loadSave(storage)).toEqual(defaultSave());
  });

  it('drops invalid fields but keeps valid ones', () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({
        settings: { difficulty: 'impossible', soundEnabled: false, language: 'fr' },
        bestScores: { relaxed: { score: 120, failedAttempts: 2 }, expert: { score: 'lots' } },
      }),
    });
    const save = loadSave(storage);
    expect(save.settings.difficulty).toBe('traditional');
    expect(save.settings.soundEnabled).toBe(false);
    expect(save.settings.language).toBe('en');
    expect(save.bestScores.relaxed.score).toBe(120);
    expect(save.bestScores.expert).toBeNull();
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const save = { ...defaultSave(), settings: { ...defaultSave().settings, difficulty: 'expert' } };
    writeSave(storage, save);
    expect(loadSave(storage).settings.difficulty).toBe('expert');
  });

  it('records a best score by points, breaking ties with fewer fouls', () => {
    let { save, isNewBest } = recordBestScore(defaultSave(), 'traditional', { score: 150, failedAttempts: 3 });
    expect(isNewBest).toBe(true);
    ({ save, isNewBest } = recordBestScore(save, 'traditional', { score: 140, failedAttempts: 0 }));
    expect(isNewBest).toBe(false);
    ({ save, isNewBest } = recordBestScore(save, 'traditional', { score: 150, failedAttempts: 1 }));
    expect(isNewBest).toBe(true);
    expect(save.bestScores.traditional.failedAttempts).toBe(1);
  });
});
