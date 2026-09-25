import test from 'node:test';
import assert from 'node:assert/strict';
import {createSound, CUES, revealCue, hitCue, roundCue, verdictCue} from './sound.ts';

/** A stand-in AudioContext that records what the player asks of it. */
function fakeAudio() {
  const log = {contexts: 0, sources: 0, forcedStops: 0, resumes: 0, suspends: 0, closes: 0};
  const param = () => ({value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}});
  const node = extra => ({connect: next => next, disconnect() {}, ...extra});
  const source = extra => { log.sources++; return node({start() {}, stop(when) { if (when === undefined) log.forcedStops++; }, onended: null, ...extra}); };
  const factory = () => {
    log.contexts++;
    const ctx = {
      state: 'running', currentTime: 0, sampleRate: 8000, destination: node(),
      createGain: () => node({gain: param()}),
      createOscillator: () => source({type: 'sine', frequency: param()}),
      createBufferSource: () => source({buffer: null}),
      createBiquadFilter: () => node({type: 'lowpass', frequency: param(), Q: param()}),
      createBuffer: (_ch, length) => ({getChannelData: () => new Float32Array(length)}),
      resume: async () => { log.resumes++; ctx.state = 'running'; },
      suspend: async () => { log.suspends++; ctx.state = 'suspended'; },
      close: async () => { log.closes++; ctx.state = 'closed'; },
    };
    log.ctx = ctx;
    return ctx;
  };
  return {log, factory};
}

test('no AudioContext exists until unlock() is called from a gesture', () => {
  const {log, factory} = fakeAudio();
  const sfx = createSound(CUES, {createContext: factory});
  assert.equal(sfx.play('tap'), false, 'nothing plays before the first gesture');
  assert.equal(log.contexts, 0);
  assert.equal(sfx.unlock(), true); assert.equal(sfx.unlock(), true);
  assert.equal(log.contexts, 1, 'one context, created once');
  assert.equal(sfx.play('tap'), true); assert.ok(log.sources > 0);
});

test('sound off: cues are dropped, running voices stop and no context is created', () => {
  const {log, factory} = fakeAudio();
  const off = createSound(CUES, {createContext: factory});
  off.setEnabled(false); assert.equal(off.enabled, false);
  assert.equal(off.unlock(), false); assert.equal(log.contexts, 0, 'muted games never open audio');
  const sfx = createSound(CUES, {createContext: factory});
  sfx.unlock(); sfx.play('win');
  const before = log.sources;
  sfx.setEnabled(false);
  assert.ok(log.forcedStops > 0, 'the playing cue is cut');
  assert.equal(sfx.play('win'), false); assert.equal(log.sources, before);
  sfx.setEnabled(true); assert.equal(sfx.enabled, true);
  assert.equal(sfx.play('win'), true);
});

test('paused or hidden: silent and suspended, then resumes', () => {
  const {log, factory} = fakeAudio();
  const sfx = createSound(CUES, {createContext: factory});
  sfx.unlock();
  sfx.setSuspended(true);
  assert.equal(log.ctx.state, 'suspended'); assert.equal(sfx.play('tap'), false);
  sfx.setSuspended(false);
  assert.equal(log.ctx.state, 'running'); assert.equal(sfx.play('tap'), true);
});

test('voices are capped; finished voices free their slot', () => {
  const {log, factory} = fakeAudio();
  const sfx = createSound(CUES, {createContext: factory, maxVoices: 3});
  sfx.unlock();
  const results = Array.from({length: 5}, () => sfx.play('hit-sun'));
  assert.deepEqual(results, [true, true, true, false, false]);
  log.ctx.currentTime = 10;
  assert.equal(sfx.play('hit-sun'), true);
});

test('missing or failing WebAudio leaves the game playable', () => {
  const none = createSound(CUES, {createContext: () => null});
  assert.equal(none.unlock(), false); assert.equal(none.play('tap'), false);
  const broken = createSound(CUES, {createContext: () => { throw new Error('blocked'); }});
  assert.equal(broken.unlock(), false); assert.equal(broken.play('tap'), false);
});

test('close() releases the context; a later gesture opens a new one', () => {
  const {log, factory} = fakeAudio();
  const sfx = createSound(CUES, {createContext: factory});
  sfx.unlock(); sfx.close();
  assert.equal(log.closes, 1); assert.equal(sfx.play('tap'), false);
  sfx.unlock(); assert.equal(log.contexts, 2); assert.equal(sfx.play('tap'), true);
});

test('every cue is short, soft and playable', () => {
  for (const [id, cue] of Object.entries(CUES)) {
    assert.ok(cue.length > 0, id);
    let cursor = 0, end = 0;
    for (const tone of cue) {
      assert.ok(tone.f > 0 && tone.d > 0 && (tone.level ?? 1) <= 1, `${id} tone`);
      const start = tone.at ?? cursor; cursor = start + tone.d; end = Math.max(end, cursor);
    }
    assert.ok(end <= 1.6, `${id} lasts ${end}s`);
    const {factory} = fakeAudio();
    const sfx = createSound(CUES, {createContext: factory}); sfx.unlock();
    assert.equal(sfx.play(id), true, id);
  }
});

test('finish, element and result pick their cues; shiny finishes get the bigger shimmer', () => {
  assert.equal(revealCue(1), 'reveal-common'); assert.equal(revealCue(2), 'reveal-rare');
  assert.equal(revealCue(3), 'reveal-shiny'); assert.equal(revealCue(4), 'reveal-legend');
  const length = id => CUES[id].length;
  assert.ok(length('reveal-shiny') > length('reveal-rare') && length('reveal-legend') > length('reveal-shiny'));
  assert.deepEqual([0, 1, 2].map(e => hitCue(e, false)), ['hit-sun', 'hit-moon', 'hit-star']);
  assert.equal(hitCue(1, true), 'crit');
  assert.equal(roundCue('a', 'a'), 'round-win'); assert.equal(roundCue('b', 'a'), 'round-lose'); assert.equal(roundCue('draw', 'b'), 'round-lose');
  assert.equal(verdictCue('b', 'b'), 'win'); assert.equal(verdictCue('a', 'b'), 'lose'); assert.equal(verdictCue('draw', 'a'), 'draw');
});

test('every moment of the game has its own cue', () => {
  const moments = ['tap', 'tear', 'reveal-common', 'reveal-rare', 'reveal-shiny', 'reveal-legend', 'pocket', 'page', 'copy', 'accept',
    'hit-sun', 'hit-moon', 'hit-star', 'crit', 'round-win', 'round-lose', 'win', 'lose', 'draw', 'burn', 'error'];
  for (const id of moments) assert.ok(CUES[id], `${id} cue`);
});
