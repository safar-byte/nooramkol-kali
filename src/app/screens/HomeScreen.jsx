import { DIFFICULTY_ORDER, MAX_SCORE } from '../../game/constants.js';

function DecorativeSticks() {
  // A few crossed midribs as a quiet title illustration.
  const sticks = [
    { x1: 30, y1: 90, x2: 290, y2: 40, color: '#b5733a', width: 7 },
    { x1: 60, y1: 20, x2: 250, y2: 110, color: '#dcb877', width: 4.5 },
    { x1: 110, y1: 115, x2: 210, y2: 10, color: '#e2c285', width: 4.5 },
    { x1: 20, y1: 60, x2: 300, y2: 75, color: '#cfa862', width: 4.5 },
  ];
  return (
    <svg className="home-art" viewBox="0 0 320 130" aria-hidden="true" focusable="false">
      {sticks.map((s, i) => (
        <g key={i} strokeLinecap="round">
          <line x1={s.x1 + 2} y1={s.y1 + 3} x2={s.x2 + 2} y2={s.y2 + 3} stroke="rgba(30,15,5,.35)" strokeWidth={s.width + 1} />
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="rgba(50,28,12,.9)" strokeWidth={s.width + 1.4} />
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={s.width} />
        </g>
      ))}
    </svg>
  );
}

export default function HomeScreen({ t, settings, bestScores, onDifficultyChange, onPlay, onOpenRules, onOpenSettings }) {
  const best = bestScores[settings.difficulty];
  return (
    <main className="home">
      <div className="home-card">
        <DecorativeSticks />
        <h1 className="home-title">
          {t('title')}
          {settings.language === 'en' && (
            <span className="home-title-ml" lang="ml">
              നൂറാംകോൽ കളി
            </span>
          )}
        </h1>
        <p className="home-subtitle">{t('subtitle')}</p>
        <p className="home-alt">{t('altName')}</p>

        <fieldset className="difficulty">
          <legend>{t('difficulty')}</legend>
          <div className="segmented">
            {DIFFICULTY_ORDER.map((id) => (
              <label key={id} className={settings.difficulty === id ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="difficulty"
                  value={id}
                  checked={settings.difficulty === id}
                  onChange={() => onDifficultyChange(id)}
                />
                {t(id)}
              </label>
            ))}
          </div>
          <p className="difficulty-desc">{t(`${settings.difficulty}Desc`)}</p>
        </fieldset>

        <p className="home-best" aria-live="polite">
          <span className="home-best-label">{t('bestScore')}:</span>{' '}
          {best
            ? t('bestScoreValue', { score: best.score, max: MAX_SCORE, fouls: best.failedAttempts })
            : t('noBestScore')}
        </p>

        <button type="button" className="btn btn-primary btn-large" onClick={onPlay}>
          {t('play')}
        </button>
        <div className="home-secondary">
          <button type="button" className="btn btn-ghost" onClick={onOpenRules}>
            {t('rules')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
            {t('settings')}
          </button>
        </div>
      </div>
    </main>
  );
}
