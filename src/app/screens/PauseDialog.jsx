import Dialog from '../Dialog.jsx';

export default function PauseDialog({ t, onResume, onRestart, onHome, restartLabel, homeLabel }) {
  return (
    <Dialog title={t('pausedTitle')} titleIcon="⏸" onClose={onResume}>
      <p>{t('pausedText')}</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onHome}>
          {homeLabel ?? t('home')}
        </button>
        {onRestart && (
          <button type="button" className="btn btn-ghost" onClick={onRestart}>
            {restartLabel ?? t('restart')}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onResume} autoFocus>
          {t('resume')}
        </button>
      </div>
    </Dialog>
  );
}
