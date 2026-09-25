import test from 'node:test';
import assert from 'node:assert/strict';
import {createRushSound, MAX_VOICES} from './sound.ts';
import {cuesBetween, CHAIN_SPEED} from './cues.ts';
import {createGame, step, trackSlope, trackHeight, LAUNCH_LENGTH, MIN_SPEED} from './engine.ts';

/** Minimal WebAudio stand-in: records automation so envelopes, voices and the wind loop can be checked. */
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
const ALL = ['launch', 'perfect-launch', 'clack', 'turbo', 'item', 'boost', 'spark', 'perfect', 'good', 'bad', 'scream', 'checkpoint', 'finish', 'best'];

test('no AudioContext exists until a user gesture unlocks sound', () => {
  const audio = fakeAudio(), sfx = createRushSound({createContext: audio.createContext});
  assert.equal(sfx.enabled, true); assert.equal(sfx.unlocked, false);
  assert.equal(sfx.play('launch'), false); sfx.setWind(80); assert.equal(sfx.windPlaying, false);
  assert.equal(audio.made.length, 0);
  assert.equal(sfx.unlock(), true); assert.equal(sfx.unlock(), true); assert.equal(audio.made.length, 1);
  assert.equal(sfx.play('launch'), true); assert.equal(sfx.voices, 1);
});

test('the wind loop follows speed and stops at zero speed', () => {
  const audio = fakeAudio(), sfx = createRushSound({createContext: audio.createContext});
  sfx.unlock();
  sfx.setWind(20); assert.equal(sfx.windPlaying, true);
  const loops = () => audio.made[0].nodes.filter(n => n.kind === 'noise' && n.loop && n.started !== null);
  assert.equal(loops().length, 1);
  const level = () => audio.made[0].nodes.find(n => n.kind === 'gain' && n.gain.events.some(e => e[0] === 'target')).gain.events.at(-1)[1];
  const slow = level(); sfx.setWind(95); const fast = level();
  assert.ok(fast > slow && fast <= 1, `wind ${slow} -> ${fast}`);
  assert.equal(loops().length, 1, 'speed changes reuse the running loop');
  sfx.setWind(0); assert.equal(sfx.windPlaying, false); assert.ok(loops()[0].stopped !== null, 'loop source is stopped');
  sfx.setWind(40); assert.equal(sfx.windPlaying, true);
});

test('sound off stops cues and the wind, suspends the context; on resumes', () => {
  const audio = fakeAudio(), sfx = createRushSound({createContext: audio.createContext});
  sfx.unlock(); sfx.setWind(80); sfx.play('scream'); sfx.play('turbo');
  sfx.setEnabled(false);
  assert.equal(sfx.enabled, false); assert.equal(sfx.voices, 0); assert.equal(sfx.windPlaying, false);
  assert.equal(audio.made[0].state, 'suspended');
  sfx.setWind(80); assert.equal(sfx.windPlaying, false, 'muted wind stays off'); assert.equal(sfx.play('clack'), false);
  sfx.setEnabled(true); assert.equal(audio.made[0].state, 'running');
  sfx.setWind(80); assert.equal(sfx.windPlaying, true); assert.equal(sfx.play('clack'), true);
});

test('a muted board never creates a context, even on a gesture', () => {
  const audio = fakeAudio(), sfx = createRushSound({createContext: audio.createContext});
  sfx.setEnabled(false); assert.equal(sfx.unlock(), false); assert.equal(audio.made.length, 0);
});

test('pause or a hidden page silences cues and wind until released', () => {
  const audio = fakeAudio(), sfx = createRushSound({createContext: audio.createContext});
  sfx.unlock(); sfx.setWind(60); sfx.play('boost');
  sfx.setSilenced(true);
  assert.equal(sfx.voices, 0); assert.equal(sfx.windPlaying, false); assert.equal(audio.made[0].state, 'suspended');
  sfx.setWind(60); assert.equal(sfx.windPlaying, false); assert.equal(sfx.enabled, true);
  sfx.setSilenced(false); sfx.setWind(60); assert.equal(sfx.windPlaying, true); assert.equal(audio.made[0].state, 'running');
});

test('voices are capped, clacks are rate-limited and envelopes stay soft', () => {
  const audio = fakeAudio(), sfx = createRushSound({createContext: audio.createContext});
  sfx.unlock();
  for (let i = 0; i < 30; i++) assert.equal(sfx.play('finish'), true);
  assert.ok(sfx.voices <= MAX_VOICES && MAX_VOICES >= 3 && MAX_VOICES <= 8, `voices ${sfx.voices}`);
  sfx.stopAll(); assert.equal(sfx.voices, 0);
  assert.equal(sfx.play('clack'), true); assert.equal(sfx.play('clack'), false);
  audio.made[0].currentTime += 1; assert.equal(sfx.play('clack'), true);
  for (const id of ALL) { sfx.play(id, {gain: 3, pitch: 1.5}); sfx.stopAll(); audio.made[0].currentTime += 1; }
  const envelopes = audio.made[0].nodes.filter(n => n.kind === 'gain' && n.gain.events.some(e => e[0] === 'exp'));
  assert.ok(envelopes.length >= ALL.length);
  for (const env of envelopes) {
    const [first, attack] = env.gain.events;
    assert.deepEqual(first.slice(0, 2), ['set', 0]);
    assert.equal(attack[0], 'linear'); assert.ok(attack[1] > 0 && attack[1] <= 1);
    const end = env.gain.events.at(-1); assert.equal(end[0], 'exp'); assert.ok(end[1] <= 0.001);
  }
  assert.ok(audio.made[0].nodes.some(n => n.kind === 'compressor'), 'a limiter protects the output');
});

