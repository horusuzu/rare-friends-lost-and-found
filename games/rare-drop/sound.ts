/**
 * Soft synthesised cues for Rare Drop. WebAudio only, no audio files.
 * The AudioContext is created lazily by unlock(), which callers run from a user gesture.
 */
export type DropSfx = 'drop' | 'land' | 'merge' | 'big' | 'friend' | 'combo' | 'danger' | 'over' | 'best';

interface Tone { freq: number; to?: number; at?: number; len: number; wave?: OscillatorType; gain?: number; attack?: number }
interface Noise { noise: number; to?: number; at?: number; len: number; q?: number; gain?: number; attack?: number }
type Part = Tone | Noise;
interface Cue { parts: readonly Part[]; gap?: number }

/** Simultaneous cues; the oldest is released when a new one would exceed this. */
export const MAX_VOICES = 6;
const VOLUME = 0.32, MIN_ATTACK = 0.006, SILENT = 0.0001, TAIL = 0.03;

const note = (freq: number, at: number, len: number, gain = 0.7, wave: OscillatorType = 'triangle'): Tone => ({ freq, at, len, gain, wave });
const CUES: Readonly<Record<DropSfx, Cue>> = {
  drop: { parts: [{ freq: 700, to: 460, len: 0.09, gain: 0.45 }], gap: 0.05 },
  land: { parts: [{ freq: 170, to: 105, len: 0.09, gain: 0.8, wave: 'sine', attack: 0.004 }, { noise: 900, len: 0.05, q: 0.7, gain: 0.25 }], gap: 0.07 },
  merge: { parts: [{ freq: 330, len: 0.16, gain: 0.6 }, { freq: 660, at: 0.02, len: 0.12, gain: 0.22, wave: 'sine' }], gap: 0.03 },
  big: { parts: [note(523, 0.06, 0.12, 0.4, 'sine'), note(659, 0.13, 0.12, 0.4, 'sine'), note(784, 0.2, 0.24, 0.45, 'sine'), { noise: 5000, to: 9000, at: 0.06, len: 0.3, q: 2, gain: 0.08 }] },
  friend: { parts: [note(523, 0.05, 0.11), note(659, 0.15, 0.11), note(784, 0.25, 0.11), note(1047, 0.35, 0.4, 0.65), note(784, 0.35, 0.4, 0.3, 'sine'), { noise: 6000, to: 11000, at: 0.35, len: 0.45, q: 2, gain: 0.1 }] },
  combo: { parts: [note(880, 0, 0.06, 0.4, 'sine'), note(1175, 0.06, 0.1, 0.4, 'sine')], gap: 0.08 },
  danger: { parts: [{ freq: 392, len: 0.12, gain: 0.35, wave: 'square', attack: 0.012 }], gap: 0.2 },
  over: { parts: [note(523, 0, 0.16, 0.5), note(415, 0.16, 0.16, 0.5), note(349, 0.32, 0.16, 0.5), note(262, 0.48, 0.5, 0.55)] },
  best: { parts: [note(659, 0, 0.1, 0.5), note(784, 0.1, 0.1, 0.5), note(988, 0.2, 0.1, 0.5), note(1319, 0.3, 0.45, 0.55), note(988, 0.3, 0.45, 0.25, 'sine')] },
};

export interface PlayOptions { pitch?: number; gain?: number; delay?: number }
export interface DropSound {
  readonly enabled: boolean; readonly unlocked: boolean; readonly voices: number;
  /** Create or resume the context. Call from a user gesture; returns whether audio is available. */
  unlock(): boolean;
  /** The player's saved on/off setting. */
  setEnabled(on: boolean): void;
  /** Temporary silence for a paused runtime or a hidden page. */
  setSilenced(silent: boolean): void;
  play(id: DropSfx, options?: PlayOptions): boolean;
  stopAll(): void;
  dispose(): void;
}

interface Voice { out: GainNode; sources: AudioScheduledSourceNode[]; end: number }
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function defaultContext(): AudioContext | null {
  const Context = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Context ? new Context() : null;
}

