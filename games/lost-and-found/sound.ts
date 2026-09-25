/**
 * Our Little Island sound effects: gentle synthesised cues (soft sine and triangle tones, a little
 * filtered noise; no audio files). The AudioContext is created only by unlock(), called from a user
 * gesture. Voices are capped, every tone fades in and out, and the player falls silent while muted,
 * paused or hidden.
 */
import type {Life} from './life.js';

/** One tone. f: Hz (for noise, the band-pass centre); d: seconds; at: start offset (default: after the previous tone). */
export interface Tone { f: number; d: number; at?: number; level?: number; to?: number; wave?: 'sine' | 'triangle' | 'square' | 'noise' }
export type Cue = readonly Tone[];

interface ParamLike { value: number; setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown; exponentialRampToValueAtTime(v: number, t: number): unknown }
interface NodeLike { connect(next: never): unknown; disconnect(): void }
interface SourceLike extends NodeLike { start(when?: number): void; stop(when?: number): void }
export interface AudioContextLike {
  state: string; currentTime: number; sampleRate: number; destination: unknown;
  createGain(): NodeLike & { gain: ParamLike };
  createOscillator(): SourceLike & { type: string; frequency: ParamLike };
  createBufferSource(): SourceLike & { buffer: unknown };
  createBiquadFilter(): NodeLike & { type: string; frequency: ParamLike; Q: ParamLike };
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(channel: number): Float32Array };
  resume(): Promise<void>; suspend(): Promise<void>; close(): Promise<void>;
}
export interface SoundOptions { createContext?: () => AudioContextLike | null; maxVoices?: number; volume?: number }
export interface Sound<Id extends string> {
  readonly enabled: boolean;
  /** Call from a user gesture: creates (or resumes) the AudioContext. Returns false if audio is off or unavailable. */
  unlock(): boolean;
  /** Plays a cue now; false when muted, suspended, locked, over the voice cap or unknown. */
  play(id: Id): boolean;
  setEnabled(on: boolean): void;
  /** Paused game or hidden page: cut running voices and suspend the context until released. */
  setSuspended(suspended: boolean): void;
  close(): void;
}

const SILENT = 0.0001, TAIL = 0.03;
const defaultContext = (): AudioContextLike | null => {
  const Ctor = (globalThis as { AudioContext?: new () => unknown; webkitAudioContext?: new () => unknown }).AudioContext
    ?? (globalThis as { webkitAudioContext?: new () => unknown }).webkitAudioContext;
  return Ctor ? new Ctor() as AudioContextLike : null;
};

/** Seconds from the cue start to the end of its last tone. */
export function cueLength(cue: Cue): number {
  let cursor = 0, end = 0;
  for (const tone of cue) { const start = tone.at ?? cursor; cursor = start + tone.d; end = Math.max(end, cursor); }
  return end;
}

export function createSound<Id extends string>(cues: Readonly<Record<Id, Cue>>, options: SoundOptions = {}): Sound<Id> {
  const make = options.createContext ?? defaultContext, maxVoices = options.maxVoices ?? 6, volume = options.volume ?? 0.14;
  let ctx: AudioContextLike | null = null, master: (NodeLike & { gain: ParamLike }) | null = null, noise: unknown = null;
  let enabled = true, suspended = false;
  let voices: { end: number; sources: SourceLike[] }[] = [];

  const hush = () => { for (const v of voices) for (const s of v.sources) { try { s.stop(); } catch { /* already stopped */ } } voices = []; };
  const quiet = (p: Promise<void> | undefined) => { void p?.catch(() => undefined); };

  function noiseBuffer(c: AudioContextLike) {
    if (noise) return noise;
    const length = Math.max(1, Math.floor(c.sampleRate)), buffer = c.createBuffer(1, length, c.sampleRate), data = buffer.getChannelData(0);
    let seed = 0x2f6b1d3;
    for (let i = 0; i < length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
    return (noise = buffer);
  }

  function tone(c: AudioContextLike, out: NodeLike, t: Tone, start: number): SourceLike {
    const level = Math.min(1, t.level ?? 1), end = start + t.d, attack = Math.min(0.012, t.d / 3);
    const gain = c.createGain();
    gain.gain.setValueAtTime(SILENT, start);
    gain.gain.linearRampToValueAtTime(level, start + attack);
    gain.gain.exponentialRampToValueAtTime(SILENT, end);
    gain.connect(out as never);
    let source: SourceLike;
    if (t.wave === 'noise') {
      const src = c.createBufferSource(), filter = c.createBiquadFilter();
      src.buffer = noiseBuffer(c); filter.type = 'bandpass'; filter.Q.value = 1.4;
      filter.frequency.setValueAtTime(t.f, start);
      if (t.to) filter.frequency.exponentialRampToValueAtTime(t.to, end);
      src.connect(filter as never); filter.connect(gain as never); source = src;
    } else {
      const osc = c.createOscillator();
      osc.type = t.wave ?? 'triangle'; osc.frequency.setValueAtTime(t.f, start);
      if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, end);
      osc.connect(gain as never); source = osc;
    }
    source.start(start); source.stop(end + TAIL);
    return source;
  }

  return {
    get enabled() { return enabled; },
    unlock() {
      if (!enabled) return false;
      if (ctx) { if (!suspended && ctx.state === 'suspended') quiet(ctx.resume()); return true; }
      try {
        const c = make();
        if (!c) return false;
        const m = c.createGain(); m.gain.value = volume; m.connect(c.destination as never);
        ctx = c; master = m;
        if (suspended) quiet(c.suspend());
        return true;
      } catch { ctx = null; master = null; return false; }
    },
    play(id) {
      const cue = cues[id];
      if (!enabled || suspended || !ctx || !master || !cue || ctx.state === 'closed') return false;
      if (ctx.state === 'suspended') quiet(ctx.resume());
      const now = ctx.currentTime;
      voices = voices.filter(v => v.end > now);
      if (voices.length >= maxVoices) return false;
      try {
        const at = now + 0.005, sources: SourceLike[] = [];
        let cursor = 0;
        for (const t of cue) { const start = t.at ?? cursor; cursor = start + t.d; sources.push(tone(ctx, master, t, at + start)); }
        voices.push({ end: at + cueLength(cue) + TAIL, sources });
        return true;
      } catch { return false; }
    },
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      if (!on) { hush(); if (ctx) quiet(ctx.suspend()); }
      else if (ctx && !suspended) quiet(ctx.resume());
    },
    setSuspended(next) {
      if (next === suspended) return;
      suspended = next;
      if (next) { hush(); if (ctx) quiet(ctx.suspend()); }
      else if (ctx && enabled) quiet(ctx.resume());
    },
    close() {
      hush();
      if (ctx) quiet(ctx.close());
      ctx = null; master = null; noise = null;
    },
  };
}

