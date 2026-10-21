import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ACTIONS, gameReducer } from '../game/gameReducer.js';
import { randomSeed } from '../game/random.js';
import { useLocalSettings } from '../hooks/useLocalSettings.js';
import { createTranslator } from './i18n.js';
import GameScreen from './screens/GameScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import RulesDialog from './screens/RulesDialog.jsx';
import SettingsDialog from './screens/SettingsDialog.jsx';

function appReducer(state, action) {
  if (state === null && action.type !== ACTIONS.NEW_GAME) return state;
  return gameReducer(state, action);
}

function pickLayout() {
  return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
}

const DEBUG_FROM_URL = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

export default function App() {
  const { settings: storedSettings, bestScores, updateSettings, recordResult } = useLocalSettings();
  const settings = useMemo(
    () => ({ ...storedSettings, debugOverlay: storedSettings.debugOverlay || DEBUG_FROM_URL }),
    [storedSettings],
  );
  const t = useMemo(() => createTranslator(settings.language), [settings.language]);
  const [screen, setScreen] = useState('home');
  const [dialog, setDialog] = useState(null);
  const [game, dispatch] = useReducer(appReducer, null);
  const [isNewBest, setIsNewBest] = useState(false);
  const recordedRoundRef = useRef(null);

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
  }, [settings.language, settings.reducedMotion]);

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
      setScreen('game');
    },
    [settings.difficulty, settings.foulEndsRound],
  );

  // Record the best result once per finished round.
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

  return (
    <>
      {screen === 'home' || !game ? (
        <HomeScreen
          t={t}
          settings={settings}
          bestScores={bestScores}
          onDifficultyChange={(difficulty) => updateSettings({ difficulty })}
          onPlay={() => startGame()}
          onOpenRules={() => setDialog('rules')}
          onOpenSettings={() => setDialog('settings')}
        />
      ) : (
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
      )}

      {dialog === 'rules' && <RulesDialog t={t} foulEndsRound={settings.foulEndsRound} onClose={closeDialog} />}
      {dialog === 'settings' && (
        <SettingsDialog t={t} settings={storedSettings} updateSettings={updateSettings} onClose={closeDialog} />
      )}
    </>
  );
}
