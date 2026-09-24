import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, trackHeight, trackSlope, trackPoints, ringsBetween, LAUNCH_LENGTH, START_TIME, CHECKPOINT_EVERY, CHECKPOINT_BONUS, MIN_SPEED, MAX_SPEED, FUJI_HEIGHT, kmh} from './engine.ts';
const up = {hold:false}, down = {hold:true};
const run = (s, seconds, input=up) => { for (let t=0; t<seconds-1e-9; t+=1/60) s = step(s,input,1/60); return s; };
const launch = (s, heldSeconds) => step(run(s, heldSeconds, down), up, 1/60);
const onTrack = (x, speed, extra={}) => ({...createGame(5), status:'running', x, y:trackHeight(x,5), vx:0, vy:0, speed, grounded:true, ...extra});

test('track is deterministic, continuous and smooth, with a flat launch rail and a 79 m drop', () => {
  assert.equal(trackHeight(10,1), 0); assert.equal(trackSlope(10,1), 0);
  for (const x of [LAUNCH_LENGTH+3, 400, 1234.5, 5000]) {
    assert.equal(trackHeight(x,9), trackHeight(x,9));
    assert.ok(Math.abs(trackHeight(x+.01,9)-trackHeight(x,9)) < .05, `continuous at ${x}`);
    const numeric = (trackHeight(x+.001,9)-trackHeight(x-.001,9))/.002;
    assert.ok(Math.abs(numeric-trackSlope(x,9)) < .01, `slope matches at ${x}`);
  }
  assert.notEqual(trackHeight(700,1), trackHeight(700,2));
  const points = trackPoints(40,3);
  assert.ok(points.every((p,i)=>i===0||p.x>points[i-1].x));
  assert.ok(points.some(p=>p.y===FUJI_HEIGHT), 'contains a FUJI-height crest');
  assert.equal(FUJI_HEIGHT, 79);
});

test('new game waits on the launch rail; invalid time is ignored; inputs are not mutated', () => {
  const s = createGame(3), before = structuredClone(s);
  assert.equal(s.status,'launch'); assert.equal(s.timeLeft, START_TIME); assert.equal(s.score, 0);
  const n = run(s, 3, up); assert.equal(n.status,'launch'); assert.equal(n.timeLeft, START_TIME); assert.equal(n.x, s.x);
  step(s, down, 1/60); assert.deepEqual(s, before);
  assert.equal(step(s,down,NaN), s); assert.equal(step(s,down,-1), s); assert.equal(step(s,down,0), s);
});

test('launch: holding builds pressure that peaks then falls; releasing at the peak is a perfect launch', () => {
  const s = createGame(3);
  const half = run(s, .6, down); assert.ok(half.pressure > .4 && half.pressure < .6);
  const peak = run(s, 1.2, down); assert.ok(peak.pressure > .97);
  const over = run(s, 1.8, down); assert.ok(over.pressure < .6, 'overshoot loses pressure');
  const perfect = launch(s, 1.2), weak = launch(s, .3);
  assert.equal(perfect.status,'running'); assert.equal(weak.status,'running');
  assert.ok(perfect.speed > weak.speed + 20);
  assert.ok(kmh(perfect.speed) >= 200, `perfect launch ${kmh(perfect.speed)} km/h`);
  assert.equal(perfect.event.kind,'perfect-launch'); assert.equal(weak.event.kind,'launch');
  assert.equal(step(s, up, 1/60).status, 'launch', 'release without holding does nothing');
});

test('on the track gravity accelerates downhill, slows uphill; diving strengthens both; lift keeps a minimum speed', () => {
  let x = LAUNCH_LENGTH + 5, downhill = null, uphill = null;
  for (; x < 3000 && (!downhill || !uphill); x += 1) {
    const slope = trackSlope(x,5);
    if (!downhill && slope < -.5) downhill = x;
    if (!uphill && slope > .5) uphill = x;
  }
  const dFree = step(onTrack(downhill,30),up,1/60).speed, dDive = step(onTrack(downhill,30),down,1/60).speed;
  const uFree = step(onTrack(uphill,30),up,1/60).speed, uDive = step(onTrack(uphill,30),down,1/60).speed;
  assert.ok(dFree > 30 && dDive > dFree, `downhill ${dFree} ${dDive}`);
  assert.ok(uFree < 30 && uDive < uFree, `uphill ${uFree} ${uDive}`);
  const slow = run(onTrack(uphill, 1), 1); assert.ok(slow.speed >= MIN_SPEED && slow.x > uphill, 'chain lift carries a slow car');
  const fast = run(onTrack(downhill, MAX_SPEED*2), .1, down); assert.ok(fast.speed <= MAX_SPEED);
});

