import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_VOICES, buildAudio } from './sound.ts';
import { audibleCues, playCue } from './sound-fx.ts';
import { FX_CUE_KINDS, loseTimeline, reachPlan, reachTimeline, winTimeline } from './reach.ts';

/** A stub AudioContext: records every started source and which master bus it ends up on. */
function stubContext() {
  const log = { started: 0, masters: [], rampsToZero: 0 };
  const param = (value = 0) => ({
    value, setValueAtTime() { return this; }, linearRampToValueAtTime(v) { if (v === 0) log.rampsToZero++; return this; },
    exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; }, cancelScheduledValues() { return this; },
  });
  const node = extra => ({ connect(n) { return n; }, disconnect() {}, ...extra });
  const source = extra => node({ start() { log.started++; }, stop() {}, onended: null, ...extra });
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running', destination: node(),
    createDynamicsCompressor: () => node({ threshold: param(), ratio: param(), attack: param(), release: param() }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(), Q: param() }),
    createGain: () => { const g = node({ gain: param(1) }); log.masters.push(g); return g; },
    createStereoPanner: () => node({ pan: param() }),
    createOscillator: () => source({ type: 'sine', frequency: param(440), detune: param() }),
    createBufferSource: () => source({ buffer: null, loop: false }),
    createBuffer: (_c, length) => ({ getChannelData: () => new Float32Array(length) }),
    resume: async () => {}, close: async () => {},
  };
  return { ctx, log };
}

test('every reach, win and burn cue routes to a voice that makes sound', () => {
  for (const k of FX_CUE_KINDS) {
    const { ctx, log } = stubContext();
    const audio = buildAudio(ctx);
    audio.cue({ t: 0, k, n: 1 });
    assert.ok(log.started > 0, `${k} schedules at least one sound`);
  }
});

test('playCue calls exactly the voice named by the cue', () => {
  const calls = [];
  const voices = Object.fromEntries(FX_CUE_KINDS.map(k => [k, n => calls.push([k, n])]));
  for (const k of FX_CUE_KINDS) playCue(voices, { t: 0, k, n: 7 });
  assert.deepEqual(calls, FX_CUE_KINDS.map(k => [k, 7]));
});

test('muted: no cue reaches the synth, fever loops included', () => {
  const fever = winTimeline(3, false);
  assert.ok(fever.some(q => q.k === 'fever'));
  assert.deepEqual(audibleCues(fever, false), []);
  assert.equal(audibleCues(fever, true), fever);
});

test('a whole timeline fired at once never exceeds the voice cap', () => {
  const plan = reachPlan(12345, true);
  for (const timeline of [reachTimeline({ ...plan, tier: 2, tease: true }, false), winTimeline(3, false), loseTimeline(false)]) {
    const { ctx, log } = stubContext();
    const audio = buildAudio(ctx);
    for (const q of timeline) audio.cue(q);
    assert.ok(log.started > 0 && log.started <= MAX_VOICES, `${log.started} voices`);
  }
});

test('hush fades the master out and routes later sounds to a fresh bus', () => {
  const { ctx, log } = stubContext();
  const audio = buildAudio(ctx);
  const before = log.masters.length;
  audio.cue({ t: 0, k: 'fever', n: 0 });
  audio.hush();
  assert.ok(log.rampsToZero >= 1, 'the old master ramps to silence');
  assert.ok(log.masters.length > before, 'a new master bus is made');
  const started = log.started;
  audio.cue({ t: 0, k: 'jara', n: 3 });
  assert.ok(log.started > started, 'sound still works after a hush');
});
