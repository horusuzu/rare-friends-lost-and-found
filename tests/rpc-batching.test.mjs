import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createFriendPublicClient } from '../dist/wallet.js';

async function serverFor(work, rejectFirst = false) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    const body = JSON.parse(text); calls.push({ body, time: Date.now() });
    if (rejectFirst && calls.length === 1) { res.writeHead(429); res.end('Too Many Requests'); return; }
    const reply = item => ({ jsonrpc: '2.0', id: item.id, result: item.method === 'eth_chainId' ? '0x1237' : '0x100' });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(Array.isArray(body) ? body.map(reply) : reply(body)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`, calls); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('default RPC batches concurrent read-only requests into one HTTP request', async () => {
  await serverFor(async (rpcUrl, calls) => {
    const client = createFriendPublicClient({ rpcUrl });
    assert.deepEqual(await Promise.all([client.getChainId(), client.getBlockNumber({ cacheTime: 0 })]), [4663, 256n]);
    assert.equal(calls.length, 1, 'Read bursts must be batched by default');
    assert.equal(Array.isArray(calls[0].body), true);
  });
});
test('rate-limited reads back off before a bounded retry and return fresh data', async () => {
  await serverFor(async (rpcUrl, calls) => {
    const client = createFriendPublicClient({ rpcUrl });
    assert.equal(await client.getChainId(), 4663);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].time - calls[0].time >= 900, 'Allow at least a second for the public RPC to recover');
    assert.ok(client.transport.retryCount <= 4);
  }, true);
});
test('callers can explicitly disable batching for an incompatible provider', async () => {
  await serverFor(async (rpcUrl, calls) => {
    const client = createFriendPublicClient({ rpcUrl, batch: false });
    assert.equal(await client.getChainId(), 4663);
    assert.equal(Array.isArray(calls[0].body), false);
  });
});
