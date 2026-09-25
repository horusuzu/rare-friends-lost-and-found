import test from 'node:test';
import assert from 'node:assert/strict';
import {createDropSound, MAX_VOICES} from './sound.ts';
import {cuesBetween, mergePitch, NO_COMBO} from './cues.ts';
import {createGame, step, TIERS} from './engine.ts';

/** Minimal WebAudio stand-in: records automation so envelopes and voice counts can be checked. */
function fakeAudio() {
  const made = [];
  class Param {
    constructor(v = 0) { this.value = v; this.events = []; }
    setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; return this; }
    linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); return this; }
    exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); return this; }
    setTargetAtTime(v, t, c) { this.events.push(['target', v, t, c]); return this; }
    cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
  }
  class Node {
    constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.outputs = new Set(); this.gain = new Param(1); this.frequency = new Param(440); this.Q = new Param(1); this.threshold = new Param(); this.ratio = new Param(); this.knee = new Param(); this.attack = new Param(); this.release = new Param(); this.started = null; this.stopped = null; ctx.nodes.push(this); }
    connect(n) { this.outputs.add(n); return n; }
    disconnect() { this.outputs.clear(); }
    start(t = 0) { this.started = t; }
    stop(t = 0) { this.stopped = t; }
  }
  class Ctx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.nodes = []; this.destination = new Node(this, 'destination'); made.push(this); }
    createGain() { return new Node(this, 'gain'); }
    createOscillator() { return new Node(this, 'osc'); }
    createBiquadFilter() { return new Node(this, 'filter'); }
    createDynamicsCompressor() { return new Node(this, 'compressor'); }
    createBufferSource() { return new Node(this, 'noise'); }
    createBuffer(ch, len) { const data = new Float32Array(len); return {getChannelData: () => data}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  return {made, createContext: () => new Ctx()};
}

test('no AudioContext exists until a user gesture unlocks sound', () => {
  const audio = fakeAudio(), sfx = createDropSound({createContext: audio.createContext});
  assert.equal(sfx.enabled, true); assert.equal(sfx.unlocked, false);
  assert.equal(sfx.play('drop'), false, 'locked boards stay silent');
  assert.equal(audio.made.length, 0);
  assert.equal(sfx.unlock(), true); assert.equal(sfx.unlock(), true);
  assert.equal(audio.made.length, 1, 'one lazily created context');
  assert.equal(sfx.play('drop'), true); assert.equal(sfx.voices, 1);
});

test('sound off stops voices, suspends the context and ignores cues; on resumes', () => {
  const audio = fakeAudio(), sfx = createDropSound({createContext: audio.createContext});
  sfx.unlock(); sfx.play('merge', {pitch: 2}); sfx.play('over');
  sfx.setEnabled(false);
  assert.equal(sfx.enabled, false); assert.equal(sfx.voices, 0);
  assert.equal(audio.made[0].state, 'suspended');
  assert.equal(sfx.play('drop'), false);
  sfx.setEnabled(true);
  assert.equal(audio.made[0].state, 'running'); assert.equal(sfx.play('drop'), true);
});

test('a muted board never creates a context, even on a gesture', () => {
  const audio = fakeAudio(), sfx = createDropSound({createContext: audio.createContext});
  sfx.setEnabled(false);
  assert.equal(sfx.unlock(), false); assert.equal(audio.made.length, 0);
  sfx.setEnabled(true); assert.equal(sfx.unlock(), true); assert.equal(audio.made.length, 1);
});

test('pause or a hidden page silences everything until released', () => {
  const audio = fakeAudio(), sfx = createDropSound({createContext: audio.createContext});
  sfx.unlock(); sfx.play('danger');
  sfx.setSilenced(true);
  assert.equal(sfx.voices, 0); assert.equal(audio.made[0].state, 'suspended'); assert.equal(sfx.play('drop'), false);
  assert.equal(sfx.enabled, true, 'silencing is not the saved setting');
  sfx.setSilenced(false); assert.equal(audio.made[0].state, 'running'); assert.equal(sfx.play('drop'), true);
});

test('simultaneous voices are capped and repeated landings are rate-limited', () => {
  const audio = fakeAudio(), sfx = createDropSound({createContext: audio.createContext});
  sfx.unlock();
  for (let i = 0; i < 30; i++) assert.equal(sfx.play('big', {pitch: 1 + i / 30}), true);
  assert.ok(sfx.voices <= MAX_VOICES, `voices ${sfx.voices}`);
  assert.ok(MAX_VOICES >= 3 && MAX_VOICES <= 8);
  sfx.stopAll(); assert.equal(sfx.voices, 0);
  assert.equal(sfx.play('land', {gain: 1}), true);
  assert.equal(sfx.play('land', {gain: 1}), false, 'land has a minimum gap');
  audio.made[0].currentTime += 0.5;
  assert.equal(sfx.play('land', {gain: 1}), true);
  audio.made[0].currentTime += 5;
  assert.equal(sfx.play('drop'), true); assert.equal(sfx.voices, 1, 'finished voices are released');
});

