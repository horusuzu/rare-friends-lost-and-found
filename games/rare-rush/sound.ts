/**
 * Synthesised ride sound for Rare Rush: a rushing-wind loop that follows speed plus short cues.
 * WebAudio only, no audio files. The AudioContext is created lazily by unlock(), called from a user gesture.
 */
export type RushSfx = 'launch' | 'perfect-launch' | 'clack' | 'turbo' | 'item' | 'boost' | 'spark' | 'perfect' | 'good' | 'bad'
  | 'scream' | 'checkpoint' | 'finish' | 'best';

interface Tone { freq: number; to?: number; at?: number; len: number; wave?: OscillatorType; gain?: number; attack?: number }
interface Noise { noise: number; to?: number; at?: number; len: number; q?: number; gain?: number; attack?: number }
type Part = Tone | Noise;
interface Cue { parts: readonly Part[]; gap?: number }

/** Simultaneous cues (the wind loop is separate); the oldest is released when a new one would exceed this. */
export const MAX_VOICES = 6;
const VOLUME = 0.32, MIN_ATTACK = 0.006, SILENT = 0.0001, TAIL = 0.03;
/** Wind level and brightness per metre per second, as in the original wind rush. */
const WIND_FULL = 170, WIND_MAX = 0.65, WIND_ON = 0.5;

const note = (freq: number, at: number, len: number, gain = 0.6, wave: OscillatorType = 'triangle'): Tone => ({ freq, at, len, gain, wave });
const CUES: Readonly<Record<RushSfx, Cue>> = {
  'launch': { parts: [{ noise: 400, to: 3200, len: 0.7, q: 1.2, gain: 0.55, attack: 0.05 }, { freq: 95, to: 55, len: 0.3, gain: 0.7, wave: 'sine' }] },
  'perfect-launch': { parts: [{ noise: 400, to: 4200, len: 0.8, q: 1.2, gain: 0.6, attack: 0.05 }, { freq: 95, to: 50, len: 0.35, gain: 0.75, wave: 'sine' },
    note(784, 0.08, 0.1, 0.4), note(988, 0.16, 0.1, 0.4), note(1319, 0.24, 0.3, 0.45)] },
  'clack': { parts: [{ noise: 2600, len: 0.03, q: 5, gain: 0.5, attack: 0.002 }, { freq: 1300, to: 900, len: 0.025, gain: 0.18, wave: 'square', attack: 0.002 }], gap: 0.08 },
  'turbo': { parts: [{ freq: 170, to: 760, len: 0.55, gain: 0.3, wave: 'sawtooth', attack: 0.03 }, { noise: 700, to: 5200, len: 0.6, q: 1.5, gain: 0.35, attack: 0.04 }], gap: 0.2 },
  'item': { parts: [note(988, 0, 0.07, 0.45, 'sine'), note(1319, 0.07, 0.14, 0.45, 'sine')], gap: 0.1 },
  'boost': { parts: [{ freq: 440, to: 880, len: 0.25, gain: 0.45 }, { noise: 1500, to: 4500, len: 0.3, q: 1.5, gain: 0.25 }], gap: 0.15 },
  'spark': { parts: [note(1568, 0, 0.07, 0.22, 'sine')], gap: 0.025 },
  'perfect': { parts: [note(659, 0, 0.09, 0.5), note(988, 0.07, 0.09, 0.5), note(1319, 0.14, 0.28, 0.5, 'sine')], gap: 0.2 },
  'good': { parts: [note(523, 0, 0.08, 0.35), note(659, 0.06, 0.12, 0.3, 'sine')], gap: 0.2 },
  'bad': { parts: [{ freq: 120, to: 50, len: 0.32, gain: 0.8, wave: 'sine', attack: 0.004 }, { noise: 500, to: 180, len: 0.3, q: 0.8, gain: 0.45, attack: 0.004 }], gap: 0.2 },
  'scream': { parts: [{ freq: 520, to: 1100, len: 0.75, gain: 0.3, attack: 0.05 }, { freq: 528, to: 1120, len: 0.75, gain: 0.22, wave: 'sawtooth', attack: 0.06 },
    { noise: 1500, to: 4200, len: 0.8, q: 1, gain: 0.2, attack: 0.1 }], gap: 0.5 },
  'checkpoint': { parts: [note(880, 0, 0.09, 0.45, 'sine'), note(1175, 0.09, 0.2, 0.45, 'sine')], gap: 0.3 },
  'finish': { parts: [note(523, 0, 0.12, 0.5), note(659, 0.12, 0.12, 0.5), note(784, 0.24, 0.12, 0.5), note(1047, 0.36, 0.5, 0.55), note(523, 0.36, 0.5, 0.25, 'sine')] },
  'best': { parts: [note(659, 0, 0.1, 0.5), note(784, 0.1, 0.1, 0.5), note(988, 0.2, 0.1, 0.5), note(1319, 0.3, 0.45, 0.55), note(988, 0.3, 0.45, 0.25, 'sine')] },
};

