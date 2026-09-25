/**
 * Rare Mine's ASMR sound, synthesised with WebAudio (no audio files). Coins are short inharmonic metal partials
 * with soft attacks and random pitch; they grow richer and settle in pairs ("clink-clink") as the pile grows.
 * The bet's reach, win and burn cues live in sound-fx.ts. Voices are capped and everything runs through a gentle
 * compressor so a long session never gets harsh; hush() cuts every tail at once (pause, mute, a new bet).
 */
import type { FxCue } from './reach.ts';
import { createFxVoices, playCue } from './sound-fx.ts';

export interface MineAudio {
  /** Coins landing in the cart; `richness` 0–1 follows the pile size. */
  clink(count: number, richness: number): void;
  /** Coins dropping into the glass jar (brighter, glassier). */
  jar(count: number): void;
  tock(tap: boolean): void;
  crumble(): void;
  vein(): void;
  gem(): void;
  chaChing(): void;
  /** One reach / win / burn cue from a reach.ts timeline. */
  cue(q: FxCue): void;
  /** Fade out everything that is playing or scheduled (fever loops included). */
  hush(): void;
  /** Resume a suspended (or iOS-interrupted) context; call it from a touchend / pointerup / click / keydown handler. */
  wake(): void;
  close(): void;
}

/** The primitives the effect voices are built from (all scheduled on the shared, capped voice pool). */
export interface Synth {
  readonly ctx: BaseAudioContext;
  now(): number;
  /** The current master input; it is replaced by hush(), so read it at scheduling time. */
  out(): AudioNode;
  voice(node: AudioScheduledSourceNode, at: number, end: number, start?: () => void): boolean;
  env(at: number, peak: number, attack: number, decay: number, out?: AudioNode): GainNode;
  tone(type: OscillatorType, freq: number, at: number, peak: number, attack: number, decay: number, out?: AudioNode, pan?: number): OscillatorNode | null;
  hiss(at: number, len: number, peak: number, type: BiquadFilterType, freq: number, q?: number, out?: AudioNode, attack?: number): BiquadFilterNode | null;
  coin(at: number, pitch: number, richness: number, level: number, pan: number): void;
}

/** Hard ceiling on scheduled nodes; sounds beyond it are skipped rather than stacking into noise. */
export const MAX_VOICES = 80;
const CLINK_GAP = 0.022;
const METAL = [1, 2.76, 5.4, 8.93] as const;
const LEVEL = 0.32;

export function createMineAudio(): MineAudio | null {
  const Context = globalThis.AudioContext;
  if (!Context) return null;
  try {
    return buildAudio(new Context());
  } catch {
    return null;
  }
}