export const CUES = {
  /** Interface confirm: a single soft bell. */
  confirm: [{ f: 880, d: 0.09, wave: 'sine', level: 0.35 }],
  /** Talking to your Friend: a small rising chirp. */
  chirp: [{ f: 988, to: 1319, d: 0.1, wave: 'sine', level: 0.35 }, { f: 1568, d: 0.1, wave: 'sine', level: 0.25 }],
  eat: [{ f: 700, to: 520, d: 0.07, wave: 'noise', level: 0.3 }, { f: 760, to: 560, d: 0.07, at: 0.14, wave: 'noise', level: 0.3 },
    { f: 784, d: 0.1, at: 0.28, wave: 'sine', level: 0.35 }, { f: 1047, d: 0.18, wave: 'sine', level: 0.35 }],
  walk: [{ f: 330, d: 0.06, level: 0.35 }, { f: 392, d: 0.06, at: 0.16, level: 0.35 }, { f: 330, d: 0.06, at: 0.32, level: 0.35 }, { f: 523, d: 0.16, at: 0.48, wave: 'sine', level: 0.3 }],
  /** A small lullaby as the day ends. */
  sleep: [{ f: 784, d: 0.26, wave: 'sine', level: 0.3 }, { f: 659, d: 0.26, wave: 'sine', level: 0.3 }, { f: 523, d: 0.5, wave: 'sine', level: 0.3 }],
  depart: [{ f: 523, d: 0.08, level: 0.35 }, { f: 659, d: 0.08, level: 0.35 }, { f: 784, d: 0.16, level: 0.35 }],
  /** Something found on an outing: a sparkle. */
  found: [{ f: 1319, d: 0.08, wave: 'sine', level: 0.3 }, { f: 1760, d: 0.08, wave: 'sine', level: 0.3 }, { f: 2093, d: 0.24, wave: 'sine', level: 0.28 },
    { f: 2637, d: 0.2, at: 0.2, wave: 'sine', level: 0.15 }],
  home: [{ f: 784, d: 0.1, wave: 'sine', level: 0.3 }, { f: 659, d: 0.1, wave: 'sine', level: 0.3 }, { f: 784, d: 0.1, wave: 'sine', level: 0.3 }, { f: 1047, d: 0.3, wave: 'sine', level: 0.3 }],
  /** Building: three soft wooden knocks, then a chime. */
  build: [{ f: 420, d: 0.05, wave: 'noise', level: 0.4 }, { f: 420, d: 0.05, at: 0.14, wave: 'noise', level: 0.4 }, { f: 420, d: 0.05, at: 0.28, wave: 'noise', level: 0.4 },
    { f: 1047, d: 0.14, at: 0.42, wave: 'sine', level: 0.3 }, { f: 1319, d: 0.3, wave: 'sine', level: 0.3 }],
  bloom: [{ f: 659, d: 0.1, wave: 'sine', level: 0.3 }, { f: 988, d: 0.1, wave: 'sine', level: 0.3 }, { f: 1319, d: 0.3, wave: 'sine', level: 0.28 }],
  /** Piggy bank: one coin clinking in. */
  coin: [{ f: 1976, d: 0.05, wave: 'sine', level: 0.3 }, { f: 2637, d: 0.28, wave: 'sine', level: 0.3 }],
  /** More unclaimed rewards than last time: a few coins. */
  coins: [{ f: 1976, d: 0.05, wave: 'sine', level: 0.3 }, { f: 2637, d: 0.14, wave: 'sine', level: 0.28 }, { f: 2349, d: 0.05, wave: 'sine', level: 0.28 },
    { f: 3136, d: 0.14, wave: 'sine', level: 0.25 }, { f: 2637, d: 0.05, wave: 'sine', level: 0.25 }, { f: 3520, d: 0.3, wave: 'sine', level: 0.22 }],
} satisfies Record<string, Cue>;
export type CueId = keyof typeof CUES;

/** Which cue a change to the island deserves (null when nothing changed). The life model itself stays sound-free. */
export function cueFor(prev: Life, next: Life): CueId | null {
  if (prev === next) return null;
  if (next.day > prev.day) return 'sleep';
  if (prev.location === 'home' && next.location !== 'home') return 'depart';
  if (prev.location !== 'home' && next.location === 'home') return 'home';
  if (prev.choice === null && next.choice !== null) return 'found';
  if (next.projects.length > prev.projects.length) return 'build';
  if (next.flowers > prev.flowers) return 'bloom';
  if (next.hunger > prev.hunger) return 'eat';
  if (next.location === 'home' && next.energy < prev.energy) return 'walk';
  return 'confirm';
}
