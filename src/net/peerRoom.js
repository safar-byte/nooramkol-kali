// PeerJS (WebRTC) rooms. The public PeerJS broker is only used so the two
// browsers can find each other; game data then flows peer-to-peer.
// The host's peer id is derived from the room code, so joining needs only the code.

import Peer from 'peerjs';
import { generateRoomCode, parseMessage, pingMessage, rejectMessage, roomPeerId } from './protocol.js';

const PEER_OPTIONS = { debug: 0 };
const JOIN_TIMEOUT_MS = 15_000;
const MAX_CODE_ATTEMPTS = 5;
const HEARTBEAT_MS = 2_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

function friendlyError(err) {
  const type = err?.type ?? '';
  let message;
  switch (type) {
    case 'peer-unavailable':
      message = 'No room with that code. Check the code, or ask your friend to create the room again.';
      break;
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      message = "Couldn't reach the matchmaking server. Check your internet connection and try again.";
      break;
    case 'browser-incompatible':
      message = "This browser doesn't support peer-to-peer connections.";
      break;
    case 'webrtc':
    case 'timeout':
      message =
        "Couldn't connect to the other player. Some networks (offices, schools, some mobile data) block peer-to-peer connections — try another network.";
      break;
    default:
      message = err?.message || 'Something went wrong with the connection.';
  }
  const error = new Error(message);
  error.type = type;
  return error;
}

function encode(msg) {
  return JSON.stringify(msg);
}

/**
 * WebRTC can take a long time (or forever) to report a peer that vanished, e.g.
 * a closed tab or lost network. Ping regularly and give up after a silence.
 */
function keepAlive(conn, onDead) {
  let lastHeard = Date.now();
  conn.on('data', () => {
    lastHeard = Date.now();
  });
  const timer = setInterval(() => {
    if (!conn.open) return;
    conn.send(encode(pingMessage()));
    if (Date.now() - lastHeard > HEARTBEAT_TIMEOUT_MS) {
      clearInterval(timer);
      onDead();
    }
  }, HEARTBEAT_MS);
  conn.on('close', () => clearInterval(timer));
}

/**
 * Open a room as the host. Resolves once the room code is registered.
 * @param {object} handlers
 * @param {(msg: object) => void} handlers.onMessage   Validated message from the guest.
 * @param {() => void} handlers.onPeerLeft             The guest's connection closed.
 * @param {(err: Error) => void} [handlers.onError]    Errors after the room opened.
 */
export function createRoom(handlers) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const open = () => {
      attempt += 1;
      const code = generateRoomCode();
      const peer = new Peer(roomPeerId(code), PEER_OPTIONS);
      let opened = false;
      let closed = false;
      let guest = null;

      const room = {
        code,
        send(msg) {
          if (guest?.open) guest.send(encode(msg));
        },
        close() {
          closed = true;
          guest?.close();
          peer.destroy();
        },
      };

      peer.on('open', () => {
        opened = true;
        resolve(room);
      });

      peer.on('error', (err) => {
        if (!opened && err.type === 'unavailable-id' && attempt < MAX_CODE_ATTEMPTS) {
          peer.destroy();
          open();
          return;
        }
        if (!opened) {
          peer.destroy();
          reject(friendlyError(err));
          return;
        }
        handlers.onError?.(friendlyError(err));
      });

      // Losing the broker does not drop the peer-to-peer link, but a new guest
      // could not find the room, so reconnect to it.
      peer.on('disconnected', () => {
        if (!closed && !peer.destroyed) peer.reconnect();
      });

      peer.on('connection', (conn) => {
        if (guest) {
          conn.on('open', () => {
            conn.send(encode(rejectMessage('full')));
            setTimeout(() => conn.close(), 500);
          });
          return;
        }
        guest = conn;
        conn.on('data', (data) => {
          const msg = parseMessage(data);
          if (msg) handlers.onMessage(msg);
        });
        const dropGuest = () => {
          if (guest !== conn) return;
          guest = null;
          conn.close();
          if (!closed) handlers.onPeerLeft();
        };
        conn.on('close', dropGuest);
        conn.on('error', dropGuest);
        conn.on('open', () => keepAlive(conn, dropGuest));
      });
    };

    open();
  });
}

/**
 * Join a room as the guest. Resolves once the data channel to the host is open.
 */
export function joinRoom(code, handlers) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_OPTIONS);
    let connected = false;
    let closed = false;
    let conn = null;

    const fail = (err) => {
      if (connected || closed) return;
      closed = true;
      clearTimeout(timer);
      peer.destroy();
      reject(friendlyError(err));
    };
    const timer = setTimeout(() => fail({ type: 'timeout' }), JOIN_TIMEOUT_MS);

    const room = {
      code,
      send(msg) {
        if (conn?.open) conn.send(encode(msg));
      },
      close() {
        closed = true;
        clearTimeout(timer);
        conn?.close();
        peer.destroy();
      },
    };

    let hostGone = false;
    const lostHost = () => {
      if (!connected || closed || hostGone) return;
      hostGone = true;
      conn.close();
      handlers.onPeerLeft();
    };

    peer.on('open', () => {
      conn = peer.connect(roomPeerId(code), { reliable: true });
      conn.on('open', () => {
        connected = true;
        clearTimeout(timer);
        keepAlive(conn, lostHost);
        resolve(room);
      });
      conn.on('data', (data) => {
        const msg = parseMessage(data);
        if (msg) handlers.onMessage(msg);
      });
      conn.on('close', lostHost);
      conn.on('error', (err) => fail(err));
    });

    peer.on('error', (err) => {
      if (!connected) fail(err);
      else handlers.onError?.(friendlyError(err));
    });
  });
}