/** Build the audio graph on any context (exported for tests with a stub context). */
export function buildAudio(ctx: BaseAudioContext & { close?: () => Promise<void>; resume?: () => Promise<void> }): MineAudio {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  const soften = ctx.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 9000;
  soften.connect(comp).connect(ctx.destination);
  const makeMaster = () => { const g = ctx.createGain(); g.gain.value = LEVEL; g.connect(soften); return g; };
  let master = makeMaster();
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  let voices = 0, nextClink = 0;

  // iOS reports 'interrupted' after a call or a trip to the background; both states resume the same way.
  const wake = () => { if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume?.().catch(() => undefined); };
  const now = () => ctx.currentTime + 0.01;
  /** Reserve a voice; false when the cap is reached (the sound is simply skipped). */
  function voice(node: AudioScheduledSourceNode, at: number, end: number, start: () => void = () => node.start(at)): boolean {
    if (voices >= MAX_VOICES) return false;
    voices++;
    node.onended = () => { voices = Math.max(0, voices - 1); };
    start(); node.stop(end);
    return true;
  }
  function env(at: number, peak: number, attack: number, decay: number, out: AudioNode = master): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(peak, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(out);
    return g;
  }
  function tone(type: OscillatorType, freq: number, at: number, peak: number, attack: number, decay: number, out: AudioNode = master, pan = 0) {
    if (voices >= MAX_VOICES) return null;
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = freq;
    const end = at + attack + decay + 0.02;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    osc.connect(p).connect(env(at, peak, attack, decay, out));
    if (!voice(osc, at, end)) { osc.disconnect(); return null; }
    return osc;
  }
  function hiss(at: number, len: number, peak: number, type: BiquadFilterType, freq: number, q = 1, out: AudioNode = master, attack = 0.003) {
    if (voices >= MAX_VOICES) return null;
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f).connect(env(at, peak, attack, len, out));
    if (!voice(src, at, at + attack + len + 0.02, () => src.start(at, Math.random() * 0.5))) { src.disconnect(); return null; }
    return f;
  }
  /** One coin: a soft contact tick plus 2–4 inharmonic partials. */
  function coin(at: number, pitch: number, richness: number, level: number, pan: number) {
    const partials = 2 + Math.round(richness * 2), decay = 0.08 + richness * 0.14;
    hiss(at, 0.012, 0.05 * level, 'highpass', 5000);
    for (let i = 0; i < partials; i++) tone('sine', pitch * METAL[i], at, (0.16 / (i + 1)) * level, 0.002, decay / (1 + i * 0.6), master, pan);
  }
  function clinkAt(at: number, richness: number, level = 1) {
    const pitch = 2300 * 2 ** ((Math.random() - 0.5) * 0.7), pan = (Math.random() - 0.5) * 0.8;
    coin(at, pitch, richness, level, pan);
    if (Math.random() < 0.3 + richness * 0.45) coin(at + 0.035 + Math.random() * 0.06, pitch * 2 ** ((Math.random() - 0.5) * 0.2), richness, level * 0.55, pan);
  }
  const synth: Synth = { ctx, now, out: () => master, voice, env, tone, hiss, coin };
  const fx = createFxVoices(synth);

  return {
    clink(count, richness) {
      wake();
      for (let i = 0; i < Math.min(3, count); i++) {
        const at = Math.max(now() + Math.random() * 0.03, nextClink);
        nextClink = at + CLINK_GAP;
        clinkAt(at, Math.min(1, Math.max(0, richness)), 0.8 + Math.random() * 0.2);
      }
    },
    jar(count) {
      wake();
      for (let i = 0; i < Math.min(2, count); i++) {
        const at = Math.max(now(), nextClink); nextClink = at + CLINK_GAP;
        coin(at, 3100 * 2 ** ((Math.random() - 0.5) * 0.5), 0.9, 0.7, -0.5);
      }
    },
    tock(tap) {
      wake();
      const at = now();
      const osc = ctx.createOscillator(); osc.type = 'triangle';
      osc.frequency.setValueAtTime(tap ? 240 : 200, at); osc.frequency.exponentialRampToValueAtTime(85, at + 0.07);
      osc.connect(env(at, tap ? 0.34 : 0.24, 0.004, 0.09));
      if (!voice(osc, at, at + 0.12)) osc.disconnect();
      hiss(at, 0.05, tap ? 0.22 : 0.15, 'bandpass', 1400, 1.2);
    },
    crumble() {
      wake();
      const at = now();
      for (let i = 0; i < 5; i++) hiss(at + i * 0.045 + Math.random() * 0.03, 0.09, 0.14 - i * 0.02, 'lowpass', 500 + Math.random() * 400);
    },
    vein() {
      wake();
      const at = now();
      [1175, 1480, 1760].forEach((f, i) => tone('triangle', f, at + i * 0.05, 0.07, 0.004, 0.2));
    },
    gem() {
      wake();
      const at = now();
      [1319, 1760, 2349, 2637, 3136].forEach((f, i) => tone('sine', f, at + i * 0.055, 0.09, 0.006, 0.6, master, (i - 2) * 0.2));
    },
    chaChing() {
      wake();
      const at = now();
      hiss(at, 0.07, 0.2, 'highpass', 3200);
      hiss(at + 0.05, 0.05, 0.12, 'highpass', 4500);
      for (const [f, p] of [[1568, 0.14], [2093, 0.1], [1568 * 2.76, 0.03]] as const) tone('sine', f, at + 0.1, p, 0.004, 0.9);
      for (let i = 0; i < 6; i++) clinkAt(at + 0.18 + i * 0.05 + Math.random() * 0.02, 0.9, 0.6);
    },
    cue(q) { wake(); playCue(fx, q); },
    hush() {
      const old = master, t = ctx.currentTime;
      old.gain.cancelScheduledValues(t); old.gain.setValueAtTime(LEVEL, t); old.gain.linearRampToValueAtTime(0, t + 0.04);
      setTimeout(() => old.disconnect(), 150);
      master = makeMaster(); nextClink = 0;
    },
    wake,
    close() { void ctx.close?.().catch(() => undefined); },
  };
}
