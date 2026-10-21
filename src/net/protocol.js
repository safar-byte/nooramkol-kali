// Wire protocol between the host and guest browsers. Everything received from
// the other peer is untrusted: `parseMessage` returns a sanitised copy, or null.

import { TOTAL_STICKS } from '../game/constants.js';
import { ACTIONS } from '../game/gameReducer.js';

export const PROTOCOL_VERSION = 1;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_MESSAGE_CHARS = 1_000_000;
export const MAX_PATH_POINTS = 20_000;
export const MAX_NAME_LENGTH = 20;

const INTENT_TYPES = new Set([
  ACTIONS.DROP_STICKS,
  ACTIONS.RETRY_DROP,
  ACTIONS.BEGIN_DRAG,
  ACTIONS.CANCEL_DRAG,
  ACTIONS.MOVE_SUCCEEDED,
  ACTIONS.MOVE_FAILED,
  ACTIONS.PAUSE_GAME,
  ACTIONS.RESUME_GAME,
]);

const REJECT_REASONS = new Set(['full', 'version']);

export function generateRoomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercase and strip separators; returns null unless it is a well-formed code. */
export function normalizeRoomCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every((c) => ROOM_CODE_ALPHABET.includes(c)) ? code : null;
}

export function roomPeerId(code) {
  return `nooramkol-kali-${code}`;
}

export function sanitizeName(name) {
  if (typeof name !== 'string') return null;
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return clean.length > 0 ? clean : null;
}

// ---- builders --------------------------------------------------------------

export const helloMessage = (name) => ({ type: 'hello', v: PROTOCOL_VERSION, name });
export const welcomeMessage = (hostName) => ({ type: 'welcome', v: PROTOCOL_VERSION, hostName });
export const rejectMessage = (reason) => ({ type: 'reject', reason });
/** `ack` is the sequence number of the last guest intent the host has applied. */
export const stateMessage = (match, ack = 0) => ({ type: 'state', match, ack });
export const leaveMessage = () => ({ type: 'leave' });
export const pingMessage = () => ({ type: 'ping' });
export const dragMessage = (drag) =>
  drag ? { type: 'drag', stickId: drag.stickId, x: drag.x, y: drag.y } : { type: 'drag', stickId: null };

export function intentMessage(action, seq) {
  return { type: 'intent', seq, action: sanitizeIntentAction(action) };
}

// ---- validation ------------------------------------------------------------

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const isCoord = (n) => isFiniteNumber(n) && n >= -100 && n <= 2000;
const isSeq = (n) => Number.isInteger(n) && n >= 0;
const isStickId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 32;

function sanitizePath(path) {
  if (!Array.isArray(path) || path.length === 0 || path.length > MAX_PATH_POINTS) return null;
  const clean = [];
  for (const p of path) {
    if (!p || !isCoord(p.x) || !isCoord(p.y)) return null;
    clean.push({ x: p.x, y: p.y });
  }
  return clean;
}

/** Keep only the fields a remote player is allowed to send for each action. */
export function sanitizeIntentAction(action) {
  if (!action || !INTENT_TYPES.has(action.type)) return null;
  switch (action.type) {
    case ACTIONS.DROP_STICKS:
      return Number.isInteger(action.seed) && action.seed >= 0 && action.seed <= 0xffffffff
        ? { type: action.type, seed: action.seed }
        : null;
    case ACTIONS.BEGIN_DRAG:
      return isStickId(action.stickId) ? { type: action.type, stickId: action.stickId } : null;
    case ACTIONS.MOVE_SUCCEEDED:
    case ACTIONS.MOVE_FAILED: {
      const path = sanitizePath(action.path);
      return isStickId(action.stickId) && path ? { type: action.type, stickId: action.stickId, path } : null;
    }
    default:
      return { type: action.type };
  }
}

function isValidMatchSnapshot(match) {
  return (
    match &&
    typeof match === 'object' &&
    Array.isArray(match.players) &&
    match.players.length === 2 &&
    match.players.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.stats) &&
    Number.isInteger(match.currentPlayerIndex) &&
    match.currentPlayerIndex >= 0 &&
    match.currentPlayerIndex < 2 &&
    match.game &&
    Array.isArray(match.game.sticks) &&
    match.game.sticks.length === TOTAL_STICKS &&
    match.game.sticks.every((s) => isStickId(s.id) && isFiniteNumber(s.x) && isFiniteNumber(s.y)) &&
    typeof match.game.phase === 'string' &&
    typeof match.game.layout === 'string' &&
    typeof match.game.difficulty === 'string'
  );
}

/**
 * Parse and validate one incoming message (JSON string or object).
 * Returns a sanitised message, or null when it should be ignored.
 */
export function parseMessage(raw) {
  let msg = raw;
  try {
    if (typeof raw === 'string') {
      if (raw.length > MAX_MESSAGE_CHARS) return null;
      msg = JSON.parse(raw);
    } else if (JSON.stringify(raw).length > MAX_MESSAGE_CHARS) {
      return null;
    }
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;

  switch (msg.type) {
    case 'hello': {
      const name = sanitizeName(msg.name);
      return Number.isInteger(msg.v) && name ? { type: 'hello', v: msg.v, name } : null;
    }
    case 'welcome': {
      const hostName = sanitizeName(msg.hostName);
      return Number.isInteger(msg.v) && hostName ? { type: 'welcome', v: msg.v, hostName } : null;
    }
    case 'reject':
      return REJECT_REASONS.has(msg.reason) ? { type: 'reject', reason: msg.reason } : null;
    case 'state': {
      const ack = msg.ack ?? 0;
      return isValidMatchSnapshot(msg.match) && isSeq(ack) ? { type: 'state', match: msg.match, ack } : null;
    }
    case 'intent': {
      const action = sanitizeIntentAction(msg.action);
      return action && isSeq(msg.seq) ? { type: 'intent', seq: msg.seq, action } : null;
    }
    case 'drag':
      if (msg.stickId === null) return { type: 'drag', stickId: null };
      return isStickId(msg.stickId) && isCoord(msg.x) && isCoord(msg.y)
        ? { type: 'drag', stickId: msg.stickId, x: msg.x, y: msg.y }
        : null;
    case 'leave':
      return { type: 'leave' };
    case 'ping':
      return { type: 'ping' };
    default:
      return null;
  }
}
