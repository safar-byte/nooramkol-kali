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

function SetupPanel({ t, game, dispatch, waitingName }) {
  const { phase, dropAttempts } = game;
  if (phase === 'foul-retry') {
    return (
      <div className="setup-panel setup-panel-foul" role="alert">
        <p className="setup-title">
          <span aria-hidden="true">✗ </span>
          {t('foulDropTitle')}
        </p>
        <p>{t('foulDropText')}</p>
        {waitingName ? (
          <p className="setup-waiting">{t('waitingRebundle', { name: waitingName })}</p>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: ACTIONS.RETRY_DROP })}>
            {t('rebundle')}
          </button>
        )}
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
      {waitingName && phase === 'bundling' ? (
        <p className="setup-waiting">{t('waitingDrop', { name: waitingName })}</p>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || game.paused || Boolean(waitingName)}
          onClick={() => dispatch({ type: ACTIONS.DROP_STICKS, seed: randomSeed() })}
        >
          {isRetry ? t('dropAgain') : t('dropSticks')}
        </button>
      )}
    </div>
  );
}

function PlayersBar({ t, match, myId }) {
  const current = match.players[match.currentPlayerIndex];
  const isMyTurn = current.id === myId;
  const card = (player, index) => {
    const active = index === match.currentPlayerIndex;
    return (
      <div key={player.id} className={`player-card${active ? ' is-active' : ''}`}>
        <span className="player-name">
          {player.name}
          {player.id === myId && <span className="player-you"> ({t('you')})</span>}
        </span>
        <span className="player-score">{player.stats.score}</span>
        <span className="player-meta">
          {active && <span className="turn-badge">▶ {t('turnMarker')} · </span>}
          {t('playerFouls', { count: player.stats.failedAttempts })}
        </span>
      </div>
    );
  };
  return (
    <div className="players-bar">
      {card(match.players[0], 0)}
      <p className={`turn-banner${isMyTurn ? ' is-mine' : ''}`} role="status">
        {isMyTurn ? t('yourTurn') : t('theirTurn', { name: current.name })}
      </p>
      {card(match.players[1], 1)}
    </div>
  );
}

const FOUL_REASON_KEYS = { 'lifted-from-under': 'foulLifted', 'disturbed-other-stick': 'foulDisturbed' };