test('dispose stops the wind and closes the context; failures never throw', () => {
  const audio = fakeAudio(), sfx = createRushSound({createContext: audio.createContext});
  sfx.unlock(); sfx.setWind(70); sfx.dispose();
  assert.equal(sfx.windPlaying, false); assert.equal(audio.made[0].state, 'closed');
  assert.equal(sfx.play('launch'), false); assert.equal(sfx.unlock(), false);
  const broken = createRushSound({createContext: () => { throw new Error('no audio'); }});
  assert.equal(broken.unlock(), false); broken.setWind(50); assert.equal(broken.play('launch'), false);
});

const ids = cues => cues.map(c => c.id);
const running = (extra = {}) => ({...createGame(5), status: 'running', x: 300, speed: 30, grounded: true, ...extra});

test('every ride event has a cue: launch, turbo, pickups, boost, scream and checkpoints', () => {
  for (const [kind, id] of [['launch', 'launch'], ['perfect-launch', 'perfect-launch'], ['turbo', 'turbo'], ['item', 'item'], ['boost', 'boost'], ['scream', 'scream'], ['checkpoint', 'checkpoint'], ['bad', 'bad']]) {
    const next = running({time: 2, event: {kind, at: 2}});
    assert.deepEqual(ids(cuesBetween(running({time: 1.98}), next)), [id], kind);
    assert.deepEqual(cuesBetween(next, {...next, time: 2.02}), [], `${kind} plays once`);
  }
  const s = createGame(3);
  assert.deepEqual(cuesBetween(s, s), []);
});

test('landings are graded: perfect chimes, a clean landing is a soft good, rough is a crash', () => {
  const air = running({grounded: false, airTime: 1, takeoffAt: 0.2, time: 1});
  const perfect = cuesBetween(air, running({grounded: true, airTime: 1.01, takeoffAt: 0.2, perfects: 1, time: 1.02, event: {kind: 'perfect', at: 1.02}}));
  assert.deepEqual(ids(perfect), ['perfect']);
  const good = cuesBetween(air, running({grounded: true, airTime: 1.01, takeoffAt: 0.2, time: 1.02}));
  assert.deepEqual(ids(good), ['good']);
  const rough = cuesBetween(air, running({grounded: true, airTime: 1.01, takeoffAt: 0.2, time: 1.02, event: {kind: 'bad', at: 1.02}}));
  assert.deepEqual(ids(rough), ['bad']);
  const hop = cuesBetween(running({grounded: false, airTime: 1, takeoffAt: 0.95, time: 1}), running({grounded: true, airTime: 1.01, takeoffAt: 0.95, time: 1.02}));
  assert.deepEqual(hop, [], 'skimming a crest is not a landing');
});

test('sparks tick upward; the run ending plays the finish once', () => {
  const a = cuesBetween(running({sparks: 0}), running({sparks: 1, time: 0.1})), b = cuesBetween(running({sparks: 1}), running({sparks: 2, time: 0.1}));
  assert.deepEqual(ids(a), ['spark']); assert.ok(b[0].pitch > a[0].pitch);
  assert.deepEqual(ids(cuesBetween(running({timeLeft: 0.01}), running({timeLeft: 0, status: 'over', time: 9}))), ['finish']);
  const over = running({status: 'over'}); assert.deepEqual(cuesBetween(over, {...over}), []);
});

test('a slow car on the chain lift clacks with distance, and fast running does not', () => {
  assert.equal(CHAIN_SPEED, MIN_SPEED, 'the chain lift is the engine minimum speed');
  let x = LAUNCH_LENGTH + 5; while (trackSlope(x, 5) < 0.5) x += 1;
  let s = {...createGame(5), status: 'running', x, y: trackHeight(x, 5), speed: 1, grounded: true}, clacks = 0;
  for (let i = 0; i < 120; i++) { const n = step(s, {hold: false}, 1 / 60); clacks += cuesBetween(s, n).filter(c => c.id === 'clack').length; s = n; }
  assert.ok(clacks >= 2 && clacks <= 12, `clacks ${clacks}`);
  const fast = cuesBetween(running({x: 300, speed: 40}), running({x: 302, speed: 40, time: 0.05}));
  assert.deepEqual(fast.filter(c => c.id === 'clack'), []);
});