test('cresting fast launches the car into the air; diving keeps it on the rail; landing grades the angle', () => {
  const crest = trackPoints(6,5).find((p,i)=>i>0 && p.y>20).x;
  const air = run(onTrack(crest-3, 55), .2, up);
  assert.equal(air.grounded,false,'released over a crest at speed flies'); assert.ok(air.airTime > 0);
  const glued = run(onTrack(crest-3, 22), .2, down); assert.equal(glued.grounded,true);
  // Perfect landing: velocity matches the slope.
  const lx = crest + 40, slope = trackSlope(lx,5), v = 40, ang = Math.atan(slope);
  const land = s => { for (let i=0;i<60&&!s.grounded;i++) s = step(s, up, 1/60); return s; };
  const perfect = land({...onTrack(lx,0), grounded:false, takeoffAt:-1, y:trackHeight(lx,5)+.05, vx:v*Math.cos(ang-.08), vy:v*Math.sin(ang-.08)});
  assert.equal(perfect.grounded,true); assert.equal(perfect.event.kind,'perfect'); assert.ok(perfect.speed > v); assert.equal(perfect.perfects,1);
  const bad = land({...onTrack(lx,0), grounded:false, takeoffAt:-1, y:trackHeight(lx,5)+.05, vx:3, vy:-50});
  assert.equal(bad.grounded,true); assert.equal(bad.event.kind,'bad'); assert.ok(bad.speed < 25);
});

test('sparks and boost gates are collected once; boost gates add speed', () => {
  const rings = ringsBetween(0, 3000, 5); assert.ok(rings.length > 10);
  assert.deepEqual(rings, ringsBetween(0,3000,5));
  const spark = rings.find(r=>r.kind==='spark'), gate = rings.find(r=>r.kind==='gate');
  assert.ok(spark && gate);
  let s = {...onTrack(spark.x,20), grounded:false, x:spark.x, y:spark.y, vx:20, vy:0};
  s = step(s, up, 1/60); assert.equal(s.sparks,1); assert.ok(s.collected.includes(spark.id));
  s = step({...s, x:spark.x, y:spark.y, vx:20, vy:0, grounded:false}, up, 1/60); assert.equal(s.sparks,1,'not twice');
  const g = step(onTrack(gate.x-.1, 30), up, 1/60); assert.ok(g.speed > 40); assert.equal(g.event.kind,'boost');
});

test('checkpoints extend time; the run ends when time is out and then freezes', () => {
  let s = onTrack(CHECKPOINT_EVERY-.2, 40, {timeLeft:5, nextCheckpoint:CHECKPOINT_EVERY});
  s = step(s, up, 1/60); assert.ok(s.timeLeft > 5 + CHECKPOINT_BONUS - .1); assert.equal(s.nextCheckpoint, CHECKPOINT_EVERY*2); assert.equal(s.event.kind,'checkpoint');
  const over = run(onTrack(LAUNCH_LENGTH+5, 20, {timeLeft:.1}), .2);
  assert.equal(over.status,'over'); assert.equal(over.timeLeft,0); assert.equal(step(over,down,1/60), over);
});

test('speed and air fill the scream meter; scream mode doubles scoring for a while', () => {
  let s = onTrack(LAUNCH_LENGTH+5, 90, {scream:.99});
  s = run(s, .2); assert.ok(s.screamTime > 0); assert.equal(s.event.kind,'scream'); assert.ok(s.scream < .5);
  const base = onTrack(LAUNCH_LENGTH+5, 30), boosted = {...base, screamTime:5};
  const a = step(base,up,1/60), b = step(boosted,up,1/60);
  assert.ok(b.score - boosted.score > (a.score - base.score) * 1.9);
  assert.ok(run(onTrack(LAUNCH_LENGTH+5,30,{screamTime:.1}),.3).screamTime === 0);
  assert.ok(s.maxSpeed >= 85);
});

test('a long autoplay run stays finite, moves forward and scores', () => {
  let s = launch(createGame(7), 1.2);
  for (let i=0;i<60*40 && s.status==='running';i++) s = step(s, {hold: s.grounded ? trackSlope(s.x,7) < 0 : s.vy < 0}, 1/60);
  assert.ok(s.maxSpeed <= MAX_SPEED + 1e-9, `max ${s.maxSpeed}`);
  assert.ok([s.x,s.y,s.vx,s.vy,s.speed,s.score].every(Number.isFinite));
  assert.ok(s.distance > 800, `distance ${s.distance}`); assert.ok(s.score > 0);
  assert.ok(s.y >= trackHeight(s.x,7) - .01);
});

