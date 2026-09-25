import test from 'node:test';
import assert from 'node:assert/strict';
import {createSound, CUES, cueFor} from './sound.ts';
import {newLife, act, depart, choose, returnHome, build, rename} from './life.ts';

/** A stand-in AudioContext that records what the player asks of it. */
function fakeAudio() {
  const log = {contexts: 0, sources: 0, forcedStops: 0, closes: 0};
  const param = () => ({value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}});
  const node = extra => ({connect: next => next, disconnect() {}, ...extra});
  const source = extra => { log.sources++; return node({start() {}, stop(when) { if (when === undefined) log.forcedStops++; }, ...extra}); };
  const factory = () => {
    log.contexts++;
    const ctx = {
      state: 'running', currentTime: 0, sampleRate: 8000, destination: node(),
      createGain: () => node({gain: param()}), createOscillator: () => source({type: 'sine', frequency: param()}),
      createBufferSource: () => source({buffer: null}), createBiquadFilter: () => node({type: 'lowpass', frequency: param(), Q: param()}),
      createBuffer: (_ch, length) => ({getChannelData: () => new Float32Array(length)}),
      resume: async () => { ctx.state = 'running'; }, suspend: async () => { ctx.state = 'suspended'; }, close: async () => { log.closes++; ctx.state = 'closed'; },
    };
    log.ctx = ctx;
    return ctx;
  };
  return {log, factory};
}

test('audio waits for a gesture, obeys the switch and falls silent while paused or hidden', () => {
  const {log, factory} = fakeAudio();
  const sfx = createSound(CUES, {createContext: factory});
  assert.equal(sfx.play('confirm'), false); assert.equal(log.contexts, 0, 'no context before the first gesture');
  assert.equal(sfx.unlock(), true); assert.equal(sfx.play('eat'), true);
  sfx.setEnabled(false); assert.ok(log.forcedStops > 0, 'turning sound off cuts the playing cue'); assert.equal(sfx.play('eat'), false);
  sfx.setEnabled(true); sfx.setSuspended(true); assert.equal(log.ctx.state, 'suspended'); assert.equal(sfx.play('eat'), false);
  sfx.setSuspended(false); assert.equal(sfx.play('eat'), true);
  const muted = createSound(CUES, {createContext: factory}); muted.setEnabled(false); assert.equal(muted.unlock(), false); assert.equal(log.contexts, 1, 'a muted island never opens audio');
  assert.equal(createSound(CUES, {createContext: () => null}).unlock(), false, 'no WebAudio, still playable');
  sfx.close(); assert.equal(log.closes, 1); assert.equal(sfx.play('eat'), false);
});

test('voices are capped', () => {
  const {log, factory} = fakeAudio();
  const sfx = createSound(CUES, {createContext: factory, maxVoices: 2}); sfx.unlock();
  assert.deepEqual([1, 2, 3].map(() => sfx.play('coin')), [true, true, false]);
  log.ctx.currentTime = 5; assert.equal(sfx.play('coin'), true);
});

test('gentle cues for care, finds, the piggy bank and the interface', () => {
  for (const id of ['confirm', 'chirp', 'eat', 'walk', 'sleep', 'depart', 'found', 'home', 'build', 'bloom', 'coin', 'coins']) assert.ok(CUES[id], id);
  for (const [id, cue] of Object.entries(CUES)) {
    let cursor = 0, end = 0;
    for (const tone of cue) {
      assert.ok(tone.f > 0 && tone.d > 0 && (tone.level ?? 1) <= 0.7, `${id} stays soft`);
      assert.notEqual(tone.wave, 'square', `${id} avoids harsh square waves`);
      const start = tone.at ?? cursor; cursor = start + tone.d; end = Math.max(end, cursor);
    }
    assert.ok(end <= 1.6, `${id} lasts ${end}s`);
  }
});

test('cueFor reads the care action from the change in the island', () => {
  const s = newLife('77251', 1);
  assert.equal(cueFor(s, s), null);
  assert.equal(cueFor(s, act(s, s.favorite)), 'eat');
  assert.equal(cueFor(s, act(s, 'walk')), 'walk');
  assert.equal(cueFor(s, act(s, 'sleep')), 'sleep');
  const trip = depart(s, 'beach'); assert.equal(cueFor(s, trip), 'depart');
  const found = choose(trip, 0); assert.equal(cueFor(trip, found), 'found');
  assert.equal(cueFor(found, returnHome(found)), 'home');
  const rich = {...s, wood: 9, shells: 9, seeds: 9}, garden = build(rich, 'garden'); assert.equal(cueFor(rich, garden), 'build');
  const bloom = act(garden, 'sleep'); assert.equal(cueFor(bloom, act(bloom, 'harvest')), 'bloom');
  assert.equal(cueFor(s, rename(s, 'そら')), 'confirm');
  assert.equal(cueFor(s, {...s, language: 'en'}), 'confirm');
  const plaza = depart(s, 'plaza'); assert.equal(cueFor(plaza, choose(plaza, 0)), 'found', 'bakery bread is a find, not a meal');
});
