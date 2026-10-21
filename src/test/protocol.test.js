import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../game/gameReducer.js';
import { createMatch } from '../game/matchReducer.js';
import {
  generateRoomCode,
  intentMessage,
  MAX_PATH_POINTS,
  normalizeRoomCode,
  parseMessage,
  ROOM_CODE_ALPHABET,
  roomPeerId,
  stateMessage,
} from '../net/protocol.js';

const roundTrip = (msg) => parseMessage(JSON.stringify(msg));

describe('room codes', () => {
  it('generates 6-character codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      expect([...code].every((c) => ROOM_CODE_ALPHABET.includes(c))).toBe(true);
      expect(normalizeRoomCode(code)).toBe(code);
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it('normalises user input and rejects bad codes', () => {
    expect(normalizeRoomCode(' abc-def ')).toBe('ABCDEF');
    expect(normalizeRoomCode('ABC')).toBeNull();
    expect(normalizeRoomCode('ABCDE0')).toBeNull();
    expect(normalizeRoomCode(42)).toBeNull();
    expect(roomPeerId('ABCDEF')).toBe('nooramkol-kali-ABCDEF');
  });
});

describe('parseMessage', () => {
  it('rejects malformed, unknown and oversized messages', () => {
    expect(parseMessage('{not json')).toBeNull();
    expect(parseMessage('"just a string"')).toBeNull();
    expect(roundTrip({ type: 'launch-missiles' })).toBeNull();
    expect(parseMessage('x'.repeat(1_000_001))).toBeNull();
    expect(roundTrip({ type: 'hello', v: 1, name: '   ' })).toBeNull();
    expect(roundTrip({ type: 'reject', reason: 'because' })).toBeNull();
  });

  it('sanitises names', () => {
    expect(roundTrip({ type: 'hello', v: 1, name: '  Asha\u0007 the very long named player  ' })).toEqual({
      type: 'hello',
      v: 1,
      name: 'Asha the very long n',
    });
  });

  it('keeps only allowed intent fields and rejects host-only actions', () => {
    const msg = roundTrip(intentMessage({ type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001', score: 9999 }, 4));
    expect(msg).toEqual({ type: 'intent', seq: 4, action: { type: ACTIONS.BEGIN_DRAG, stickId: 'stick-001' } });
    expect(roundTrip({ ...msg, seq: -1 })).toBeNull();
    expect(roundTrip({ type: 'intent', seq: 1, action: { type: ACTIONS.PILE_VALIDATED } })).toBeNull();
    expect(roundTrip({ type: 'intent', seq: 1, action: { type: 'REMATCH', seed: 1 } })).toBeNull();
    expect(roundTrip({ type: 'intent', seq: 1, action: { type: ACTIONS.DROP_STICKS, seed: -1 } })).toBeNull();
  });

  it('validates move paths', () => {
    const ok = { type: ACTIONS.MOVE_SUCCEEDED, stickId: 'stick-001', path: [{ x: 1, y: 2 }] };
    expect(roundTrip({ type: 'intent', seq: 1, action: ok }).action.path).toEqual([{ x: 1, y: 2 }]);
    const nan = { ...ok, path: [{ x: 'a', y: 2 }] };
    expect(roundTrip({ type: 'intent', seq: 1, action: nan })).toBeNull();
    const long = { ...ok, path: Array.from({ length: MAX_PATH_POINTS + 1 }, () => ({ x: 1, y: 1 })) };
    expect(roundTrip({ type: 'intent', seq: 1, action: long })).toBeNull();
  });

  it('accepts a real match snapshot and rejects a broken one', () => {
    const match = createMatch({
      players: [
        { id: 'host', name: 'A' },
        { id: 'guest', name: 'B' },
      ],
      hostId: 'host',
      seed: 3,
    });
    expect(roundTrip(stateMessage(match, 3))).toEqual({ type: 'state', match, ack: 3 });
    expect(roundTrip({ ...stateMessage(match), ack: 1.5 })).toBeNull();
    expect(roundTrip(stateMessage({ ...match, players: [] }))).toBeNull();
    expect(roundTrip(stateMessage({ ...match, game: { ...match.game, sticks: [] } }))).toBeNull();
  });

  it('accepts drag updates and drag end', () => {
    expect(roundTrip({ type: 'drag', stickId: 'stick-001', x: 10, y: 20 })).toEqual({
      type: 'drag',
      stickId: 'stick-001',
      x: 10,
      y: 20,
    });
    expect(roundTrip({ type: 'drag', stickId: null })).toEqual({ type: 'drag', stickId: null });
    expect(roundTrip({ type: 'ping' })).toEqual({ type: 'ping' });
    expect(roundTrip({ type: 'drag', stickId: 'stick-001', x: Infinity, y: 0 })).toBeNull();
  });
});