test('a hop of a few milliseconds is not graded: no bonus, no toast, no penalty', () => {
  const crest = trackPoints(6,5).find((p,i)=>i>0 && p.y>20).x, lx = crest + 40, ang = Math.atan(trackSlope(lx,5));
  const hop = {...onTrack(lx,0), grounded:false, airTime:3, takeoffAt:3, y:trackHeight(lx,5)+.01, vx:40*Math.cos(ang-.05), vy:40*Math.sin(ang-.05)};
  let s = hop; for (let i=0;i<10&&!s.grounded;i++) s = step(s, up, 1/60);
  assert.equal(s.grounded,true); assert.equal(s.perfects,0); assert.equal(s.event,null); assert.ok(Math.abs(s.speed-40) < 3);
  // Holding over every crest must not farm perfect landings.
  let h = launch(createGame(7), 1.2);
  for (let i=0;i<60*40 && h.status==='running';i++) h = step(h, down, 1/60);
  assert.ok(h.perfects <= 3, `hold-everywhere perfects ${h.perfects}`);
});

test('boost gates in the air respect the speed cap', () => {
  const gate = ringsBetween(0, 3000, 5).find(r=>r.kind==='gate');
  const s = step({...onTrack(gate.x-.1,0), grounded:false, x:gate.x-.1, y:gate.y, vx:MAX_SPEED, vy:0, takeoffAt:-1}, up, 1/120);
  assert.ok(Math.hypot(s.vx,s.vy) <= MAX_SPEED + 1e-9); assert.ok(s.maxSpeed <= MAX_SPEED + 1e-9);
});

test('turbo: start with one, collect capsules up to three, fire for a burst above the normal cap', async () => {
  const {TURBO_MAX_SPEED, MAX_TURBOS} = await import('./engine.ts');
  const fresh = createGame(5); assert.equal(fresh.turbos, 1);
  assert.equal(step(fresh, {hold:false, turbo:true}, 1/60).turbos, 1, 'cannot fire on the launch rail');
  const capsule = ringsBetween(0, 4000, 5).find(r=>r.kind==='turbo'); assert.ok(capsule, 'capsules exist on the track');
  let s = step({...onTrack(capsule.x,20), grounded:false, x:capsule.x, y:capsule.y, vx:20, vy:0, takeoffAt:-1}, up, 1/60);
  assert.equal(s.turbos, 2); assert.equal(s.event.kind, 'item');
  s = step({...s, x:capsule.x, y:capsule.y, vx:20, vy:0, grounded:false}, up, 1/60); assert.equal(s.turbos, 2, 'not twice');
  assert.equal(step({...s, x:capsule.x, y:capsule.y, turbos:MAX_TURBOS, collected:[]}, up, 1/60).turbos, MAX_TURBOS, 'stock caps at three');
  const flat = onTrack(LAUNCH_LENGTH+5, 40, {turbos:1});
  const fired = step(flat, {hold:false, turbo:true}, 1/60);
  assert.equal(fired.turbos, 0); assert.ok(fired.turboTime > 1.5); assert.ok(fired.speed >= 58); assert.equal(fired.event.kind, 'turbo');
  const held = step(fired, {hold:false, turbo:true}, 1/60); assert.equal(held.turboTime < fired.turboTime, true, 'holding the key does not refire');
  assert.equal(step(onTrack(LAUNCH_LENGTH+5, 40, {turbos:0}), {hold:false, turbo:true}, 1/60).turboTime, 0, 'empty stock does nothing');
  let burst = onTrack(LAUNCH_LENGTH+5, MAX_SPEED, {turbos:1}); burst = step(burst, {hold:false, turbo:true}, 1/60);
  burst = run(burst, .8); assert.ok(burst.speed > MAX_SPEED + 5 && burst.speed <= TURBO_MAX_SPEED, `turbo speed ${burst.speed}`);
  const after = run(burst, 3); assert.equal(after.turboTime, 0); assert.ok(after.speed <= MAX_SPEED + 1e-9, 'settles back under the normal cap');
  // Uphill during turbo still gains.
  let x = LAUNCH_LENGTH + 5; while (trackSlope(x,5) < .5) x += 1;
  const climb = step(step(onTrack(x, 30, {turbos:1}), {hold:false, turbo:true}, 1/60), up, 1/60);
  assert.ok(climb.speed > 30);
});

test('turbo fired in the air pushes forward too', () => {
  const air = {...onTrack(LAUNCH_LENGTH+300, 0), grounded:false, y:trackHeight(LAUNCH_LENGTH+300,5)+40, vx:40, vy:0, turbos:1, takeoffAt:-1};
  const fired = step(air, {hold:false, turbo:true}, 1/60);
  assert.ok(fired.vx > 55); assert.equal(fired.turbos, 0); assert.equal(fired.event.kind, 'turbo');
});
