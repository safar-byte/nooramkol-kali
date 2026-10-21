import { MAX_SCORE } from '../../game/constants.js';
import { getMatchSummary } from '../../game/matchReducer.js';
import Dialog from '../Dialog.jsx';

function OnlineCompletion({ t, online, onPlayAgain, onHome }) {
  const { match, myId, isHost } = online;
  const { winnerId, isTie } = getMatchSummary(match);
  const winner = match.players.find((p) => p.id === winnerId);
  const host = match.players.find((p) => p.id === match.hostId);
  let title = t('itsATie');
  if (!isTie && winner) title = winner.id === myId ? t('youWin') : t('playerWins', { name: winner.name });

  return (
    <Dialog title={title} titleIcon={isTie ? '=' : '★'}>
      <div className="match-results">
        {match.players.map((p) => (
          <div key={p.id} className={`match-result${p.id === winnerId ? ' is-winner' : ''}`}>
            <span className="match-result-name">
              {p.id === winnerId && <span aria-hidden="true">★ </span>}
              {p.name}
              {p.id === myId && ` (${t('you')})`}
            </span>
            <span className="match-result-score">
              {p.stats.score}
              <span className="final-score-max"> / {MAX_SCORE}</span>
            </span>
            <span className="match-result-meta">
              {t('successfulMoves')}: {p.stats.successfulMoves} · {t('failedAttempts')}: {p.stats.failedAttempts} ·{' '}
              {t('bestStreak')}: {p.stats.bestStreak}
            </span>
          </div>
        ))}
      </div>
      {!isHost && <p className="setup-waiting">{t('waitingRematch', { name: host.name })}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onHome}>
          {t('leaveRoom')}
        </button>
        {isHost && (
          <button type="button" className="btn btn-primary" onClick={onPlayAgain} autoFocus>
            {t('rematch')}
          </button>
        )}
      </div>
    </Dialog>
  );
}

export default function CompletionScreen({
  t,
  game,
  summary,
  isNewBest,
  onPlayAgain,
  onChangeDifficulty,
  onHome,
  online = null,
}) {
  if (online?.match) return <OnlineCompletion t={t} online={online} onPlayAgain={onPlayAgain} onHome={onHome} />;

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
