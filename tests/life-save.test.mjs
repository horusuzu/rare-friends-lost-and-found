import test from 'node:test';
import assert from 'node:assert/strict';
import * as bridge from '../dist/frame-bridge.js';
const definition = { name: 'Life', consumable: 'Day', price: 1n, outcomes: [{ name: 'Day', chanceBps: 10000, reward: 1n }] };
function session(extra = {}, mode = 'preview') {
  const { port1, port2 } = new MessageChannel();
  const host = bridge.bindGameFrame(port1, { client: { definition, mode, ...extra }, authorize: async () => { throw Error('must not prompt'); } });
  const frame = bridge.createFrameGameClient(port2, definition, undefined, mode);
  return { host, frame, close() { host.close(); frame.close(); } };
}
test('local preview save round trips and rejects invalid or oversized payloads', async () => {
  let saved = null;
  const s = session({ loadLocal: async () => saved, saveLocal: async value => { saved = value; } });
  try {
    assert.equal(typeof s.frame.client.saveLocal, 'function');
    assert.equal(await s.frame.client.loadLocal(), null);
    await s.frame.client.saveLocal('{"day":2}');
    assert.equal(await s.frame.client.loadLocal(), '{"day":2}');
    for (const value of [null, {}, 5, 'x'.repeat(32769), 'あ'.repeat(11000)]) await assert.rejects(s.frame.client.saveLocal(value), /Unsupported/);
    assert.equal(saved, '{"day":2}');
    s.host.setPaused(true);
    await assert.rejects(s.frame.client.saveLocal('paused'), /Close the host menu/);
    assert.equal(await s.frame.client.loadLocal(), saved);
  } finally { s.close(); }
});
test('unavailable storage and private errors are public, and chain has no save capability', async () => {
  for (const extra of [{}, { loadLocal: async () => { throw Error('SECRET'); }, saveLocal: async () => { throw Error('SECRET'); } }, { loadLocal: async () => 'あ'.repeat(11000) }]) {
    const s = session(extra);
    try { await assert.rejects(s.frame.client.loadLocal(), /Local preview storage is unavailable/); await assert.rejects(s.frame.client.saveLocal('x'), /Local preview storage is unavailable/); }
    finally { s.close(); }
  }
  const s = session({}, 'chain');
  try { assert.equal(s.frame.client.saveLocal, undefined); assert.equal(s.frame.client.loadLocal, undefined); } finally { s.close(); }
});
test('closed sessions reject pending reads and stale saves', async () => {
  let resolveRead, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  let writes = 0;
  const s = session({ loadLocal: () => { entered(); return new Promise(resolve => { resolveRead = resolve; }); }, saveLocal: async () => { writes++; } });
  try {
    const read = s.frame.client.loadLocal(); const rejected = assert.rejects(read, /session changed/);
    await ready; s.host.close(); resolveRead(null); await rejected;
    await assert.rejects(s.frame.client.saveLocal('stale'), /session changed/); assert.equal(writes, 0);
  } finally { s.close(); }
});
test('trusted namespace separates games and NFTs, with active-session storage checks', async () => {
  assert.equal(typeof bridge.createPreviewLocalStore, 'function');
  const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let active = true;
  const make = (url, id, wallet = '0xabc') => bridge.createPreviewLocalStore({ frameUrl: url, friendId: id, walletAddress: wallet, storage: () => storage, assertActive: () => { if (!active) throw Error('Game session changed.'); } });
  const first = make('https://game.test/a', 1n); await first.saveLocal('first');
  assert.equal(await make('https://game.test/a', 1n, '0xABC').loadLocal(), 'first');
  assert.equal(await make('https://game.test/b', 1n).loadLocal(), null);
  assert.equal(await make('https://game.test/a', 2n).loadLocal(), null);
  active = false; await assert.rejects(first.saveLocal('stale'), /session changed/); assert.deepEqual([...values.values()], ['first']);
});
test('raw callers cannot supply a key or use local storage from a chain session', async () => {
  for (const mode of ['preview', 'chain']) {
    const { port1, port2 } = new MessageChannel(); let writes = 0;
    const host = bridge.bindGameFrame(port1, { client: { definition, mode, saveLocal: async () => { writes++; } }, authorize: async () => {} });
    port2.start();
    try {
      const response = new Promise(resolve => { port2.onmessage = event => resolve(event.data); });
      port2.postMessage({ type: 'friendsdk:request', id: 1, method: 'saveLocal', args: mode === 'chain' ? ['value'] : ['arbitrary-key', 'value'] });
      assert.match((await response).error, mode === 'chain' ? /storage is unavailable/ : /Unsupported/); assert.equal(writes, 0);
    } finally { host.close(); port2.close(); }
  }
});
test('storage getter failures and write quotas reject rather than report a save', async () => {
  for (const storage of [() => { throw Error('private-access-detail'); }, () => ({ getItem: () => null, setItem: () => { throw Error('private-quota-detail'); } })]) {
    const local = bridge.createPreviewLocalStore({ frameUrl: 'https://game.test/a', friendId: 1n, walletAddress: '0xabc', storage, assertActive() {} });
    const s = session(local);
    try { await assert.rejects(s.frame.client.saveLocal('value'), { message: 'Local preview storage is unavailable.' }); } finally { s.close(); }
  }
});