/** Blocking dialogs for connection problems in an online match. */
function ConnectionDialog({ t, online, onLeave }) {
  const { status, isHost, opponentName, roomCode } = online;
  if (status === 'opponent-left') {
    return (
      <Dialog title={t('opponentLeftTitle')} titleIcon="⚠">
        <p>
          {isHost
            ? t('opponentLeftHost', { name: opponentName, code: roomCode })
            : t('opponentLeftGuest', { name: opponentName })}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onLeave}>
            {t('leaveRoom')}
          </button>
        </div>
      </Dialog>
    );
  }
  if (!isHost && (status === 'disconnected' || status === 'joining')) {
    return (
      <Dialog title={t('connectionLostTitle')} titleIcon="⚠">
        <p>{status === 'joining' ? t('joiningRoom', { code: roomCode }) : t('connectionLostText', { name: opponentName })}</p>
        {online.error && <p className="lobby-error">{online.error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            {t('leaveRoom')}
          </button>
          <button type="button" className="btn btn-primary" onClick={online.reconnect} disabled={status === 'joining'}>
            {t('reconnect')}
          </button>
        </div>
      </Dialog>
    );
  }
  return null;
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
  online = null,
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

  const match = online?.match ?? null;
  const myId = online?.myId ?? null;
  const currentPlayer = match ? match.players[match.currentPlayerIndex] : null;
  const isMyTurn = !match || currentPlayer.id === myId;
  const onlineRef = useRef(null);
  onlineRef.current = {
    isOnline: Boolean(online),
    isHost: Boolean(online?.isHost),
    isMyTurn,
    sendDrag: online?.sendDrag,
    getRemoteDrag: online?.getRemoteDrag,
  };

  const [toast, setToast] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  const summary = getRoundSummary(game);
  const config = DIFFICULTIES[game.difficulty];
  const hintsAvailable = config.hints && settings.hints && isMyTurn;

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
      canAct: () => onlineRef.current.isMyTurn,
      isAuthority: () => !onlineRef.current.isOnline || onlineRef.current.isHost,
      onDragUpdate: (drag) => onlineRef.current.sendDrag?.(drag),
      getRemoteDrag: () => onlineRef.current.getRemoteDrag?.() ?? null,
    });
    controllerRef.current = controller;
    // Dev-only handle for automated playtesting; removed from production builds.
    if (import.meta.env.DEV) window.__nooramkol = { getState: () => gameRef.current, controller };
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

  // Keyed on primitives: online snapshots replace objects even when nothing changed.
  const pileKey = game.pileCheck ? `${game.seed}:${game.startedAt}:${game.dropAttempts}` : null;
  // Skip a result that already existed when this screen mounted (e.g. rejoining a match).
  const seenPileKeyRef = useRef(pileKey);
  useEffect(() => {
    if (!pileKey || pileKey === seenPileKeyRef.current) return;
    seenPileKeyRef.current = pileKey;
    if (game.pileCheck.valid) {
      const text = t('pileValid', { count: game.pileCheck.overlappingSmallIds.length });
      setToast({ kind: 'success', text, id: performance.now() });
      setAnnouncement(text);
    } else {
      setAnnouncement(game.phase === 'setup-failed' ? t('setupFailedText') : t('foulDropText'));
    }
    // Only react to a new validation result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pileKey]);

  // Online: announce picks and fouls, including the opponent's.
  const event = match?.lastEvent;
  const eventKey = event ? `${match.round}:${event.seq}` : null;
  const seenEventRef = useRef(event ? { round: match.round, seq: event.seq } : null);
  useEffect(() => {
    if (!eventKey) return;
    // Monotonic per round, so a late or replayed snapshot never repeats a toast.
    const seen = seenEventRef.current;
    if (seen && seen.round === match.round && event.seq <= seen.seq) return;
    seenEventRef.current = { round: match.round, seq: event.seq };
    const nameOf = (id) => match.players.find((p) => p.id === id)?.name ?? '';
    const mine = event.playerId === myId;
    let next = null;
    if (event.type === 'foul') {
      const reason = t(FOUL_REASON_KEYS[event.reason] ?? 'foulDisturbed');
      next = mine
        ? { kind: 'failure', text: `${reason} ${t('mpYouFouled', { next: nameOf(event.nextPlayerId) })}` }
        : { kind: 'info', text: t('mpOpponentFouled', { name: nameOf(event.playerId) }) };
      if (!mine) controllerRef.current?.flashFailure(event.disturbedStickIds ?? []);
    } else if (event.type === 'pick' && !mine) {
      next = { kind: 'success', text: t('mpOpponentPicked', { name: nameOf(event.playerId), points: event.points }) };
    }
    if (next) {
      setToast({ ...next, id: performance.now() });
      setAnnouncement(next.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventKey]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), toast.kind === 'failure' ? 3200 : 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const canPause = !game.paused && ['bundling', 'foul-retry', 'playing'].includes(game.phase);
  const pause = () => dispatch({ type: ACTIONS.PAUSE_GAME });
  const connectionIssue =
    online &&
    (online.status === 'opponent-left' ||
      (!online.isHost && (online.status === 'disconnected' || online.status === 'joining')));
  const opponent = match?.players.find((p) => p.id !== myId);
  // Online, only the host can start a new round; the guest waits.
  const canRestart = !online || online.isHost;
  const homeLabel = online ? t('leaveRoom') : t('home');

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
          {!online && (
            <button type="button" className="btn btn-ghost btn-small" onClick={onRestart} aria-label={t('restart')}>
              <span aria-hidden="true">↻</span>
              <span className="btn-text"> {t('restart')}</span>
            </button>
          )}
        </div>
      </header>

      {match && <PlayersBar t={t} match={match} myId={myId} />}
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
        <SetupPanel t={t} game={game} dispatch={dispatch} waitingName={isMyTurn ? null : currentPlayer.name} />
        {toast && (
          <div key={toast.id} className={`toast toast-${toast.kind}`} aria-hidden="true">
            <span className="toast-icon">{TOAST_ICONS[toast.kind]}</span>
            {toast.text}
          </div>
        )}
      </div>

      <footer className="game-footer">
        <p className="help-text">
          {!isMyTurn
            ? t('theirTurn', { name: currentPlayer.name })
            : coarsePointer
              ? t('helpTouch')
              : t('helpPointer')}
        </p>
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

      {connectionIssue && <ConnectionDialog t={t} online={online} onLeave={onHome} />}

      {!connectionIssue && game.paused && (
        <PauseDialog
          t={t}
          onResume={() => dispatch({ type: ACTIONS.RESUME_GAME })}
          onRestart={canRestart ? onRestart : null}
          restartLabel={online ? t('newRound') : t('restart')}
          onHome={onHome}
          homeLabel={homeLabel}
        />
      )}

      {!connectionIssue && game.phase === 'setup-failed' && (
        <Dialog title={t('setupFailedTitle')} titleIcon="✗">
          <p>{t('setupFailedText')}</p>
          {!canRestart && <p className="setup-waiting">{t('waitingRematch', { name: opponent.name })}</p>}
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onHome}>
              {homeLabel}
            </button>
            {canRestart && (
              <button type="button" className="btn btn-primary" onClick={onRestart} autoFocus>
                {online ? t('newRound') : t('newGame')}
              </button>
            )}
          </div>
        </Dialog>
      )}

      {!connectionIssue && game.phase === 'complete' && (
        <CompletionScreen
          t={t}
          game={game}
          summary={summary}
          isNewBest={isNewBest}
          onPlayAgain={onRestart}
          onChangeDifficulty={onChangeDifficulty}
          onHome={onHome}
          online={online}
        />
      )}
    </div>
  );
}
