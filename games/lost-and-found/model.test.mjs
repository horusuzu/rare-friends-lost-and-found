import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, advance, travel, deliver, takeShortcut, routeBetween, NODES, MISSIONS } from './model.ts';

test('a new delivery starts at the post office with 90 seconds and its own identity', () => {
  const run = createRun(0, '42');
  assert.equal(run.friendId, '42');
  assert.equal(run.node, 'post');
  assert.equal(run.remaining, 90000);
  assert.equal(run.phase, 'playing');
});
test('only connected streets can be travelled and an arrival cannot teleport', () => {
  const run = createRun(0, '42');
  assert.equal(travel(run, 'lighthouse'), run);
  assert.equal(travel(run, 'plaza').node, 'plaza');
  assert.equal(travel(run, 'plaza').moves, 1);
});
test('every destination can be reached from the post office', () => {
  for (const mission of MISSIONS) {
    let run = createRun(MISSIONS.indexOf(mission), '42');
    const path = routeBetween('post', mission.destination);
    assert.ok(path.length > 1);
    for (const node of path.slice(1)) run = travel(run, node);
    assert.equal(run.node, mission.destination);
    const done = deliver(run);
    assert.equal(done.phase, 'delivered');
    assert.ok(done.stars >= 1 && done.stars <= 3);
    assert.equal(deliver(done), done);
    assert.equal(travel(done, 'plaza'), done);
  }
});
test('wrong addresses give feedback and a time penalty, never a success', () => {
  const run = travel(travel(createRun(0, '42'), 'plaza'), 'bakery');
  const wrong = deliver(run);
  assert.equal(wrong.phase, 'playing');
  assert.equal(wrong.mistakes, 1);
  assert.equal(wrong.remaining, run.remaining - 8000);
  assert.equal(wrong.feedback, 'wrong');
});
test('timeout is terminal, including an incorrect delivery at the deadline', () => {
  const run = createRun(0, '42');
  const expired = advance(run, 100000);
  assert.equal(expired.remaining, 0);
  assert.equal(expired.phase, 'expired');
  assert.equal(deliver(expired), expired);
  assert.equal(advance(expired, 500), expired);
  assert.equal(deliver(advance(travel(travel(run, 'plaza'), 'bakery'), 80000)).phase, 'expired');
});
test('paused time does not elapse, negative and non-finite deltas do nothing', () => {
  const run = createRun(0, '42');
  for (const ms of [-1, NaN, Infinity, 0]) assert.equal(advance(run, ms), run);
  assert.equal(advance(run, 5000, true), run);
  assert.equal(advance(run, 5000).remaining, 85000);
});
test('the bridge shortcut rewards timing, penalises a miss, and cannot run elsewhere', () => {
  const start = createRun(0, '42');
  assert.equal(takeShortcut(start, 0.5), start);
  const plaza = travel(start, 'plaza');
  assert.equal(takeShortcut(plaza, 0.5).node, 'lighthouse');
  assert.equal(takeShortcut(plaza, 0.1).node, 'plaza');
  assert.equal(takeShortcut(plaza, 0.1).remaining, plaza.remaining - 6000);
  assert.equal(takeShortcut(plaza, NaN), plaza);
  assert.equal(takeShortcut(advance(plaza, 100000), 0.5).phase, 'expired');
});
test('ratings reflect careful delivery, not purchased cosmetics', () => {
  let run = createRun(0, '42');
  for (const node of routeBetween('post', 'lighthouse').slice(1)) run = travel(run, node);
  assert.equal(deliver(run).stars, 3);
  assert.equal(deliver(advance(run, 60000)).stars, 2);
  assert.equal(deliver({...run, mistakes: 2}).stars, 1);
});
test('invalid identities, missions and routes fail explicitly', () => {
  for (const id of ['', '0', '-1', 'not-an-id']) assert.throws(() => createRun(0, id));
  for (const mission of [-1, 3, 0.5]) assert.throws(() => createRun(mission, '42'));
  assert.deepEqual(routeBetween('post', 'post'), ['post']);
  assert.deepEqual(routeBetween('post', 'missing'), []);
  assert.equal(deliver(createRun(0, '42')).feedback, 'street');
  assert.ok(NODES.length >= 6);
});
