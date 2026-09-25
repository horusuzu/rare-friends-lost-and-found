/**
 * Rare Invaders sound effects: soft synthesised arcade cues (oscillators and filtered noise, no audio files).
 * The AudioContext is created only by unlock(), called from a user gesture. Voices are capped, every tone
 * has a soft attack and release, and the player falls silent while muted, paused or hidden.
 */
import type {State} from './engine.js';

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
  tap: [{ f: 660, d: 0.05, level: 0.4 }],
  shoot: [{ f: 1400, to: 700, d: 0.06, wave: 'square', level: 0.18 }],
  hit: [{ f: 520, to: 380, d: 0.05, wave: 'square', level: 0.25 }],
  explode: [{ f: 1800, to: 300, d: 0.18, wave: 'noise', level: 0.55 }, { f: 150, to: 70, d: 0.16, at: 0, wave: 'sine', level: 0.5 }],
  'player-hit': [{ f: 900, to: 200, d: 0.3, wave: 'noise', level: 0.6 }, { f: 220, to: 80, d: 0.3, at: 0, wave: 'square', level: 0.25 }],
  shield: [{ f: 400, to: 1200, d: 0.22, wave: 'sine', level: 0.5 }, { f: 1600, d: 0.16, at: 0.12, wave: 'sine', level: 0.25 }],
  wave: [{ f: 523, d: 0.07, level: 0.5 }, { f: 659, d: 0.07, level: 0.5 }, { f: 784, d: 0.07, level: 0.5 }, { f: 1047, d: 0.2, level: 0.5 }],
  over: [{ f: 392, d: 0.14, level: 0.6 }, { f: 330, d: 0.14, level: 0.6 }, { f: 262, d: 0.16, level: 0.6 }, { f: 196, d: 0.4, level: 0.6 }],
  won: [{ f: 523, d: 0.1, level: 0.6 }, { f: 659, d: 0.1, level: 0.6 }, { f: 784, d: 0.1, level: 0.6 }, { f: 1047, d: 0.12, level: 0.6 },
    { f: 784, d: 0.08, level: 0.6 }, { f: 1047, d: 0.4, level: 0.6 }, { f: 1319, d: 0.4, at: 0.52, level: 0.35 }],
  best: [{ f: 1319, d: 0.06, wave: 'sine', level: 0.4 }, { f: 1568, d: 0.06, wave: 'sine', level: 0.4 }, { f: 2093, d: 0.06, wave: 'sine', level: 0.4 },
    { f: 2637, d: 0.3, wave: 'sine', level: 0.35 }],
} satisfies Record<string, Cue>;
export type CueId = keyof typeof CUES;

/** The cues for what changed between two frames of the pure engine (which itself stays sound-free). */
export function soundsFor(prev: State, next: State): CueId[] {
  if (prev === next || prev.status !== 'playing') return [];
  const out: CueId[] = [];
  if (next.fireCooldown > prev.fireCooldown) out.push('shoot');
  if (next.shieldCooldown > prev.shieldCooldown) out.push('shield');
  const hp = (s: State) => s.enemies.reduce((sum, e) => sum + e.hp, 0);
  if (next.score > prev.score) out.push('explode');
  else if (next.wave === prev.wave && hp(next) < hp(prev)) out.push('hit');
  if (next.lives < prev.lives) out.push('player-hit');
  if (next.status === 'won') out.push('won');
  else if (next.status === 'over') out.push('over');
  else if (next.wave > prev.wave) out.push('wave');
  return out;
}
