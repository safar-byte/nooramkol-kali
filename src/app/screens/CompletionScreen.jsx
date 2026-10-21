import { MAX_SCORE } from '../../game/constants.js';
import Dialog from '../Dialog.jsx';

export default function CompletionScreen({ t, game, summary, isNewBest, onPlayAgain, onChangeDifficulty, onHome }) {
  const { stats, endedEarly } = game;
  return (
    <Dialog title={endedEarly ? t('roundEnded') : t('pileCleared')} titleIcon={endedEarly ? '■' : '✓'}>
      {endedEarly && <p>{t('roundEndedText')}</p>}
      {isNewBest && (
        <p className="new-best">
          <span aria-hidden="true">★ </span>
          {t('newBest')}
        </p>
      )}
      <p className="final-score">
        <span className="final-score-label">{t('finalScore')}</span>
        <span className="final-score-value">
          {stats.score}
          <span className="final-score-max"> / {MAX_SCORE}</span>
        </span>
      </p>
      <dl className="result-stats">
        <div>
          <dt>{t('successfulMoves')}</dt>
          <dd>{stats.successfulMoves}</dd>
        </div>
        <div>
          <dt>{t('failedAttempts')}</dt>
          <dd>{stats.failedAttempts}</dd>
        </div>
        <div>
          <dt>{t('accuracy')}</dt>
          <dd>{Math.round(summary.accuracy * 100)}%</dd>
        </div>
        <div>
          <dt>{t('bestStreak')}</dt>
          <dd>{stats.bestStreak}</dd>
        </div>
      </dl>
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onHome}>
          {t('home')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onChangeDifficulty}>
          {t('changeDifficulty')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onPlayAgain} autoFocus>
          {t('playAgain')}
        </button>
      </div>
    </Dialog>
  );
}
