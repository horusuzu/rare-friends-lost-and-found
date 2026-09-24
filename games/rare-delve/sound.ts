/** Short square- and triangle-wave cues synthesised with WebAudio. Original blips; no audio files. */
import type { Sfx } from './run.ts';

type Note = readonly [freq: number, seconds: number];
const CUES: Readonly<Record<Sfx, readonly Note[]>> = {
  step: [[180, 0.02]], hit: [[220, 0.05], [150, 0.06]], hurt: [[140, 0.07], [90, 0.09]], miss: [[520, 0.04], [390, 0.05]],
  kill: [[330, 0.05], [440, 0.05], [660, 0.08]], pickup: [[880, 0.04], [1175, 0.06]], level: [[523, 0.06], [659, 0.06], [784, 0.06], [1047, 0.12]],
  stairs: [[392, 0.06], [330, 0.06], [262, 0.1]], eat: [[300, 0.04], [360, 0.04], [300, 0.05]], drink: [[600, 0.05], [800, 0.05], [700, 0.07]],
  read: [[700, 0.04], [940, 0.07]], zap: [[1200, 0.03], [900, 0.03], [600, 0.06]], throw: [[500, 0.03], [420, 0.04]],
  trap: [[160, 0.05], [200, 0.05], [120, 0.1]], death: [[392, 0.12], [330, 0.12], [262, 0.14], [196, 0.3]],
  clear: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.08], [784, 0.08], [1319, 0.25]], home: [[659, 0.08], [784, 0.08], [1047, 0.16]],
  buy: [[1047, 0.05], [1319, 0.08]], error: [[160, 0.08]], confirm: [[880, 0.03]], cancel: [[440, 0.04]],
};

export interface Beeper { play(id: Sfx): void; close(): void }

export function createBeeper(): Beeper | null {
  const Context = globalThis.AudioContext;
  if (!Context) return null;
  try {
    const ctx = new Context();
    const master = ctx.createGain(); master.gain.value = 0.05; master.connect(ctx.destination);
    return {
      play(id) {
        if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
        let at = ctx.currentTime + 0.01;
        for (const [freq, len] of CUES[id]) {
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = id === 'step' ? 'triangle' : 'square'; osc.frequency.value = freq;
          gain.gain.setValueAtTime(1, at); gain.gain.exponentialRampToValueAtTime(0.01, at + len);
          osc.connect(gain).connect(master); osc.start(at); osc.stop(at + len + 0.01);
          at += len;
        }
      },
      close() { void ctx.close().catch(() => undefined); },
    };
  } catch {
    return null;
  }
}
