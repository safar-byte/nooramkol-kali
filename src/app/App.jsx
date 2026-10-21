import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ACTIONS, gameReducer } from '../game/gameReducer.js';
import { randomSeed } from '../game/random.js';
import { useLocalSettings } from '../hooks/useLocalSettings.js';
import { useMultiplayerMatch } from '../hooks/useMultiplayerMatch.js';
import { normalizeRoomCode } from '../net/protocol.js';
import { createTranslator } from './i18n.js';
import GameScreen from './screens/GameScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import RulesDialog from './screens/RulesDialog.jsx';
import SettingsDialog from './screens/SettingsDialog.jsx';

function appReducer(state, action) {
  if (state === null && action.type !== ACTIONS.NEW_GAME) return state;
  return gameReducer(state, action);
}

function pickLayout() {
  return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
}

const URL_PARAMS = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const DEBUG_FROM_URL = Boolean(URL_PARAMS?.has('debug'));
const ROOM_FROM_URL = normalizeRoomCode(URL_PARAMS?.get('room') ?? '');

function clearRoomFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('room')) return;
  url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

export default function App() {
  const { settings: storedSettings, bestScores, updateSettings, recordResult } = useLocalSettings();
  const settings = useMemo(
    () => ({ ...storedSettings, debugOverlay: storedSettings.debugOverlay || DEBUG_FROM_URL }),
    [storedSettings],
  );
  const t = useMemo(() => createTranslator(settings.language), [settings.language]);
  // home | solo | lobby | online
  const [screen, setScreen] = useState(ROOM_FROM_URL ? 'lobby' : 'home');
  const [dialog, setDialog] = useState(null);
  const [game, dispatch] = useReducer(appReducer, null);
  const [isNewBest, setIsNewBest] = useState(false);
  const recordedRoundRef = useRef(null);
  const mp = useMultiplayerMatch();

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
  }, [settings.language, settings.reducedMotion]);

  // Online: enter the game once the first match snapshot exists; fall back to the lobby without one.
  useEffect(() => {
    if (screen === 'lobby' && mp.match) setScreen('online');
    if (screen === 'online' && !mp.match) setScreen('lobby');
  }, [screen, mp.match]);

  const startGame = useCallback(
    (difficulty = settings.difficulty) => {
      setIsNewBest(false);
      dispatch({
        type: ACTIONS.NEW_GAME,
        difficulty,
        layout: pickLayout(),
        seed: randomSeed(),
        now: Date.now(),
        foulEndsRound: settings.foulEndsRound,
      });
      setScreen('solo');
    },
    [settings.difficulty, settings.foulEndsRound],
  );

  // Record the best solo result once per finished round.
  useEffect(() => {
    if (!game || game.phase !== 'complete') return;
    const roundKey = `${game.seed}:${game.startedAt}`;
    if (recordedRoundRef.current === roundKey) return;
    recordedRoundRef.current = roundKey;
    setIsNewBest(
      recordResult(game.difficulty, { score: game.stats.score, failedAttempts: game.stats.failedAttempts }),
    );
  }, [game, recordResult]);

  const goHome = useCallback(() => setScreen('home'), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const leaveOnline = useCallback(() => {
    mp.leave();
    clearRoomFromUrl();
    setScreen('home');
  }, [mp]);

  let content;
  if (screen === 'lobby' || (screen === 'online' && !mp.match)) {
    content = (
      <LobbyScreen
        t={t}
        mp={mp}
        settings={settings}
        updateSettings={updateSettings}
        initialCode={ROOM_FROM_URL}
        onStart={(difficulty) => mp.startMatch({ difficulty, layout: pickLayout() })}
        onBack={() => {
          clearRoomFromUrl();
          setScreen('home');
        }}
      />
    );
  } else if (screen === 'online') {
    content = (
      <GameScreen
        t={t}
        game={mp.match.game}
        dispatch={mp.sendAction}
        settings={settings}
        online={mp}
        onRestart={mp.rematch}
        onHome={leaveOnline}
        onChangeDifficulty={leaveOnline}
        onOpenRules={() => setDialog('rules')}
      />
    );
  } else if (screen === 'solo' && game) {
    content = (
      <GameScreen
        t={t}
        game={game}
        dispatch={dispatch}
        settings={settings}
        isNewBest={isNewBest}
        onRestart={() => startGame(game.difficulty)}
        onHome={goHome}
        onChangeDifficulty={goHome}
        onOpenRules={() => setDialog('rules')}
      />
    );
  } else {
    content = (
      <HomeScreen
        t={t}
        settings={settings}
        bestScores={bestScores}
        onDifficultyChange={(difficulty) => updateSettings({ difficulty })}
        onPlay={() => startGame()}
        onPlayOnline={() => setScreen('lobby')}
        onOpenRules={() => setDialog('rules')}
        onOpenSettings={() => setDialog('settings')}
      />
    );
  }

  return (
    <>
      {content}
      {dialog === 'rules' && <RulesDialog t={t} foulEndsRound={settings.foulEndsRound} onClose={closeDialog} />}
      {dialog === 'settings' && (
        <SettingsDialog t={t} settings={storedSettings} updateSettings={updateSettings} onClose={closeDialog} />
      )}
    </>
  );
}
