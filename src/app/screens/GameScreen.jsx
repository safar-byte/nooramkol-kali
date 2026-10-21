import { useEffect, useRef, useState } from 'react';
import { createBoardController } from '../../game/boardController.js';
import { DIFFICULTIES, INITIAL_STICK_COUNTS, MAX_DROP_ATTEMPTS, MAX_SCORE } from '../../game/constants.js';
import { ACTIONS, getRoundSummary } from '../../game/gameReducer.js';
import { attachInputController } from '../../game/inputController.js';
import { randomSeed } from '../../game/random.js';
import { useGameLoop } from '../../hooks/useGameLoop.js';
import Dialog from '../Dialog.jsx';
import CompletionScreen from './CompletionScreen.jsx';
import PauseDialog from './PauseDialog.jsx';

const TOAST_ICONS = { success: '✓', failure: '✗', info: 'ℹ' };

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return undefined;
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function Hud({ t, game, summary }) {
  const { stats } = game;
  const items = [
    { label: t('score'), value: `${stats.score}`, suffix: `/ ${MAX_SCORE}`, primary: true },
    { label: t('smallCollected'), value: `${stats.smallSticksCollected}`, suffix: `/ ${INITIAL_STICK_COUNTS.small}` },
    { label: t('largeCollected'), value: stats.largeStickCollected ? `✓ ${t('yes')}` : `— ${t('no')}` },
    { label: t('remaining'), value: t('remainingValue', { small: summary.remainingSmall, large: summary.remainingLarge }) },
    { label: t('fouls'), value: `${stats.failedAttempts}` },
    { label: t('dropAttempt'), value: `${Math.max(1, game.dropAttempts)}`, suffix: `/ ${MAX_DROP_ATTEMPTS}` },
    { label: t('streak'), value: `${stats.currentStreak}` },
    { label: t('accuracy'), value: `${Math.round(summary.accuracy * 100)}%` },
  ];
  return (
    <dl className="hud" aria-label="Round statistics">
      {items.map((item) => (
        <div key={item.label} className={`hud-item${item.primary ? ' hud-primary' : ''}`}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {item.suffix && <span className="hud-suffix"> {item.suffix}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SetupPanel({ t, game, dispatch }) {
  const { phase, dropAttempts } = game;
  if (phase === 'foul-retry') {
    return (
      <div className="setup-panel setup-panel-foul" role="alert">
        <p className="setup-title">
          <span aria-hidden="true">✗ </span>
          {t('foulDropTitle')}
        </p>
        <p>{t('foulDropText')}</p>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: ACTIONS.RETRY_DROP })}>
          {t('rebundle')}
        </button>
      </div>
    );
  }
  if (phase !== 'bundling' && phase !== 'dropping' && phase !== 'validating-pile') return null;
  const busy = phase !== 'bundling';
  const isRetry = (busy ? dropAttempts - 1 : dropAttempts) >= 1;
  return (
    <div className="setup-panel" role="status">
      <p>
        {phase === 'bundling' && t('bundleIntro')}
        {phase === 'dropping' && t('dropping')}
        {phase === 'validating-pile' && t('checkingPile')}
      </p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || game.paused}
        onClick={() => dispatch({ type: ACTIONS.DROP_STICKS, seed: randomSeed() })}
      >
        {isRetry ? t('dropAgain') : t('dropSticks')}
      </button>
    </div>
  );
}

export default function GameScreen({
  t,
  game,
  dispatch,
  settings,
  isNewBest,
  onRestart,
  onHome,
  onChangeDifficulty,
  onOpenRules,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const controllerRef = useRef(null);
  const gameRef = useRef(game);
  const settingsRef = useRef(settings);
  const translateRef = useRef(t);
  gameRef.current = game;
  settingsRef.current = settings;
  translateRef.current = t;

  const [toast, setToast] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  const summary = getRoundSummary(game);
  const config = DIFFICULTIES[game.difficulty];
  const hintsAvailable = config.hints && settings.hints;

  useEffect(() => {
    const canvas = canvasRef.current;
    const controller = createBoardController({
      canvas,
      getState: () => gameRef.current,
      getSettings: () => settingsRef.current,
      dispatch,
      onFeedback: (feedback) => {
        setToast({ ...feedback, id: performance.now() });
        setAnnouncement(feedback.text);
      },
      onAnnounce: setAnnouncement,
      translate: (key, params) => translateRef.current(key, params),
    });
    controllerRef.current = controller;
    const detach = attachInputController(canvas, controller.pointerHandlers);
    const observer = new ResizeObserver(([entry]) => {
      controller.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(wrapRef.current);
    return () => {
      detach();
      observer.disconnect();
      controllerRef.current = null;
    };
  }, [dispatch]);

  // Rendering pauses with the game; the canvas keeps its last frame.
  useGameLoop((now) => controllerRef.current?.frame(now), !game.paused);

  useEffect(() => {
    controllerRef.current?.reset();
    setToast(null);
  }, [game.seed, game.startedAt]);

  useEffect(() => {
    if (game.paused) controllerRef.current?.cancelInteraction();
  }, [game.paused]);

  useEffect(() => {
    if (game.pileCheck?.valid) {
      const text = t('pileValid', { count: game.pileCheck.overlappingSmallIds.length });
      setToast({ kind: 'success', text, id: performance.now() });
      setAnnouncement(text);
    } else if (game.pileCheck) {
      setAnnouncement(game.phase === 'setup-failed' ? t('setupFailedText') : t('foulDropText'));
    }
    // Only react to a new validation result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.pileCheck]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), toast.kind === 'failure' ? 3200 : 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const canPause = !game.paused && ['bundling', 'foul-retry', 'playing'].includes(game.phase);
  const pause = () => dispatch({ type: ACTIONS.PAUSE_GAME });

  return (
    <div className="game-screen">
      <header className="game-header">
        <div className="brand">
          <span className="brand-title">{t('title')}</span>
          <span className="brand-difficulty">{t(game.difficulty)}</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              if (canPause) pause();
              onOpenRules();
            }}
          >
            {t('rules')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={pause}
            disabled={!canPause}
            aria-label={t('pause')}
          >
            <span aria-hidden="true">⏸</span>
            <span className="btn-text"> {t('pause')}</span>
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={onRestart} aria-label={t('restart')}>
            <span aria-hidden="true">↻</span>
            <span className="btn-text"> {t('restart')}</span>
          </button>
        </div>
      </header>

      <Hud t={t} game={game} summary={summary} />

      <div className="board-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="board"
          tabIndex={0}
          role="application"
          aria-label={t('boardLabel')}
          onKeyDown={(event) => {
            if (controllerRef.current?.handleKey(event)) event.preventDefault();
          }}
          onBlur={() => controllerRef.current?.setKeyboardActive(false)}
        />
        <SetupPanel t={t} game={game} dispatch={dispatch} />
        {toast && (
          <div key={toast.id} className={`toast toast-${toast.kind}`} aria-hidden="true">
            <span className="toast-icon">{TOAST_ICONS[toast.kind]}</span>
            {toast.text}
          </div>
        )}
      </div>

      <footer className="game-footer">
        <p className="help-text">{coarsePointer ? t('helpTouch') : t('helpPointer')}</p>
        {hintsAvailable && game.phase === 'playing' && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => controllerRef.current?.showHint()}>
            <span aria-hidden="true">💡 </span>
            {t('hint')}
          </button>
        )}
        <details className="keyboard-help">
          <summary>Keyboard</summary>
          <p>{t('helpKeyboard')}</p>
        </details>
      </footer>

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {game.paused && (
        <PauseDialog
          t={t}
          onResume={() => dispatch({ type: ACTIONS.RESUME_GAME })}
          onRestart={onRestart}
          onHome={onHome}
        />
      )}

      {game.phase === 'setup-failed' && (
        <Dialog title={t('setupFailedTitle')} titleIcon="✗">
          <p>{t('setupFailedText')}</p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onHome}>
              {t('home')}
            </button>
            <button type="button" className="btn btn-primary" onClick={onRestart} autoFocus>
              {t('newGame')}
            </button>
          </div>
        </Dialog>
      )}

      {game.phase === 'complete' && (
        <CompletionScreen
          t={t}
          game={game}
          summary={summary}
          isNewBest={isNewBest}
          onPlayAgain={onRestart}
          onChangeDifficulty={onChangeDifficulty}
          onHome={onHome}
        />
      )}
    </div>
  );
}
