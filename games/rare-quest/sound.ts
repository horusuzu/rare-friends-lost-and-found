/** Tiny square-wave cues synthesised with WebAudio. Original short blips; no audio files. */
import type { Sfx } from './battle.ts';

type Note = readonly [freq: number, seconds: number];
const CUES: Readonly<Record<Sfx, readonly Note[]>> = {
  confirm: [[880, 0.04]], cancel: [[440, 0.05]], bump: [[110, 0.07]], door: [[392, 0.05], [523, 0.07]],
  hit: [[160, 0.08], [120, 0.06]], super: [[220, 0.06], [140, 0.1]], weak: [[330, 0.07]], miss: [[620, 0.05], [310, 0.07]],
  faint: [[440, 0.08], [330, 0.08], [220, 0.08], [110, 0.14]], level: [[523, 0.06], [659, 0.06], [784, 0.06], [1047, 0.12]],
  catch: [[784, 0.07], [988, 0.07], [1175, 0.14]], heal: [[659, 0.08], [784, 0.08], [988, 0.08], [1319, 0.16]],
  buy: [[1047, 0.05], [1319, 0.08]], save: [[784, 0.06], [1047, 0.1]], encounter: [[247, 0.05], [330, 0.05], [494, 0.05], [330, 0.05], [494, 0.08]],
  badge: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.08], [784, 0.08], [1047, 0.2]], run: [[392, 0.05], [294, 0.05], [196, 0.08]],
};

export interface Beeper { play(id: Sfx): void; unlock(): void; close(): void }

export function createBeeper(): Beeper | null {
  const Context = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  try {
    const ctx = new Context();
    const master = ctx.createGain(); master.gain.value = 0.06; master.connect(ctx.destination);
    return {
      play(id) {
        if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
        let at = ctx.currentTime + 0.01;
        for (const [freq, len] of CUES[id]) {
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'square'; osc.frequency.value = freq;
          gain.gain.setValueAtTime(1, at); gain.gain.exponentialRampToValueAtTime(0.01, at + len);
          osc.connect(gain).connect(master); osc.start(at); osc.stop(at + len + 0.01);
          at += len;
        }
      },
      /** Resume from a user gesture; iOS Safari only allows this from touchend/pointerup/click. */
      unlock() { if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined); },
      close() { void ctx.close().catch(() => undefined); },
    };
  } catch {
    return null;
  }
}
