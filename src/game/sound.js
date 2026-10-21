// Tiny synthesised sound effects (Web Audio), so the game ships with no audio
// files and still works offline. Every call is a no-op where audio is unavailable.

let audioContext = null;

function getContext() {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(ctx, { freq, endFreq = freq, duration, type = 'triangle', gain = 0.12, delay = 0 }) {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A short woody "tock". */
function tock(ctx, delay = 0, pitch = 1, gain = 0.1) {
  tone(ctx, { freq: 900 * pitch, endFreq: 380 * pitch, duration: 0.06, type: 'sine', gain, delay });
}

const SOUNDS = {
  select: (ctx) => tock(ctx, 0, 1.3, 0.05),
  success: (ctx) => {
    tock(ctx, 0, 1.1, 0.08);
    tone(ctx, { freq: 660, endFreq: 990, duration: 0.18, gain: 0.07, delay: 0.05 });
  },
  failure: (ctx) => {
    tock(ctx, 0, 0.7, 0.1);
    tock(ctx, 0.05, 0.6, 0.08);
    tone(ctx, { freq: 220, endFreq: 140, duration: 0.25, type: 'sine', gain: 0.08, delay: 0.04 });
  },
  drop: (ctx) => {
    for (let i = 0; i < 9; i += 1) tock(ctx, 0.32 + i * 0.045 + (i % 3) * 0.012, 0.8 + (i % 4) * 0.12, 0.06);
  },
};

export function playSound(name) {
  try {
    const ctx = getContext();
    if (ctx && SOUNDS[name]) SOUNDS[name](ctx);
  } catch {
    // Audio is optional.
  }
}
