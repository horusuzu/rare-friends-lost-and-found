/**
 * The bet's pachinko-style sound, synthesised on the shared voice pool (no audio files, original melodies).
 * Reach: a whirring spin, reel thunks, a リーチ alarm stab, a rising siren and an accelerating heartbeat.
 * Win: a sub bass hit, a flash zap, a square/saw fanfare in three phrases, a bell cascade, a ジャラジャラ pour of
 * streamed coin clinks, and from 確変 up a driving fever loop that climbs a semitone a bar.
 * Burn: a reel clunk, silence, a deep boom and whoosh, a descending wah-wah brass, coin clatter and crackling embers.
 * Every cue is short and scheduled when its timeline reaches it, so pausing or muting stops the show at once.
 */
import type { FxCue, FxCueKind } from './reach.ts';
import type { Synth } from './sound.ts';

export type FxVoices = Readonly<Record<FxCueKind, (n: number) => void>>;

/** Route one timeline cue to its voice. */
export function playCue(voices: FxVoices, q: FxCue): void { voices[q.k](q.n); }
/** Cues that should sound: none at all while muted. */
export const audibleCues = (cues: readonly FxCue[], soundOn: boolean): readonly FxCue[] => soundOn ? cues : [];

const C5 = 523.25;
const semi = (n: number, root = C5): number => root * 2 ** (n / 12);
/** Transposition by win tier: each streak tier lifts the fanfare. */
const LIFT = [0, 2, 4, 7] as const;
/** Fanfare phrases as [semitone from C5, seconds]; original to this game. */
const PHRASES: readonly (readonly (readonly [number, number])[])[] = [
  [[-5, 0.07], [0, 0.07], [4, 0.07], [7, 0.07], [12, 0.3]],
  [[9, 0.065], [7, 0.065], [4, 0.065], [0, 0.065], [2, 0.065], [4, 0.065], [7, 0.24]],
  [[0, 0.045], [4, 0.045], [7, 0.045], [12, 0.045], [16, 0.5]],
];
const FEVER_ARP = [0, 7, 12, 16, 12, 7, 19, 12] as const;
const BELLS = [2093, 1760, 1568, 1319, 1175, 1047, 880, 784] as const;
const rnd = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export function createFxVoices(sy: Synth): FxVoices {
  const { ctx } = sy;
  /** A lowpass bus for the bright leads so squares and saws stay smooth. */
  function soft(freq: number): BiquadFilterNode {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = 0.7; f.connect(sy.out());
    return f;
  }
  /** A tone whose pitch glides from `f0` to `f1` over `len` seconds. */
  function glide(type: OscillatorType, f0: number, f1: number, at: number, len: number, peak: number, attack = 0.005, out?: AudioNode, pan = 0) {
    const o = sy.tone(type, f0, at, peak, attack, len, out, pan);
    if (!o) return;
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + attack + len);
  }
  /** Brass-like: detuned saw + square through a lowpass whose cutoff swells open and shut ("wah"). */
  function brass(at: number, freq: number, len: number, peak: number, bend = 1) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 7;
    f.frequency.setValueAtTime(260, at); f.frequency.linearRampToValueAtTime(1800, at + len * 0.35); f.frequency.exponentialRampToValueAtTime(320, at + len);
    f.connect(sy.env(at, peak, 0.03, len));
    for (const [type, detune] of [['sawtooth', -8], ['square', 8]] as const) {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
      o.frequency.setValueAtTime(freq, at);
      if (bend !== 1) { o.frequency.setValueAtTime(freq, at + len * 0.4); o.frequency.exponentialRampToValueAtTime(freq * bend, at + len); }
      o.connect(f);
      if (!sy.voice(o, at, at + len + 0.08)) o.disconnect();
    }
  }
  function bell(at: number, freq: number, peak: number, pan: number) {
    sy.tone('sine', freq, at, peak, 0.003, 0.8, undefined, pan);
    sy.tone('sine', freq * 2.76, at, peak * 0.3, 0.002, 0.3, undefined, pan);
  }
  function kick(at: number, peak: number) { glide('sine', 120, 42, at, 0.16, peak, 0.003); }

  return {
    // ── Reach ──
    spin() {
      const at = sy.now();
      const f = sy.hiss(at, 0.42, 0.1, 'bandpass', 400, 1.4, undefined, 0.08);
      f?.frequency.exponentialRampToValueAtTime(2600, at + 0.45);
      for (let i = 0; i < 6; i++) sy.hiss(at + 0.05 + i * 0.05, 0.01, 0.08, 'bandpass', 2200 + i * 200, 3);
    },
    stop(n) {
      const at = sy.now();
      glide('triangle', 320, 120, at, 0.08, 0.26, 0.003);
      sy.tone('sine', n === 0 ? 880 : 1109, at, 0.07, 0.003, 0.25);
      sy.hiss(at, 0.03, 0.1, 'bandpass', 1800, 2);
    },
    reach() {
      const at = sy.now(), lead = soft(3600);
      sy.tone('square', 659, at, 0.06, 0.004, 0.09, lead); sy.tone('square', 880, at + 0.1, 0.07, 0.004, 0.2, lead);
      for (const f of [440, 554, 659]) sy.tone('sawtooth', f, at + 0.1, 0.028, 0.01, 0.45, lead);
      sy.hiss(at + 0.1, 0.3, 0.06, 'highpass', 6000, 0.7, undefined, 0.02);
    },
    siren(n) {
      const at = sy.now(), f0 = semi(n * 2, 520);
      glide('triangle', f0, f0 * 1.5, at, 0.5, 0.045, 0.05);
      glide('sine', f0 * 2, f0 * 3, at, 0.5, 0.012, 0.05);
    },
    beat(n) {
      const at = sy.now(), k = Math.min(10, Math.max(0, n)) / 10;
      glide('sine', 78, 42, at, 0.12, 0.26 + 0.1 * k, 0.004);
      glide('sine', 64, 38, at + 0.13, 0.1, 0.18 + 0.08 * k, 0.004);
    },
    hot(n) {
      const at = sy.now(), notes = n >= 2 ? 12 : 8, lead = soft(5200);
      for (let i = 0; i < notes; i++) {
        const f = semi([0, 2, 4, 7, 9][i % 5] + 12 * Math.floor(i / 5) + 7);
        sy.tone('triangle', f, at + i * 0.032, 0.06, 0.003, 0.18, undefined, (i / notes - 0.5) * 1.2);
        if (n >= 2) sy.tone('square', f, at + i * 0.032, 0.02, 0.003, 0.1, lead);
      }
      sy.hiss(at, n >= 2 ? 0.5 : 0.3, n >= 2 ? 0.1 : 0.07, 'highpass', 6500, 0.7, undefined, 0.01);
      if (n >= 2) for (const f of [C5, semi(4), semi(7), semi(11)]) sy.tone('sawtooth', f, at + notes * 0.032, 0.03, 0.01, 0.5, lead);
    },
    tease() {
      const at = sy.now();
      [0, 0.06, 0.13, 0.22].forEach((d, i) => sy.hiss(at + d, 0.012, 0.13 - i * 0.02, 'bandpass', 2500, 3));
      glide('sawtooth', 196, 208, at, 0.34, 0.03, 0.03, soft(900));
    },

    // ── Win ──
    lock() {
      const at = sy.now();
      for (const [m, p] of [[1, 0.12], [2.76, 0.05], [5.4, 0.025]] as const) sy.tone('sine', 660 * m, at, p, 0.002, 0.3);
      sy.hiss(at, 0.05, 0.14, 'bandpass', 1500, 1.5);
    },
    bass(n) {
      const at = sy.now();
      glide('sine', 110, 36, at, 0.5, 0.45, 0.004);
      sy.tone('triangle', 55 * 2 ** (LIFT[Math.min(3, n)] / 12), at, 0.18, 0.01, 0.6);
      sy.hiss(at, 0.25, 0.2, 'lowpass', 160, 0.8);
    },
    zap() {
      const at = sy.now();
      const f = sy.hiss(at, 0.25, 0.1, 'highpass', 6000, 0.7);
      f?.frequency.exponentialRampToValueAtTime(1500, at + 0.25);
      glide('sine', 2000, 4000, at, 0.15, 0.035);
    },
    fanfare(n) {
      const at = sy.now(), phrase = PHRASES[n % 10] ?? PHRASES[0], lift = LIFT[Math.min(3, Math.floor(n / 10))];
      const lead = soft(3400);
      let t = at;
      for (const [s, len] of phrase) {
        const f = semi(s + lift), long = len > 0.2;
        sy.tone('square', f, t, long ? 0.055 : 0.045, 0.005, len * (long ? 1.6 : 1.1), lead);
        sy.tone('sawtooth', f * 1.003, t, 0.028, 0.005, len * (long ? 1.6 : 1.1), lead, 0.25);
        if (long) for (const h of [4, 7]) sy.tone('triangle', semi(s + lift - 12 + h), t, 0.035, 0.02, len * 1.8, undefined, h === 4 ? -0.4 : 0.4);
        t += len;
      }
      if (n % 10 === 2) {
        for (const h of [0, 4, 7, 12]) sy.tone('sawtooth', semi(h + lift), t - 0.5, 0.02, 0.02, 0.7, lead);
        sy.tone('sine', semi(lift - 24), t - 0.5, 0.22, 0.01, 0.8);
      }
    },
    chimes(n) {
      const at = sy.now(), order = n === 1 ? [...BELLS].reverse() : BELLS;
      order.forEach((f, i) => bell(at + i * 0.06, f, 0.07, (i / (order.length - 1) - 0.5) * 1.4));
    },
    jara(n) {
      const at = sy.now();
      for (let i = 0; i < Math.min(4, n); i++) {
        sy.coin(at + Math.random() * 0.085, 2600 * 2 ** rnd(-0.2, 0.7), rnd(0.3, 0.7), rnd(0.4, 0.62), rnd(-0.9, 0.9));
      }
    },
    fever(n) {
      const at = sy.now(), root = semi(Math.min(n, 12) - 12), lead = soft(4200);
      FEVER_ARP.forEach((s, i) => sy.tone('square', root * 2 ** (s / 12), at + i * 0.06, 0.032, 0.003, 0.07, lead, i % 2 ? 0.3 : -0.3));
      kick(at, 0.24); kick(at + 0.24, 0.2);
      sy.hiss(at + 0.12, 0.02, 0.04, 'highpass', 7000); sy.hiss(at + 0.36, 0.02, 0.04, 'highpass', 7000);
    },

    // ── Burn ──
    clunk() {
      const at = sy.now();
      glide('triangle', 150, 55, at, 0.18, 0.34, 0.003);
      sy.hiss(at, 0.12, 0.17, 'bandpass', 900, 2);
    },
    boom() {
      const at = sy.now();
      glide('sine', 62, 26, at, 0.85, 0.52, 0.006);
      sy.hiss(at, 0.7, 0.34, 'lowpass', 180, 0.8, undefined, 0.01);
    },
    whoosh() {
      const at = sy.now();
      const f = sy.hiss(at, 0.7, 0.24, 'bandpass', 300, 0.9, undefined, 0.12);
      f?.frequency.exponentialRampToValueAtTime(2400, at + 0.6);
    },
    wah() {
      const at = sy.now();
      [330, 311, 294].forEach((f, i) => brass(at + i * 0.28, f, 0.26, 0.085));
      brass(at + 0.84, 277, 0.7, 0.09, 0.94);
    },
    clatter() {
      const at = sy.now();
      let t = at;
      for (let i = 0; i < 7; i++) {
        sy.coin(t, 3200 * 0.88 ** i * 2 ** rnd(-0.1, 0.1), 0.8, 0.7 * 0.8 ** i, rnd(-0.7, 0.7));
        t += 0.05 + i * 0.02;
      }
    },
    crackle(n) {
      const at = sy.now();
      for (let i = 0; i < n * 2; i++) sy.hiss(at + Math.random() * 0.12, 0.006, rnd(0.08, 0.18), 'highpass', 2500);
      if (Math.random() < 0.5) sy.hiss(at + Math.random() * 0.1, 0.02, 0.08, 'lowpass', 800);
    },
  };
}
