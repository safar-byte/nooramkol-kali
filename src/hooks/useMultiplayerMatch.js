import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIONS } from '../game/gameReducer.js';
import { applyPending, createMatch, MATCH_ACTIONS, matchReducer } from '../game/matchReducer.js';
import { randomSeed } from '../game/random.js';
import { resolvePick } from '../game/resolvePick.js';
import { createRoom, joinRoom } from '../net/peerRoom.js';
import {
  dragMessage,
  helloMessage,
  intentMessage,
  leaveMessage,
  PROTOCOL_VERSION,
  rejectMessage,
  stateMessage,
  welcomeMessage,
} from '../net/protocol.js';

export const HOST_ID = 'host';
export const GUEST_ID = 'guest';

const PAUSABLE = new Set(['bundling', 'foul-retry', 'playing']);
const DRAG_INTERVAL_MS = 33;

const REJECT_TEXT = {
  full: 'That room already has two players.',
  version: 'Your friend is running a different version of the game. Both of you should reload the page.',
};

/**
 * Online 2-player session. The host runs `matchReducer` authoritatively and
 * broadcasts snapshots; the guest predicts its own moves and sends intents.
 *
 * status: idle | creating | waiting | joining | connected | opponent-left | disconnected | error
 */
export function useMultiplayerMatch() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [role, setRole] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [opponentName, setOpponentName] = useState(null);
  const [match, setMatch] = useState(null);

  const roomRef = useRef(null);
  const roleRef = useRef(null);
  const matchRef = useRef(null);
  const nameRef = useRef('');
  const opponentNameRef = useRef(null);
  const remoteDragRef = useRef(null);
  const lastDragSentRef = useRef(0);
  // Guest prediction: intents not yet acknowledged by the host.
  const intentSeqRef = useRef(0);
  const pendingRef = useRef([]);
  // Host: sequence number of the last guest intent applied.
  const lastGuestSeqRef = useRef(0);

  const myId = role === GUEST_ID ? GUEST_ID : HOST_ID;

  const setMatchState = useCallback((next) => {
    matchRef.current = next;
    setMatch(next);
  }, []);

  /** Host only: apply a change and broadcast it. */
  const commit = useCallback(
    (next) => {
      if (next === matchRef.current) return;
      setMatchState(next);
      roomRef.current?.send(stateMessage(next, lastGuestSeqRef.current));
    },
    [setMatchState],
  );

  const reset = useCallback(() => {
    roomRef.current?.close();
    roomRef.current = null;
    roleRef.current = null;
    opponentNameRef.current = null;
    remoteDragRef.current = null;
    matchRef.current = null;
    intentSeqRef.current = 0;
    pendingRef.current = [];
    lastGuestSeqRef.current = 0;
    setRole(null);
    setRoomCode(null);
    setOpponentName(null);
    setMatch(null);
    setError(null);
  }, []);

  // ---- host -----------------------------------------------------------------

  const hostPeerLeft = useCallback(() => {
    remoteDragRef.current = null;
    setStatus('opponent-left');
    const current = matchRef.current;
    if (current && PAUSABLE.has(current.game.phase) && !current.game.paused) {
      commit(matchReducer(current, { playerId: HOST_ID, action: { type: ACTIONS.PAUSE_GAME } }));
    }
  }, [commit]);

  const hostMessage = useCallback(
    (msg) => {
      const room = roomRef.current;
      if (!room) return;
      switch (msg.type) {
        case 'hello': {
          if (msg.v !== PROTOCOL_VERSION) {
            room.send(rejectMessage('version'));
            return;
          }
          opponentNameRef.current = msg.name;
          setOpponentName(msg.name);
          setStatus('connected');
          lastGuestSeqRef.current = 0; // a (re)joining guest restarts its sequence
          room.send(welcomeMessage(nameRef.current));
          if (matchRef.current) room.send(stateMessage(matchRef.current, 0));
          break;
        }
        case 'intent': {
          const current = matchRef.current;
          if (!current) return;
          lastGuestSeqRef.current = msg.seq;
          let { action } = msg;
          // Never trust the guest's verdict on a pick: recompute it from the path.
          if (action.type === ACTIONS.MOVE_SUCCEEDED || action.type === ACTIONS.MOVE_FAILED) {
            action = { ...resolvePick(current.game, action), now: Date.now() };
          }
          const next = matchReducer(current, { playerId: GUEST_ID, action });
          if (next !== current) commit(next);
          else room.send(stateMessage(current, msg.seq)); // correct the guest's prediction
          break;
        }
        case 'drag':
          remoteDragRef.current = msg.stickId ? msg : null;
          break;
        case 'leave':
          hostPeerLeft();
          break;
        default:
      }
    },
    [commit, hostPeerLeft],
  );

  const hostRoom = useCallback(
    async (name) => {
      reset();
      nameRef.current = name;
      roleRef.current = HOST_ID;
      setRole(HOST_ID);
      setStatus('creating');
      try {
        const room = await createRoom({
          onMessage: (msg) => hostMessage(msg),
          onPeerLeft: () => hostPeerLeft(),
          onError: (err) => setError(err.message),
        });
        if (roleRef.current !== HOST_ID) {
          room.close(); // left while the room was opening
          return;
        }
        roomRef.current = room;
        setRoomCode(room.code);
        setStatus('waiting');
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    },
    [hostMessage, hostPeerLeft, reset],
  );

  const startMatch = useCallback(
    ({ difficulty, layout }) => {
      if (roleRef.current !== HOST_ID || !opponentNameRef.current) return;
      commit(
        createMatch({
          players: [
            { id: HOST_ID, name: nameRef.current },
            { id: GUEST_ID, name: opponentNameRef.current },
          ],
          hostId: HOST_ID,
          difficulty,
          layout,
          seed: randomSeed(),
          now: Date.now(),
        }),
      );
    },
    [commit],
  );

  const rematch = useCallback(() => {
    const current = matchRef.current;
    if (roleRef.current !== HOST_ID || !current) return;
    commit(
      matchReducer(current, {
        playerId: HOST_ID,
        action: { type: MATCH_ACTIONS.REMATCH, seed: randomSeed(), now: Date.now() },
      }),
    );
  }, [commit]);

  // ---- guest ----------------------------------------------------------------

  const guestMessage = useCallback(
    (msg) => {
      switch (msg.type) {
        case 'welcome':
          if (msg.v !== PROTOCOL_VERSION) {
            setError(REJECT_TEXT.version);
            setStatus('error');
            return;
          }
          opponentNameRef.current = msg.hostName;
          setOpponentName(msg.hostName);
          setStatus('connected');
          break;
        case 'state': {
          pendingRef.current = pendingRef.current.filter((p) => p.seq > msg.ack);
          setMatchState(applyPending(msg.match, pendingRef.current, GUEST_ID));
          if (!msg.match.game.selectedStickId) remoteDragRef.current = null;
          break;
        }
        case 'reject':
          setError(REJECT_TEXT[msg.reason]);
          setStatus('error');
          roomRef.current?.close();
          roomRef.current = null;
          break;
        case 'drag':
          remoteDragRef.current = msg.stickId ? msg : null;
          break;
        case 'leave':
          remoteDragRef.current = null;
          setStatus('opponent-left');
          break;
        default:
      }
    },
    [setMatchState],
  );

  const enterRoom = useCallback(
    async (code, name) => {
      reset();
      nameRef.current = name;
      roleRef.current = GUEST_ID;
      setRole(GUEST_ID);
      setRoomCode(code);
      setStatus('joining');
      try {
        const room = await joinRoom(code, {
          onMessage: (msg) => guestMessage(msg),
          onPeerLeft: () => {
            remoteDragRef.current = null;
            setStatus((s) => (s === 'opponent-left' ? s : 'disconnected'));
          },
          onError: (err) => setError(err.message),
        });
        if (roleRef.current !== GUEST_ID) {
          room.close();
          return;
        }
        roomRef.current = room;
        room.send(helloMessage(name));
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    },
    [guestMessage, reset],
  );

  /** Guest: reconnect to the same room after a dropped connection. */
  const reconnect = useCallback(async () => {
    const code = roomCode;
    const name = nameRef.current;
    const keep = matchRef.current;
    if (!code || roleRef.current !== GUEST_ID) return;
    roomRef.current?.close();
    roomRef.current = null;
    intentSeqRef.current = 0;
    pendingRef.current = [];
    setStatus('joining');
    setError(null);
    try {
      const room = await joinRoom(code, {
        onMessage: (msg) => guestMessage(msg),
        onPeerLeft: () => setStatus('disconnected'),
        onError: (err) => setError(err.message),
      });
      roomRef.current = room;
      if (keep) setMatchState(keep);
      room.send(helloMessage(name));
    } catch (err) {
      setError(err.message);
      setStatus('disconnected');
    }
  }, [guestMessage, roomCode, setMatchState]);

  // ---- shared ---------------------------------------------------------------

  /** Stable dispatch used by the board for both roles. */
  const sendAction = useCallback(
    (action) => {
      const current = matchRef.current;
      if (!current) return;
      if (roleRef.current === HOST_ID) {
        commit(matchReducer(current, { playerId: HOST_ID, action }));
        return;
      }
      const next = matchReducer(current, { playerId: GUEST_ID, action });
      if (next === current) return;
      setMatchState(next);
      intentSeqRef.current += 1;
      pendingRef.current.push({ seq: intentSeqRef.current, action });
      roomRef.current?.send(intentMessage(action, intentSeqRef.current));
    },
    [commit, setMatchState],
  );

  const sendDrag = useCallback((drag) => {
    const now = performance.now();
    if (drag && now - lastDragSentRef.current < DRAG_INTERVAL_MS) return;
    lastDragSentRef.current = drag ? now : 0;
    roomRef.current?.send(dragMessage(drag && { stickId: drag.stickId, x: drag.x, y: drag.y }));
  }, []);

  const getRemoteDrag = useCallback(() => remoteDragRef.current, []);

  const leave = useCallback(() => {
    roomRef.current?.send(leaveMessage());
    // Give the leave message a moment to flush before tearing down.
    const room = roomRef.current;
    roomRef.current = null;
    setTimeout(() => room?.close(), 200);
    reset();
    setStatus('idle');
  }, [reset]);

  // Tell the other player right away when this page goes away.
  useEffect(() => {
    const onPageHide = () => roomRef.current?.send(leaveMessage());
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      roomRef.current?.close();
    };
  }, []);

  return {
    status,
    error,
    role,
    roomCode,
    myId,
    myName: nameRef.current,
    opponentName,
    match,
    isHost: role === HOST_ID,
    hostRoom,
    enterRoom,
    reconnect,
    startMatch,
    rematch,
    sendAction,
    sendDrag,
    getRemoteDrag,
    leave,
  };
}
