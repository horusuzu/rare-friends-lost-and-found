import test from 'node:test';
import assert from 'node:assert/strict';
import {createSound, CUES, soundsFor} from './sound.ts';
import {parseSave, serializeSave} from './save.ts';
import {createGame, step, PLAYER_Y} from './engine.ts';

/** A stand-in AudioContext that records what the player asks of it. */
function fakeAudio() {
  const log = {contexts: 0, sources: 0, forcedStops: 0, resumes: 0, suspends: 0, closes: 0};
  const param = () => ({value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}});
  const node = extra => ({connect: next => next, disconnect() {}, ...extra});
  const source = extra => { log.sources++; return node({start() {}, stop(when) { if (when === undefined) log.forcedStops++; }, ...extra}); };
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
  assert.equal(sfx.play('shoot'), false); assert.equal(log.contexts, 0);
  assert.equal(sfx.unlock(), true); assert.equal(sfx.unlock(), true); assert.equal(log.contexts, 1);
  assert.equal(sfx.play('shoot'), true);
});

test('sound off: cues are dropped, running voices stop and no context is created', () => {
  const {log, factory} = fakeAudio();
  const off = createSound(CUES, {createContext: factory});
  off.setEnabled(false); assert.equal(off.enabled, false); assert.equal(off.unlock(), false); assert.equal(log.contexts, 0);
  const sfx = createSound(CUES, {createContext: factory});
  sfx.unlock(); sfx.play('over'); sfx.setEnabled(false);
  assert.ok(log.forcedStops > 0); assert.equal(sfx.play('over'), false);
  sfx.setEnabled(true); assert.equal(sfx.play('over'), true);
});

test('paused or hidden: silent and suspended, then resumes', () => {
  const {log, factory} = fakeAudio();
  const sfx = createSound(CUES, {createContext: factory});
  sfx.unlock(); sfx.setSuspended(true);
  assert.equal(log.ctx.state, 'suspended'); assert.equal(sfx.play('shoot'), false);
  sfx.setSuspended(false); assert.equal(log.ctx.state, 'running'); assert.equal(sfx.play('shoot'), true);
});

test('rapid fire is capped by voices; finished voices free their slot', () => {
  const {log, factory} = fakeAudio();
  const sfx = createSound(CUES, {createContext: factory, maxVoices: 2});
  sfx.unlock();
  assert.deepEqual([1, 2, 3].map(() => sfx.play('shoot')), [true, true, false]);
  log.ctx.currentTime = 5; assert.equal(sfx.play('shoot'), true);
});

test('missing WebAudio leaves the game playable; close() releases the context', () => {
  assert.equal(createSound(CUES, {createContext: () => null}).unlock(), false);
  assert.equal(createSound(CUES, {createContext: () => { throw new Error('blocked'); }}).play('shoot'), false);
  const {log, factory} = fakeAudio();
  const sfx = createSound(CUES, {createContext: factory});
  sfx.unlock(); sfx.close(); assert.equal(log.closes, 1); assert.equal(sfx.play('shoot'), false);
  sfx.unlock(); assert.equal(log.contexts, 2);
});

test('every arcade moment has a short, soft cue', () => {
  for (const id of ['tap', 'shoot', 'hit', 'explode', 'player-hit', 'shield', 'wave', 'over', 'won', 'best']) assert.ok(CUES[id], id);
  for (const [id, cue] of Object.entries(CUES)) {
    let cursor = 0, end = 0;
    for (const tone of cue) { assert.ok(tone.f > 0 && tone.d > 0 && (tone.level ?? 1) <= 1, id); const start = tone.at ?? cursor; cursor = start + tone.d; end = Math.max(end, cursor); }
    assert.ok(end <= 1.6, `${id} lasts ${end}s`);
  }
});

test('soundsFor reads what happened between two frames', () => {
  const idle = {move: 0, fire: false, shield: false}, tick = (s, input = idle) => step(s, input, .03);
  const start = createGame();
  assert.deepEqual(soundsFor(start, tick(start)), []);
  assert.deepEqual(soundsFor(start, tick(start, {...idle, fire: true})), ['shoot']);
  assert.deepEqual(soundsFor(start, tick(start, {...idle, shield: true})), ['shield']);
  const two = {...start, enemies: [{id: 1, x: 200, y: 100, hp: 1, kind: 0}, {id: 2, x: 300, y: 100, hp: 2, kind: 1}], enemyFireCooldown: 9};
  assert.deepEqual(soundsFor(two, tick({...two, shots: [{x: 200, y: 105, enemy: false}]})), ['explode']);
  assert.deepEqual(soundsFor(two, tick({...two, shots: [{x: 300, y: 105, enemy: false}]})), ['hit']);
  const last = {...start, enemies: [{id: 1, x: 200, y: 100, hp: 1, kind: 0}], shots: [{x: 200, y: 105, enemy: false}], enemyFireCooldown: 9};
  assert.deepEqual(soundsFor(last, tick(last)), ['explode', 'wave']);
  const shot = s => ({...s, shots: [{x: s.playerX, y: PLAYER_Y - 4, enemy: true}], enemyFireCooldown: 9});
  assert.deepEqual(soundsFor(shot(start), tick(shot(start))), ['player-hit']);
  const lastLife = {...shot(start), lives: 1};
  assert.deepEqual(soundsFor(lastLife, tick(lastLife)), ['player-hit', 'over']);
  const final = {...start, wave: 5, enemies: [], enemyFireCooldown: 9};
  assert.deepEqual(soundsFor(final, tick(final)), ['won']);
  const over = tick(lastLife); assert.deepEqual(soundsFor(over, over), []);
});

test('the save keeps the best score and the sound setting; older saves load with sound on', () => {
  assert.deepEqual(parseSave(null), {best: 0, sound: true});
  assert.deepEqual(parseSave(JSON.stringify({version: 1, best: 1250})), {best: 1250, sound: true}, 'a save from before the setting plays sound');
  for (const save of [{best: 900, sound: false}, {best: 0, sound: true}]) assert.deepEqual(parseSave(serializeSave(save)), save);
  assert.equal(JSON.parse(serializeSave({best: 7, sound: false})).version, 1, 'still a version 1 save');
  for (const bad of ['off', 0, null, 1]) assert.deepEqual(parseSave(JSON.stringify({version: 1, best: 400, sound: bad})), {best: 400, sound: true}, 'a broken sound value keeps the record');
  for (const bad of [{version: 2, best: 5}, {version: 1, best: -1}, {version: 1, best: 1e9}, {version: 1, best: 1.5}, []]) assert.deepEqual(parseSave(JSON.stringify(bad)), {best: 0, sound: true});
  assert.throws(() => parseSave('{not json'), SyntaxError);
});