test('every cue uses a soft envelope that starts and ends near silence and never exceeds unity', () => {
  const audio = fakeAudio(), sfx = createDropSound({createContext: audio.createContext});
  sfx.unlock();
  for (const id of ['drop', 'land', 'merge', 'big', 'friend', 'combo', 'danger', 'over', 'best']) { sfx.play(id, {gain: 3, pitch: 1.5}); sfx.stopAll(); }
  const envelopes = audio.made[0].nodes.filter(n => n.kind === 'gain' && n.gain.events.some(e => e[0] === 'exp'));
  assert.ok(envelopes.length >= 9);
  for (const env of envelopes) {
    const [first, attack] = env.gain.events;
    assert.deepEqual(first.slice(0, 2), ['set', 0], 'starts from silence');
    assert.equal(attack[0], 'linear'); assert.ok(attack[1] > 0 && attack[1] <= 1, `peak ${attack[1]}`);
    const end = env.gain.events.at(-1); assert.equal(end[0], 'exp'); assert.ok(end[1] <= 0.001);
  }
  const master = audio.made[0].nodes.find(n => n.kind === 'compressor');
  assert.ok(master, 'a limiter protects the output');
});

test('dispose closes the context and a failing context never throws', () => {
  const audio = fakeAudio(), sfx = createDropSound({createContext: audio.createContext});
  sfx.unlock(); sfx.play('drop'); sfx.dispose();
  assert.equal(audio.made[0].state, 'closed'); assert.equal(sfx.play('drop'), false); assert.equal(sfx.unlock(), false);
  const broken = createDropSound({createContext: () => { throw new Error('no audio'); }});
  assert.equal(broken.unlock(), false); assert.equal(broken.play('drop'), false);
  const missing = createDropSound({createContext: () => null});
  assert.equal(missing.unlock(), false);
});

const ids = cues => cues.map(c => c.id);
const base = (extra = {}) => ({...createGame(1), ...extra});

test('dropping an orb plays a drop cue; idle frames are silent', () => {
  const s = createGame(4), dropped = step(s, {move: 0, aim: null, drop: true}, 0.016);
  assert.deepEqual(ids(cuesBetween(s, dropped, NO_COMBO).cues), ['drop']);
  const later = step(dropped, {move: 0, aim: null, drop: false}, 0.016);
  assert.deepEqual(cuesBetween(dropped, later, NO_COMBO).cues.filter(c => c.id === 'drop'), []);
  assert.deepEqual(cuesBetween(s, s, NO_COMBO).cues, []);
});

test('landings are soft thuds scaled by impact; resting jitter is silent', () => {
  const body = (vy) => ({id: 1, tier: 3, x: 200, y: 500, vx: 0, vy, age: 1});
  const hard = cuesBetween(base({bodies: [body(900)]}), base({bodies: [body(-40)]}), NO_COMBO).cues;
  const soft = cuesBetween(base({bodies: [body(300)]}), base({bodies: [body(0)]}), NO_COMBO).cues;
  assert.deepEqual(ids(hard), ['land']); assert.deepEqual(ids(soft), ['land']);
  assert.ok(hard[0].gain > soft[0].gain && hard[0].gain <= 1);
  assert.deepEqual(cuesBetween(base({bodies: [body(40)]}), base({bodies: [body(0)]}), NO_COMBO).cues, []);
});

test('merge pitch rises with tier; big merges and the Friend add fanfare', () => {
  for (let t = 2; t < TIERS; t++) assert.ok(mergePitch(t + 1) > mergePitch(t), `tier ${t + 1}`);
  const merged = tier => cuesBetween(base(), base({merges: 1, time: 1, pops: [{x: 0, y: 0, tier, age: 0}]}), NO_COMBO).cues;
  const small = merged(3);
  assert.deepEqual(ids(small), ['merge']); assert.equal(small[0].pitch, mergePitch(3));
  assert.deepEqual(ids(merged(7)), ['merge', 'big']);
  assert.deepEqual(ids(merged(TIERS)), ['merge', 'friend']);
  const two = cuesBetween(base(), base({merges: 2, time: 1, pops: [{x: 0, y: 0, tier: 2, age: 0}, {x: 0, y: 0, tier: 5, age: 0}]}), NO_COMBO).cues;
  assert.equal(two.find(c => c.id === 'merge').pitch, mergePitch(5), 'the highest merge leads');
});

test('quick chains of merges build a combo whose pitch climbs', () => {
  let combo = NO_COMBO, prev = base(), played = [];
  for (let i = 1; i <= 5; i++) {
    const next = base({merges: i, time: i * 0.3, pops: [{x: 0, y: 0, tier: 2, age: 0}]});
    const out = cuesBetween(prev, next, combo); combo = out.combo; prev = next;
    played.push(...out.cues.filter(c => c.id === 'combo'));
  }
  assert.ok(played.length >= 2, 'combo plays from the third quick merge');
  assert.ok(played.at(-1).pitch > played[0].pitch);
  const slow = cuesBetween(prev, base({merges: 6, time: 10, pops: [{x: 0, y: 0, tier: 2, age: 0}]}), combo);
  assert.equal(slow.combo.count, 1, 'a pause resets the chain'); assert.ok(!ids(slow.cues).includes('combo'));
});

test('the danger line pulses faster as the jar fills, then game over plays once', () => {
  const start = cuesBetween(base({danger: 0}), base({danger: 0.02}), NO_COMBO).cues;
  assert.deepEqual(ids(start), ['danger']);
  assert.deepEqual(cuesBetween(base({danger: 0.02}), base({danger: 0.04}), NO_COMBO).cues, []);
  const later = cuesBetween(base({danger: 0.98}), base({danger: 1.02}), NO_COMBO).cues;
  assert.deepEqual(ids(later), ['danger']); assert.ok(later[0].pitch > start[0].pitch);
  const over = cuesBetween(base({danger: 1.99}), base({danger: 2.01, status: 'over'}), NO_COMBO).cues;
  assert.deepEqual(ids(over), ['over']);
  assert.deepEqual(cuesBetween(base({status: 'over'}), base({status: 'over'}), NO_COMBO).cues, []);
});