export interface PlayOptions { pitch?: number; gain?: number; delay?: number }
export interface RushSound {
  readonly enabled: boolean; readonly unlocked: boolean; readonly voices: number; readonly windPlaying: boolean;
  /** Create or resume the context. Call from a user gesture; returns whether audio is available. */
  unlock(): boolean;
  /** The player's saved on/off setting. */
  setEnabled(on: boolean): void;
  /** Temporary silence for a paused runtime or a hidden page. */
  setSilenced(silent: boolean): void;
  /** Rushing wind for the current speed in m/s; zero stops the loop. */
  setWind(speed: number): void;
  play(id: RushSfx, options?: PlayOptions): boolean;
  stopAll(): void;
  dispose(): void;
}

interface Voice { out: GainNode; sources: AudioScheduledSourceNode[]; end: number }
interface Wind { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode }
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function defaultContext(): AudioContext | null {
  const Context = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Context ? new Context() : null;
}

export function createRushSound({ createContext = defaultContext }: { createContext?: () => AudioContext | null } = {}): RushSound {
  let ctx: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null, wind: Wind | null = null;
  let enabled = true, silenced = false, disposed = false, failed = false;
  let voices: Voice[] = [];
  const last = new Map<RushSfx, number>();
  const audible = () => enabled && !silenced && !disposed;

  function release(voice: Voice) {
    try { voice.out.disconnect(); } catch { /* already disconnected */ }
    for (const source of voice.sources) try { source.stop(); } catch { /* already stopped */ }
  }
  function stopAll() { for (const voice of voices) release(voice); voices = []; }
  /** Fade the wind out briefly when still audible; cut it at once when muting, pausing or closing. */
  function stopWind(fade: boolean) {
    if (!wind) return;
    const { source, gain } = wind;
    wind = null;
    try {
      if (fade && ctx) { const now = ctx.currentTime; gain.gain.setTargetAtTime(0, now, 0.06); source.stop(now + 0.35); }
      else { gain.disconnect(); source.stop(); }
    } catch { /* already stopped */ }
  }
  function apply() {
    if (!ctx) return;
    if (audible()) { if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined); return; }
    stopAll(); stopWind(false);
    if (ctx.state === 'running') void ctx.suspend().catch(() => undefined);
  }
  function noiseBuffer(c: AudioContext): AudioBuffer {
    if (noise) return noise;
    noise = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * 2)), c.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 0x2545f491;
    for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
    return noise;
  }
  function schedule(c: AudioContext, part: Part, start: number, pitch: number, gain: number, out: GainNode): [AudioScheduledSourceNode, number] {
    const at = start + (part.at ?? 0), len = part.len, attack = clamp(part.attack ?? MIN_ATTACK, 0.002, len / 2);
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
    get windPlaying() { return wind !== null; },
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
    setWind(speed) {
      if (!ctx || !master || !audible() || !Number.isFinite(speed) || speed < WIND_ON) { stopWind(Boolean(ctx) && audible()); return; }
      try {
        if (!wind) {
          const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
          source.buffer = noiseBuffer(ctx); source.loop = true;
          filter.type = 'bandpass'; filter.Q.value = 0.8; gain.gain.value = 0;
          source.connect(filter).connect(gain).connect(master);
          source.start();
          wind = { source, filter, gain };
        }
        const now = ctx.currentTime;
        wind.gain.gain.setTargetAtTime(clamp(speed / WIND_FULL, 0, WIND_MAX), now, 0.08);
        wind.filter.frequency.setTargetAtTime(250 + speed * 28, now, 0.1);
      } catch { stopWind(false); }
    },
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
      disposed = true; stopAll(); stopWind(false);
      if (ctx) void ctx.close().catch(() => undefined);
      ctx = null; master = null;
    },
  };
}
