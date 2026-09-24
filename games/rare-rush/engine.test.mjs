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
  const perfect = land({...onTrack(lx,0), grounded:false, y:trackHeight(lx,5)+.05, vx:v*Math.cos(ang-.08), vy:v*Math.sin(ang-.08)});
  assert.equal(perfect.grounded,true); assert.equal(perfect.event.kind,'perfect'); assert.ok(perfect.speed > v); assert.equal(perfect.perfects,1);
  const bad = land({...onTrack(lx,0), grounded:false, y:trackHeight(lx,5)+.05, vx:10, vy:-40});
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
