/** Synthesised rushing wind: filtered noise whose pitch and volume follow speed. No audio files. */
export interface Wind { update(speed: number, on: boolean): void; close(): void }

export function createWind(): Wind | null {
  const Context = globalThis.AudioContext;
  if (!Context) return null;
  try {
    const ctx = new Context();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 0.8;
    const gain = ctx.createGain(); gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    return {
      update(speed, on) {
        const now = ctx.currentTime;
        gain.gain.setTargetAtTime(on ? Math.min(0.22, speed / 450) : 0, now, 0.08);
        filter.frequency.setTargetAtTime(250 + speed * 28, now, 0.1);
      },
      close() { void ctx.close().catch(() => undefined); },
    };
  } catch {
    return null;
  }
}