export function createDropSound({ createContext = defaultContext }: { createContext?: () => AudioContext | null } = {}): DropSound {
  let ctx: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null;
  let enabled = true, silenced = false, disposed = false, failed = false;
  let voices: Voice[] = [];
  const last = new Map<DropSfx, number>();
  const audible = () => enabled && !silenced && !disposed;

  function release(voice: Voice) {
    try { voice.out.disconnect(); } catch { /* already disconnected */ }
    for (const source of voice.sources) try { source.stop(); } catch { /* already stopped */ }
  }
  function stopAll() { for (const voice of voices) release(voice); voices = []; }
  function apply() {
    if (!ctx) return;
    if (audible()) { if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined); return; }
    stopAll();
    if (ctx.state === 'running') void ctx.suspend().catch(() => undefined);
  }
  function noiseBuffer(c: AudioContext): AudioBuffer {
    if (noise) return noise;
    noise = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate)), c.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 0x2545f491;
    for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
    return noise;
  }
  function schedule(c: AudioContext, part: Part, start: number, pitch: number, gain: number, out: GainNode): [AudioScheduledSourceNode, number] {
    const at = start + (part.at ?? 0), len = part.len, attack = clamp(part.attack ?? MIN_ATTACK, MIN_ATTACK, len / 2);
    const env = c.createGain(), peak = clamp((part.gain ?? 0.6) * gain, SILENT * 10, 1);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + attack);
    env.gain.exponentialRampToValueAtTime(SILENT, at + len);
    let source: AudioScheduledSourceNode;
    if ('noise' in part) {
      const src = c.createBufferSource(), filter = c.createBiquadFilter();
      src.buffer = noiseBuffer(c); src.loop = true;
      filter.type = 'bandpass'; filter.Q.value = part.q ?? 1;
      filter.frequency.setValueAtTime(part.noise * pitch, at);
      if (part.to) filter.frequency.exponentialRampToValueAtTime(part.to * pitch, at + len);
      src.connect(filter).connect(env); source = src;
    } else {
      const osc = c.createOscillator();
      osc.type = part.wave ?? 'triangle';
      osc.frequency.setValueAtTime(part.freq * pitch, at);
      if (part.to) osc.frequency.exponentialRampToValueAtTime(part.to * pitch, at + len);
      osc.connect(env); source = osc;
    }
    env.connect(out);
    source.start(at); source.stop(at + len + TAIL);
    return [source, at + len + TAIL];
  }

  return {
    get enabled() { return enabled; },
    get unlocked() { return ctx !== null; },
    get voices() { if (ctx) { const now = ctx.currentTime; voices = voices.filter(v => v.end > now); } return voices.length; },
    unlock() {
      if (disposed || !enabled || failed) return false;
      if (!ctx) {
        try {
          ctx = createContext();
          if (!ctx) { failed = true; return false; }
          const limiter = ctx.createDynamicsCompressor();
          limiter.threshold.value = -14; limiter.knee.value = 10; limiter.ratio.value = 6;
          limiter.attack.value = 0.003; limiter.release.value = 0.2;
          master = ctx.createGain(); master.gain.value = VOLUME;
          master.connect(limiter).connect(ctx.destination);
        } catch { ctx = null; master = null; failed = true; return false; }
      }
      apply();
      return true;
    },
    setEnabled(on) { enabled = on; apply(); },
    setSilenced(silent) { silenced = silent; apply(); },
    play(id, { pitch = 1, gain = 1, delay = 0 } = {}) {
      if (!ctx || !master || !audible()) return false;
      const now = ctx.currentTime, cue = CUES[id];
      if (cue.gap && now - (last.get(id) ?? -Infinity) < cue.gap) return false;
      last.set(id, now);
      voices = voices.filter(v => v.end > now);
      while (voices.length >= MAX_VOICES) release(voices.shift()!);
      try {
        const out = ctx.createGain(); out.gain.value = 1; out.connect(master);
        const voice: Voice = { out, sources: [], end: now };
        const start = now + 0.005 + Math.max(0, delay), safePitch = clamp(pitch, 0.25, 4), safeGain = clamp(gain, 0, 1);
        for (const part of cue.parts) {
          const [source, end] = schedule(ctx, part, start, safePitch, safeGain, out);
          voice.sources.push(source); voice.end = Math.max(voice.end, end);
        }
        voices.push(voice);
        return true;
      } catch { return false; }
    },
    stopAll,
    dispose() {
      if (disposed) return;
      disposed = true; stopAll();
      if (ctx) void ctx.close().catch(() => undefined);
      ctx = null; master = null;
    },
  };
}
