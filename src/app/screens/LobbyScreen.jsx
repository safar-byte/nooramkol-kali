import { useState } from 'react';
import { DIFFICULTY_ORDER } from '../../game/constants.js';
import { normalizeRoomCode, ROOM_CODE_LENGTH, sanitizeName } from '../../net/protocol.js';

function inviteLink(code) {
  const url = new URL(window.location.href);
  url.search = `?room=${code}`;
  url.hash = '';
  return url.toString();
}

export default function LobbyScreen({ t, mp, settings, updateSettings, initialCode, onStart, onBack }) {
  const [name, setName] = useState(settings.playerName);
  const [code, setCode] = useState(initialCode ?? '');
  const [formError, setFormError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [difficulty, setDifficulty] = useState(settings.difficulty);

  const validName = () => {
    const clean = sanitizeName(name);
    if (!clean) setFormError(t('nameRequired'));
    else updateSettings({ playerName: clean });
    return clean;
  };

  const create = () => {
    const clean = validName();
    if (clean) mp.hostRoom(clean);
  };

  const join = (event) => {
    event.preventDefault();
    const clean = validName();
    if (!clean) return;
    const roomCode = normalizeRoomCode(code);
    if (!roomCode) {
      setFormError(`${t('roomCode')}: ${ROOM_CODE_LENGTH} letters/numbers`);
      return;
    }
    mp.enterRoom(roomCode, clean);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(mp.roomCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const leave = () => {
    mp.leave();
    onBack();
  };

  let body;
  if (mp.status === 'creating') {
    body = <p className="lobby-status" role="status">{t('creatingRoom')}</p>;
  } else if (mp.status === 'joining') {
    body = <p className="lobby-status" role="status">{t('joiningRoom', { code: mp.roomCode })}</p>;
  } else if (mp.status === 'error') {
    body = (
      <>
        <p className="lobby-error" role="alert">
          <span aria-hidden="true">✗ </span>
          {mp.error}
        </p>
        <div className="lobby-actions">
          <button type="button" className="btn btn-primary" onClick={() => mp.leave()}>
            {t('tryAgain')}
          </button>
        </div>
      </>
    );
  } else if (mp.isHost && (mp.status === 'waiting' || mp.status === 'opponent-left')) {
    body = (
      <>
        <p>{t('shareCode')}</p>
        <p className="room-code" aria-label={`${t('roomCode')} ${mp.roomCode.split('').join(' ')}`}>
          {mp.roomCode}
        </p>
        <button type="button" className="btn btn-ghost" onClick={copy}>
          {copied ? `✓ ${t('linkCopied')}` : t('copyLink')}
        </button>
        <p className="lobby-status" role="status">
          <span className="pulse-dot" aria-hidden="true" /> {t('waitingForFriend')}
        </p>
      </>
    );
  } else if (mp.isHost && mp.status === 'connected') {
    body = (
      <>
        <p className="lobby-joined" role="status">
          <span aria-hidden="true">✓ </span>
          {t('friendJoined', { name: mp.opponentName })}
        </p>
        <fieldset className="difficulty">
          <legend>{t('difficulty')}</legend>
          <div className="segmented">
            {DIFFICULTY_ORDER.map((id) => (
              <label key={id} className={difficulty === id ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="online-difficulty"
                  value={id}
                  checked={difficulty === id}
                  onChange={() => setDifficulty(id)}
                />
                {t(id)}
              </label>
            ))}
          </div>
          <p className="difficulty-desc">{t(`${difficulty}Desc`)}</p>
        </fieldset>
        <button type="button" className="btn btn-primary btn-large" onClick={() => onStart(difficulty)}>
          {t('startMatch')}
        </button>
      </>
    );
  } else if (!mp.isHost && mp.status === 'connected') {
    body = (
      <p className="lobby-status" role="status">
        <span className="pulse-dot" aria-hidden="true" /> {t('waitingForHost', { name: mp.opponentName })}
      </p>
    );
  } else if (!mp.isHost && mp.status === 'opponent-left') {
    body = <p className="lobby-error">{t('opponentLeftGuest', { name: mp.opponentName })}</p>;
  } else {
    body = (
      <>
        <label className="field">
          <span>{t('yourName')}</span>
          <input
            type="text"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            placeholder={t('namePlaceholder')}
            onChange={(event) => {
              setName(event.target.value);
              setFormError(null);
            }}
          />
        </label>
        <div className="lobby-choices">
          <section className="lobby-choice">
            <h2>{t('createRoom')}</h2>
            <button type="button" className="btn btn-primary" onClick={create}>
              {t('createRoom')}
            </button>
          </section>
          <form className="lobby-choice" onSubmit={join}>
            <h2>{t('joinRoom')}</h2>
            <label className="field">
              <span className="visually-hidden">{t('roomCode')}</span>
              <input
                type="text"
                className="code-input"
                value={code}
                maxLength={9}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABC123"
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  setFormError(null);
                }}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              {t('join')}
            </button>
          </form>
        </div>
        {formError && (
          <p className="lobby-error" role="alert">
            {formError}
          </p>
        )}
      </>
    );
  }

  const inRoom = mp.status !== 'idle' && mp.status !== 'error';
  return (
    <main className="home">
      <div className="home-card lobby">
        <h1 className="lobby-title">{t('lobbyTitle')}</h1>
        {mp.status === 'idle' && <p className="home-subtitle">{t('lobbyIntro')}</p>}
        {body}
        <div className="home-secondary">
          <button type="button" className="btn btn-ghost" onClick={inRoom ? leave : onBack}>
            {inRoom ? t('leaveRoom') : t('back')}
          </button>
        </div>
      </div>
    </main>
  );
}
